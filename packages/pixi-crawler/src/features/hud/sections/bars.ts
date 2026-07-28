import {
  COLOR_GPU,
  COLOR_OVERRUN,
  COLOR_PIXI,
  COLOR_PRE,
  COLOR_SPINE,
} from "../../../shared/colors";

// `performance.now()` resolution: clamped to ~100µs normally, but 5µs when the
// document is cross-origin isolated (COOP+COEP). Below ~a few quanta a single
// reading is timer noise - flag it in the tooltip. Threshold adapts so we don't
// over-warn under COI (where sub-0.1ms phases ARE trustworthy). Read once: COI is
// fixed for the document lifetime.
const COI =
  typeof globalThis !== "undefined" &&
  (globalThis as { crossOriginIsolated?: boolean }).crossOriginIsolated ===
    true;
const TIMER_RES_MS = COI ? 0.02 : 0.1;

/** Static color legend for the frame-breakdown bars (top-level segments). */
export function makeBarLegend(): HTMLDivElement {
  const wrap = document.createElement("div");
  wrap.className = "sbc-legend";
  const items: [string, string][] = [
    ["pre-pixi", COLOR_PRE],
    ["pixi", COLOR_PIXI],
    ["spine", COLOR_SPINE],
    ["gpu", COLOR_GPU],
  ];
  for (const [label, color] of items) {
    const item = document.createElement("span");
    item.className = "sbc-legend-item";
    const dot = document.createElement("span");
    dot.className = "sbc-legend-dot";
    dot.style.background = color;
    const text = document.createElement("span");
    text.textContent = label;
    item.append(dot, text);
    wrap.append(item);
  }
  return wrap;
}

export interface BarItem {
  label: string;
  ms: number;
  color: string;
  depth: number;
  isHeader?: boolean;
  /** Info row - lies INSIDE another parent's ms, not a separate item in sum.
   *  Visually dimmer + dashed bar. The label usually contains a "(in X)" hint. */
  info?: boolean;
  /** Pure separator line - draws only the label, no bar/ms. */
  separator?: boolean;
  /** Parent's ms for % display. When set, the % overlay shows
   *  `ms / parentMs x 100` (share of parent). Without it - % of budget. Top-level
   *  rows (depth 0) -> undefined -> % budget. */
  parentMs?: number;
  /** Stable collapse identity - used as the `_collapsed`/dataset key instead of
   *  the display label, so collapse state survives label changes (counts like
   *  "spine cpu · 3 inst" mutate the label every frame). Defaults to `label`. */
  collapseKey?: string;
  /** Set by render pipeline when next item has higher depth (item is parent
   *  of subsequent children). Triggers click handler attachment + ▾/▸ marker. */
  hasChildren?: boolean;
  /** Set when collapseKey in `_collapsed` set. Renders ▸ marker; children skipped. */
  isCollapsed?: boolean;
  /** Human-readable explanation surfaced on hover (the visible label stays
   *  short - the bar column truncates). Filled via `barTip(label)`. */
  tip?: string;
}

// Per-row explanations surfaced as tooltips. Visible labels stay terse (column
// truncates with ellipsis); the "why/what" lives here. Keyed by the EXACT static
// label; dynamic rows (per-pipe, spine/audio/loaf headers carrying counts) are
// matched by prefix in `barTip`.
const STATIC_BAR_TIPS: Record<string, string> = {
  prePixi:
    "Pre-render window: from tickStart (our INTERACTION listener, ≈ rAF start) to the first Pixi mark. HIGH/NORMAL app.ticker listeners run here.",
  pixi: "Pixi render window: Σ of the 5 runner phases (prerender->postrender tail). The renderer's own per-frame CPU work.",
  postPixi:
    "Post-render window: our tickEnd -> next frame's tickStart. Ticker.shared work + browser style/layout/composite + vsync idle.",
  boilerplate:
    "Runner phase marks outside the render body: prerender + renderStart + renderEnd + postrender tail (gc excluded).",
  prerender: "runner.prerender phase - per-frame setup before the render body.",
  renderStart: "runner.renderStart phase - start of the render body.",
  renderEnd: "runner.renderEnd phase - pipe teardown after the render body.",
  "postrender tail":
    "runner.postrender minus gc - cleanup tail after rendering.",
  transforms:
    "World-matrix propagation inside _updateRenderGroups. DERIVED: outer total − build − update − upload (updateRenderGroupTransforms can't be hooked directly).",
  "build+upd+upload":
    "Render-data prep cluster = buildInstructions + updateRenderables + batchUpload.",
  buildInstr:
    "RenderGroupSystem._buildInstructions - rebuild a render group's instruction set (fires on structureDidChange; Spine forces it every frame).",
  updateRend:
    "RenderGroupSystem._updateRenderables - refresh renderable data without a full instruction rebuild.",
  batchUpload:
    "BatcherPipe.upload - upload batched geometry/attributes to GPU buffers.",
  "spine pipe (in build+upd)":
    "SpinePipe.{add,update,validate}Renderable self-time, called from build/update. INFO - already inside buildInstr/updateRend, not additive.",
  pipeAdd:
    "SpinePipe.addRenderable self-time (attachment work carved out via child-time accounting).",
  pipeUpdate: "SpinePipe.updateRenderable self-time.",
  pipeValidate: "SpinePipe.validateRenderable self-time.",
  "attach (of pipe incl.)":
    "Attachment validate+transform time, nested INSIDE the pipe methods. Shown as % of inclusive pipe (self + attach). INFO - not additive (double-counts if summed with pipe).",
  execute:
    "executeInstructions - dispatch of render instructions; each pipe's execute() runs here (where GL draw calls fire).",
  "render-other":
    "renderMs not attributed to transforms / build / execute - residual + timer noise.",
  gc: "renderer.gc.run wall-clock - texture GC sweep (TextureGCSystem replacement).",
  "user listeners + idle":
    "prePixi minus spine-cpu - other HIGH/NORMAL app.ticker listeners + gaps.",
  "other ticker.shared":
    "Non-Spine Ticker.shared work (game update logic on Ticker.shared). Measured via a UTILITY marker at the end of the Ticker.shared tick.",
  "composite + vsync idle":
    "postPixi minus all Ticker.shared work: browser style/layout/paint/composite + idle wait until the next vsync. NOT splittable per-frame - no web API exposes paint/composite for healthy frames (only LoAF, >50 ms).",
  "browser composite + idle":
    "postPixi minus spine-cpu - browser style/layout/composite, UTILITY listeners, vsync idle. Residual bucket.",
  "animState.update": "AnimationState.update - advance animation tracks.",
  "skeleton.prePhysics":
    "Skeleton.update - pre-physics pass (~0 ms without physics constraints).",
  "animState.apply":
    "AnimationState.apply - apply animated tracks onto the skeleton.",
  worldTransform:
    "Skeleton.updateWorldTransform - recompute bone world matrices. Usually the dominant Spine CPU cost.",
  slotObjects:
    "Spine.updateSlotObjects - sync container attachments (0 ms without container attachments).",
  GPU: "GPU frame time via EXT_disjoint_timer_query_webgl2. Runs in PARALLEL with CPU - not part of the partition sum. Patched in 1-3 frames late.",
  "Assets.load (async)":
    "Assets.load wall-clock - background async work, OUTSIDE the frame partition.",
  // filter sub-rows
  push: "FilterSystem.push - allocate filter render target + redirect rendering into it.",
  apply: "FilterSystem.applyFilter - run the filter shader pass.",
  pop: "FilterSystem.pop - apply the result + blit back to the parent target.",
  // LoAF sub-rows
  script:
    "LoAF script time: renderStart − startTime (or full duration if renderStart=0).",
  "style+layout": "LoAF style+layout: renderStart − styleAndLayoutStart.",
  render: "LoAF render: (startTime + duration) − renderStart.",
  blocking:
    "LoAF blockingDuration - main-thread blocking within the long frame.",
};

function perPipeTip(pipe: string): string {
  switch (pipe) {
    case "batch":
      return "Batch pipe - merged sprite/graphics draws. N× = execute invocations, Mdc = draw calls; rb = instruction rebuilds, br = batch breaks (state/texture/shader switches).";
    case "filter":
      return 'Filter pipe execute slice (instruction dispatch). The FULL FilterSystem cost is the "filter … (in execute)" info row below - different scope.';
    case "alphaMask":
    case "colorMask":
    case "stencilMask":
      return `${pipe} - mask effect pipe. N× = execute invocations, Mdc = draw calls dispatched in this phase.`;
    case "sprite":
    case "mesh":
    case "graphics":
    case "particle":
    case "tilingSprite":
    case "nineSliceSprite":
    case "bitmapText":
    case "htmlText":
    case "renderGroup":
    case "customRender":
    case "dom":
    case "blendMode":
      return `${pipe} render pipe - execute wall-clock. N× = pipe.execute() invocations, Mdc = GL draw calls dispatched.`;
    default:
      return "Render pipe - execute wall-clock. N× = pipe.execute() invocations, Mdc = GL draw calls dispatched in this phase.";
  }
}

/** Explanation for a bar row, by label. Dynamic (count-bearing) labels matched
 *  by prefix; static labels by exact key. `undefined` -> tooltip falls back to
 *  the label itself. */
export function barTip(label: string): string | undefined {
  // Dynamic count-bearing rows - match before the static map / per-pipe check.
  if (label.startsWith("spine cpu"))
    return "Spine CPU: 5 Ticker.shared phases (animationState update/apply, skeleton pre-physics, worldTransform, slotObjects). Ticker label notes where it lands in the partition.";
  if (label.startsWith("Long Tasks"))
    return "PerformanceObserver longtask ms blocking the main thread this frame (tasks >50 ms).";
  if (label.startsWith("Audio"))
    return "WebAudio: contexts · active/peak sources · currentTime drift. Bar ms = decodeAudioData wall-clock (async, parallel).";
  if (label.startsWith("decode ·"))
    return "decodeAudioData wall-clock - async, runs in parallel (info, outside the partition).";
  if (label.startsWith("sources ·"))
    return "AudioBufferSourceNode start/stop counts this window (event counts, not time).";
  if (label.startsWith("automation ·"))
    return "AudioParam automation op count (setValueAtTime/ramps/etc) - event count, not time.";
  if (label.startsWith("state transitions"))
    return "AudioContext statechange count - event count, not time.";
  if (label.startsWith("LoAF"))
    return "Long Animation Frame (>50 ms): total duration, split into script + style/layout + render + blocking.";
  if (label.includes("(in execute)"))
    return 'FilterSystem push + applyFilter + pop wall-clock during execute. Different scope from the per-pipe "filter" row (which is only the filter pipe\'s execute slice).';

  const staticTip = STATIC_BAR_TIPS[label];
  if (staticTip) return staticTip;

  // Per-pipe execute rows: "<pipe> · N× Mdc[ · …]".
  if (label.includes("dc")) return perPipeTip(label.split(" ")[0] ?? "");
  return undefined;
}

/**
 * Persistent bar-row DOM + cached child refs. Built once by `createBarRow`,
 * mutated in place by `applyBarRow` every HUD tick. Reusing the same nodes
 * across ticks (instead of recreating ~70 nodes 4×/sec via replaceChildren)
 * avoids the GC churn the profiler is meant to measure.
 *
 * A single row morphs between `normal` (label/track/num) and `separator`
 * (single centered label) kinds - separators are rare (the PARALLEL/INFO
 * divider), so the structural swap on the rare kind-change is cheap.
 */
export interface BarRowRefs {
  row: HTMLDivElement;
  kind: "normal" | "separator";
  label: HTMLDivElement;
  track: HTMLDivElement;
  fill: HTMLDivElement;
  marker: HTMLDivElement;
  overlay: HTMLDivElement;
  num: HTMLDivElement;
  sep: HTMLDivElement;
}

export function createBarRow(): BarRowRefs {
  const row = document.createElement("div");
  row.className = "sbc-bar-row";
  const label = document.createElement("div");
  label.className = "sbc-bar-label";
  const track = document.createElement("div");
  track.className = "sbc-bar-track";
  const fill = document.createElement("div");
  fill.className = "sbc-bar-fill";
  const marker = document.createElement("div");
  marker.className = "sbc-bar-marker";
  const overlay = document.createElement("div");
  overlay.className = "sbc-bar-overlay";
  const num = document.createElement("div");
  num.className = "sbc-bar-num";
  const sep = document.createElement("div");
  sep.className = "sbc-bar-sep";
  track.append(fill, marker, overlay);
  row.append(label, track, num);
  return { row, kind: "normal", label, track, fill, marker, overlay, num, sep };
}

/** Patch an existing row in place to display `item`. No node allocation on the
 *  steady-state path (same kind tick-over-tick). */
export function applyBarRow(
  refs: BarRowRefs,
  item: BarItem,
  scale: number,
  budget: number
): void {
  const row = refs.row;

  // Separator row - pure centered label, no track/number.
  if (item.separator) {
    if (refs.kind !== "separator") {
      row.style.gridTemplateColumns = "1fr";
      row.replaceChildren(refs.sep);
      refs.kind = "separator";
    }
    refs.sep.textContent = item.label;
    row.removeAttribute("title");
    row.classList.remove("sbc-bar-parent");
    delete row.dataset["label"];
    return;
  }

  if (refs.kind !== "normal") {
    row.style.removeProperty("grid-template-columns");
    row.replaceChildren(refs.label, refs.track, refs.num);
    refs.kind = "normal";
  }

  // Indented label with a tree connector + collapse marker.
  const indent = item.depth === 0 ? "" : "·".repeat(item.depth - 1) + "└ ";
  const marker = item.hasChildren ? (item.isCollapsed ? "▸ " : "▾ ") : "";
  refs.label.textContent = `${indent}${marker}${item.label}`;
  if (item.info) {
    refs.label.style.color = "rgba(158, 161, 170,0.45)";
    refs.label.style.fontStyle = "italic";
    refs.label.style.fontWeight = "";
  } else if (item.isHeader) {
    refs.label.style.color = "rgba(231, 232, 236,0.92)";
    refs.label.style.fontWeight = "500";
    refs.label.style.fontStyle = "";
  } else {
    refs.label.style.color = "rgba(158, 161, 170,0.7)";
    refs.label.style.fontWeight = "";
    refs.label.style.fontStyle = "";
  }
  refs.label.title = item.tip ?? item.label;

  const widthPct = Math.min((item.ms / scale) * 100, 100);
  refs.fill.style.width = `${widthPct.toFixed(2)}%`;
  refs.fill.style.background = item.color;
  refs.fill.style.opacity = String(
    item.info ? 0.35 : item.isHeader ? 0.95 : 0.75
  );
  refs.fill.style.backgroundImage = item.info
    ? "repeating-linear-gradient(45deg, transparent 0 4px, rgba(0,0,0,0.18) 4px 8px)"
    : "";

  // Budget marker - only top-level non-info rows, when in range.
  const markerPct =
    item.depth === 0 && budget > 0 && !item.info ? (budget / scale) * 100 : NaN;
  if (markerPct >= 0 && markerPct <= 100) {
    refs.marker.style.display = "";
    refs.marker.style.left = `${markerPct.toFixed(2)}%`;
  } else {
    refs.marker.style.display = "none";
  }

  // % overlay - % of parent (nested) or % of budget (depth-0).
  const denominator =
    item.parentMs && item.parentMs > 0 ? item.parentMs : budget;
  const pct = denominator > 0 ? (item.ms / denominator) * 100 : 0;
  if (item.ms > 0.005) {
    refs.overlay.style.display = "";
    refs.overlay.style.color = `rgba(255, 255, 255, ${item.info ? 0.6 : 0.95})`;
    refs.overlay.textContent = `${pct.toFixed(0)}%`;
  } else {
    refs.overlay.style.display = "none";
  }

  const overrun = item.ms > budget && !item.info && !item.parentMs; // overrun only top-level
  refs.num.textContent = `${item.ms.toFixed(2)} ms`;
  if (overrun) {
    refs.num.style.color = COLOR_OVERRUN;
    refs.num.style.fontWeight = "600";
    refs.num.style.fontStyle = "";
  } else if (item.info) {
    refs.num.style.color = "rgba(158, 161, 170,0.45)";
    refs.num.style.fontStyle = "italic";
    refs.num.style.fontWeight = "";
  } else {
    refs.num.style.color = "";
    refs.num.style.fontWeight = "";
    refs.num.style.fontStyle = "";
  }

  const infoNote = item.info ? " (info - not in sum)" : "";
  const denomLabel =
    item.parentMs && item.parentMs > 0
      ? item.depth === 0
        ? `frame total (${item.parentMs.toFixed(2)}ms)`
        : `parent (${item.parentMs.toFixed(2)}ms)`
      : `budget (${budget.toFixed(2)}ms)`;
  // Tooltip: explanation first (when present), then the metric line. Values near
  // performance.now()'s resolution (~0.1ms clamped, ~5µs under cross-origin
  // isolation) are single-reading noise - trust the window avg. Threshold adapts
  // to COI so we don't over-warn when sub-0.1ms phases are actually trustworthy.
  const head = item.tip ? `${item.label} - ${item.tip}` : item.label;
  const resNote =
    item.ms > 0 && item.ms < TIMER_RES_MS
      ? `  ⚠ near timer resolution (~${TIMER_RES_MS}ms) - noisy`
      : "";
  row.title = `${head}\n${item.ms.toFixed(3)}ms · ${pct.toFixed(1)}% of ${denomLabel}${infoNote}${resNote}`;

  // Parent rows: tagged for CSS hover/cursor + delegated click (stable collapse
  // key stored in dataset so one listener on the bars container handles all
  // toggles; key - not label - so state survives count-bearing label changes).
  if (item.hasChildren) {
    row.classList.add("sbc-bar-parent");
    row.dataset["key"] = item.collapseKey ?? item.label;
  } else {
    row.classList.remove("sbc-bar-parent");
    delete row.dataset["key"];
  }
}
