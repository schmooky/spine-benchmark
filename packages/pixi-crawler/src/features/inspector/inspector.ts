import {
  COLOR_OVERRUN,
  COLOR_PIXI,
  COLOR_PIXI_BOILER,
  COLOR_PIXI_BUILD,
  COLOR_PIXI_EXEC,
  COLOR_PIXI_GC,
  COLOR_PIXI_OTHER,
  COLOR_PIXI_XFORM,
  COLOR_PRE,
} from "../../shared/colors";
import { injectMobileStyles } from "../../shared/mobile-styles";
import type {
  FrameCapture,
  FrameRecord,
  FrameRecording,
  InstructionDump,
  PipeExecuteCall,
  RenderGroupDump,
} from "../../types";

/**
 * FrameInspector - scrubbable frame explorer. A canvas timeline over the whole
 * ring buffer lets you pick ANY frame (click / ◀▶ / arrow keys); its metrics
 * render below from that frame's `FrameRecord`. Styled to match the HUD (glass
 * panel, `.ppi-*` classes, shared palette).
 *
 * Data model: per-frame metrics (phases/counters/spine/filter/perPipe/exec-calls)
 * all live in the `FrameRecord` -> any frame, including ones evicted from the ring
 * (the worst-frame capture holds its own ref), is inspectable. The scene dump
 * (instructions + renderGroups) reads the LIVE scene graph -> it's shown ONLY for
 * the latest frame while following live; for pinned/historical frames it's omitted
 * with a note.
 *
 * Class name + element id kept as `worst-frame-inspector` for the mobile CSS rule
 * (shared/mobile-styles.ts) and existing tests.
 */

export interface InspectorSource {
  getFrames(): FrameRecord[];
  getWorstFrame(): FrameCapture | undefined;
  capture(): FrameCapture | null;
  readonly targetFrameMs: number;
}

const REFRESH_MS = 250;
const TIMELINE_H = 52; // CSS px

const STYLE_ID = "__pixi-crawler-inspector-css";

function injectInspectorStyles(): void {
  if (typeof document === "undefined" || document.getElementById(STYLE_ID))
    return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}

export class WorstFrameInspector {
  private panelEl: HTMLDivElement | undefined;
  private titleEl: HTMLDivElement | undefined;
  private counterEl: HTMLSpanElement | undefined;
  private liveBtn: HTMLButtonElement | undefined;
  private canvasEl: HTMLCanvasElement | undefined;
  private bodyEl: HTMLDivElement | undefined;
  private onCloseCb: (() => void) | undefined;

  private source: InspectorSource | undefined;
  private following = true;
  /** Offline replay of a loaded recording - no live scene (scene dump omitted),
   *  no live-follow, static timeline (no refresh timer). */
  private offline = false;
  /** Currently inspected record (held by ref -> survives ring eviction). */
  private selected: FrameRecord | undefined;
  private lastRenderedIdx = -1;
  private _refreshTick = 0;
  /** Live metrics rebuild cadence: every Nth 250ms refresh (≈750ms). The
   *  timeline still redraws every tick - only the heavy section rebuild + scene
   *  dump are throttled, so a live-following inspector doesn't perturb the app. */
  private static readonly LIVE_METRICS_EVERY = 3;
  private timer: number | undefined;
  /** Maps timeline pixel column -> ring-buffer array index (set on each draw). */
  private colToFrame: Int32Array | undefined;
  private viewFrames: FrameRecord[] = [];

  onClose(cb: () => void): void {
    this.onCloseCb = cb;
  }

  /** Back-compat: open pinned to the frame in `capture`. */
  show(capture: FrameCapture): void {
    // Resolved lazily from the source if available; otherwise render the one frame.
    this.openRecord(capture.frame, capture);
  }

  /** Open the explorer.
   *  @param pinFrameIdx - pin to this frame; omit -> follow the latest frame. */
  open(source: InspectorSource, pinFrameIdx?: number): void {
    this.offline = false;
    this.lastRenderedIdx = -1;
    this._refreshTick = -1; // ++ -> 0 on first _refresh -> renders immediately
    this.source = source;
    const frames = source.getFrames();
    let rec =
      pinFrameIdx !== undefined
        ? frames.find((f) => f.frameIdx === pinFrameIdx)
        : undefined;
    if (!rec && pinFrameIdx !== undefined) {
      const w = source.getWorstFrame();
      if (w?.frame.frameIdx === pinFrameIdx) rec = w.frame; // worst survives eviction
    }
    this.following = pinFrameIdx === undefined || !rec;
    this.selected = rec ?? frames[frames.length - 1];
    this._mount();
    this._refresh();
    this.timer = window.setInterval(() => {
      this._refresh();
    }, REFRESH_MS);
  }

  /** Open without a live source (single frozen capture). */
  private openRecord(frame: FrameRecord, capture: FrameCapture): void {
    this.offline = false;
    this.source = undefined;
    this.following = false;
    this.selected = frame;
    this._mount();
    this._renderTimelineStatic();
    this._renderMetrics(frame, capture);
  }

  /** Open a loaded recording offline: timeline + per-frame metrics from the saved
   *  `FrameRecord[]`. No live scene -> the render-group/instruction dump is omitted.
   *  Static (no refresh timer); ◀▶/click/arrows still scrub. */
  openRecording(rec: FrameRecording): void {
    const frames = rec.frames;
    if (!Array.isArray(frames) || frames.length === 0) return;
    let w = frames[0]!;
    for (const f of frames) if (f.measuredCpuMs > w.measuredCpuMs) w = f;
    const worst: FrameCapture = {
      frame: w,
      instructions: [],
      renderGroups: [],
    };
    const src: InspectorSource = {
      getFrames: () => frames,
      getWorstFrame: () => worst,
      capture: () => null, // no live scene in a recording
      targetFrameMs: rec.targetFrameMs > 0 ? rec.targetFrameMs : 16.67,
    };
    this.offline = true;
    this.lastRenderedIdx = -1;
    this._refreshTick = -1;
    this.source = src;
    this.following = false;
    this.selected = w;
    this._mount();
    this._refresh(); // one-shot; no interval - recording is static
  }

  hide(): void {
    const wasOpen = this.panelEl !== undefined;
    this._teardownDom();
    this.source = undefined;
    this.selected = undefined;
    this.offline = false;
    this.lastRenderedIdx = -1;
    if (wasOpen) this.onCloseCb?.();
  }

  isOpen(): boolean {
    return Boolean(this.panelEl);
  }

  /** Remove panel DOM + stop the refresh timer. Does NOT reset source/selection
   *  (so `open()` can pre-set them) or fire onCloseCb (so reopening is silent). */
  private _teardownDom(): void {
    if (this.timer !== undefined) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    this.panelEl?.remove();
    this.panelEl = undefined;
  }

  // ── mount ────────────────────────────────────────────────────────────────

  private _mount(): void {
    this._teardownDom(); // drop a prior panel without clobbering freshly-set state
    injectInspectorStyles();
    injectMobileStyles();

    const panel = document.createElement("div");
    panel.id = "worst-frame-inspector";
    panel.className = "ppi-panel";
    panel.tabIndex = 0; // focusable for arrow-key stepping

    // Header: title + close.
    const header = document.createElement("div");
    header.className = "ppi-header";
    const title = document.createElement("div");
    title.className = "ppi-title";
    const close = document.createElement("button");
    close.className = "ppi-btn ppi-btn-close";
    close.textContent = "×";
    close.title = "Close (Esc)";
    close.addEventListener("click", () => {
      this.hide();
    });
    header.append(title, close);

    // Controls: ◀ ▶ · counter · worst · live.
    const controls = document.createElement("div");
    controls.className = "ppi-controls";
    const prev = this._navBtn("◀", "Previous frame (<-)", () => {
      this._step(-1);
    });
    const next = this._navBtn("▶", "Next frame (->)", () => {
      this._step(1);
    });
    const counter = document.createElement("span");
    counter.className = "ppi-counter";
    const worstBtn = this._navBtn("★ worst", "Jump to worst frame", () => {
      this._jumpWorst();
    });
    const liveBtn = this._navBtn("● live", "Follow the latest frame", () => {
      this._goLive();
    });
    liveBtn.classList.add("ppi-live");
    controls.append(prev, next, counter, worstBtn, liveBtn);

    // Timeline canvas + hint.
    const tl = document.createElement("div");
    tl.className = "ppi-timeline";
    const canvas = document.createElement("canvas");
    canvas.className = "ppi-canvas";
    canvas.addEventListener("click", (e) => {
      this._onCanvasClick(e);
    });
    const hint = document.createElement("div");
    hint.className = "ppi-hint";
    hint.textContent =
      "CPU ms per frame · click a bar to inspect · dashed = budget";
    tl.append(canvas, hint);

    // Scrollable body for metric sections.
    const body = document.createElement("div");
    body.className = "ppi-body";

    panel.append(header, controls, tl, body);
    panel.addEventListener("keydown", (e) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        this._step(-1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        this._step(1);
      } else if (e.key === "Escape") {
        this.hide();
      }
    });

    document.body.appendChild(panel);
    this.panelEl = panel;
    this.titleEl = title;
    this.counterEl = counter;
    this.liveBtn = liveBtn;
    this.canvasEl = canvas;
    this.bodyEl = body;
    panel.focus({ preventScroll: true });
  }

  private _navBtn(
    label: string,
    tip: string,
    onClick: () => void
  ): HTMLButtonElement {
    const b = document.createElement("button");
    b.className = "ppi-btn";
    b.textContent = label;
    b.title = tip;
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      onClick();
    });
    return b;
  }

  // ── selection ────────────────────────────────────────────────────────────

  private _step(delta: number): void {
    if (!this.source) return;
    const frames = this.source.getFrames();
    if (frames.length === 0) return;
    const curIdx = this.selected
      ? frames.findIndex((f) => f.frameIdx === this.selected!.frameIdx)
      : frames.length - 1;
    const base = curIdx >= 0 ? curIdx : frames.length - 1;
    const next = Math.max(0, Math.min(frames.length - 1, base + delta));
    this.following = next === frames.length - 1;
    this.selected = frames[next];
    this._refresh();
  }

  private _jumpWorst(): void {
    const w = this.source?.getWorstFrame();
    if (!w) return;
    this.following = false;
    this.selected = w.frame;
    this._refresh();
  }

  private _goLive(): void {
    if (!this.source) return;
    this.following = true;
    const frames = this.source.getFrames();
    this.selected = frames[frames.length - 1];
    this._refreshTick = -1; // ++ in _refresh -> 0 -> renders immediately
    this._refresh();
  }

  private _onCanvasClick(e: MouseEvent): void {
    if (!this.canvasEl || !this.colToFrame) return;
    const rect = this.canvasEl.getBoundingClientRect();
    const col = Math.max(
      0,
      Math.min(this.colToFrame.length - 1, Math.round(e.clientX - rect.left))
    );
    const arrIdx = this.colToFrame[col] ?? -1;
    if (arrIdx < 0) return;
    const rec = this.viewFrames[arrIdx];
    if (!rec) return;
    this.following = false;
    this.selected = rec;
    this._refresh();
  }

  // ── refresh loop ───────────────────────────────────────────────────────────

  private _refresh(): void {
    if (!this.panelEl || !this.source) return;
    const frames = this.source.getFrames();
    if (frames.length === 0) return;
    if (this.following) this.selected = frames[frames.length - 1];
    const sel = this.selected;
    if (!sel) return;

    const isLive =
      !this.offline &&
      this.following &&
      sel.frameIdx === frames[frames.length - 1]?.frameIdx;
    // Timeline + chrome are cheap -> every tick (responsive scrub highlight).
    this._drawTimeline(frames, sel.frameIdx);
    this._updateChrome(frames, sel, isLive);

    // Metrics rebuild + the live scene dump (capture() = 2 scene-graph DFS) are
    // heavy. While following live the selected frame changes every tick, so we
    // can't gate on "changed" - throttle to ~LIVE_METRICS_EVERY ticks instead.
    // When pinned/scrubbing, render immediately on a frame change (on-demand).
    this._refreshTick++;
    const doRender = isLive
      ? this._refreshTick % WorstFrameInspector.LIVE_METRICS_EVERY === 0
      : sel.frameIdx !== this.lastRenderedIdx;
    if (doRender) {
      const cap = isLive ? this.source.capture() : null;
      this._renderMetrics(
        sel,
        cap ?? { frame: sel, instructions: [], renderGroups: [] },
        !isLive
      );
      this.lastRenderedIdx = sel.frameIdx;
    }
  }

  private _updateChrome(
    frames: FrameRecord[],
    sel: FrameRecord,
    isLive: boolean
  ): void {
    if (this.titleEl) {
      const tag = this.offline
        ? " · recording"
        : isLive
          ? " · live"
          : this.following
            ? ""
            : " · pinned";
      this.titleEl.textContent = `Frame #${sel.frameIdx} · rafΔ ${sel.rafDeltaMs.toFixed(2)}ms${tag}`;
    }
    if (this.counterEl) {
      const pos = frames.findIndex((f) => f.frameIdx === sel.frameIdx);
      this.counterEl.textContent =
        pos >= 0 ? `${pos + 1}/${frames.length}` : `#${sel.frameIdx} (evicted)`;
    }
    if (this.liveBtn) {
      this.liveBtn.style.display = this.offline ? "none" : ""; // no live-follow offline
      this.liveBtn.classList.toggle(
        "ppi-live-on",
        this.following && !this.offline
      );
    }
  }

  // ── timeline ─────────────────────────────────────────────────────────────

  private _renderTimelineStatic(): void {
    // Frozen single-capture mode (no source): hide the timeline interactions.
    if (this.canvasEl) this.canvasEl.style.display = "none";
    if (this.counterEl) this.counterEl.textContent = "frozen";
    if (this.titleEl && this.selected) {
      this.titleEl.textContent = `Frame #${this.selected.frameIdx} · rafΔ ${this.selected.rafDeltaMs.toFixed(2)}ms · frozen`;
    }
  }

  private _drawTimeline(frames: FrameRecord[], selFrameIdx: number): void {
    const cv = this.canvasEl;
    if (!cv) return;
    const cssW = Math.max(1, Math.floor(cv.clientWidth || 0));
    const cssH = TIMELINE_H;
    if (cssW <= 1) return; // not laid out yet
    const dpr = window.devicePixelRatio || 1;
    const bw = Math.round(cssW * dpr),
      bh = Math.round(cssH * dpr);
    if (cv.width !== bw || cv.height !== bh) {
      cv.width = bw;
      cv.height = bh;
    }
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    const budget = this.source?.targetFrameMs ?? 16.67;
    const n = frames.length;
    this.viewFrames = frames;

    // Autoscale to the observed CPU range (+15% headroom) so frame-to-frame
    // variation is ALWAYS visible - even on an idle scene where cpu ≪ budget
    // (a budget-floored scale would flatten every bar to 1px). The budget line
    // is drawn only when it falls inside the canvas; colors still grade vs budget.
    let maxCpu = 0.01;
    for (const f of frames)
      if (f.measuredCpuMs > maxCpu) maxCpu = f.measuredCpuMs;
    const scale = maxCpu * 1.15;

    // One bar per pixel column; when frames > columns, each column takes the
    // MAX-cpu frame in its bucket (spikes never hidden). colToFrame powers clicks.
    const cols = cssW;
    const colToFrame = new Int32Array(cols).fill(-1);
    const worstIdx = this.source?.getWorstFrame()?.frame.frameIdx;
    let selX = -1,
      worstX = -1;
    for (let c = 0; c < cols; c++) {
      const lo = Math.floor((c * n) / cols);
      const hi = Math.max(lo + 1, Math.floor(((c + 1) * n) / cols));
      let best = lo;
      for (let j = lo + 1; j < hi && j < n; j++) {
        if (frames[j]!.measuredCpuMs > frames[best]!.measuredCpuMs) best = j;
      }
      if (best >= n) continue;
      colToFrame[c] = best;
      const f = frames[best]!;
      const h = Math.max(1, (f.measuredCpuMs / scale) * cssH);
      const ratio = f.measuredCpuMs / budget;
      ctx.fillStyle =
        ratio > 1 ? COLOR_OVERRUN : ratio > 0.85 ? "#ffd060" : COLOR_PIXI;
      ctx.globalAlpha = f.frameDropped ? 0.95 : 0.6;
      ctx.fillRect(c, cssH - h, 1, h);
      if (f.frameIdx === selFrameIdx) selX = c;
      if (worstIdx !== undefined && f.frameIdx === worstIdx) worstX = c;
    }
    this.colToFrame = colToFrame;
    ctx.globalAlpha = 1;

    // Budget line - only when within the autoscaled range (else cpu ≪ budget,
    // line would sit off the top; the hint text still says "dashed = budget").
    if (budget < scale) {
      const budgetY = cssH - (budget / scale) * cssH;
      ctx.strokeStyle = "rgba(255,255,255,0.22)";
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(0, budgetY);
      ctx.lineTo(cssW, budgetY);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Worst marker (amber triangle at top).
    if (worstX >= 0) {
      ctx.fillStyle = COLOR_PIXI_GC;
      ctx.beginPath();
      ctx.moveTo(worstX, 0);
      ctx.lineTo(worstX - 3, 6);
      ctx.lineTo(worstX + 3, 6);
      ctx.closePath();
      ctx.fill();
    }
    // Selection: full-height white line.
    if (selX >= 0) {
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(selX + 0.5, 0);
      ctx.lineTo(selX + 0.5, cssH);
      ctx.stroke();
    }
  }

  // ── metrics ──────────────────────────────────────────────────────────────

  private _renderMetrics(
    frame: FrameRecord,
    capture: FrameCapture,
    sceneDumpOmitted = false
  ): void {
    const body = this.bodyEl;
    if (!body) return;
    body.replaceChildren();

    body.appendChild(renderTopMetrics(frame));
    body.appendChild(renderPartition(frame));
    const pixiInternals = renderPixiInternals(frame);
    if (pixiInternals) body.appendChild(pixiInternals);
    const perPipe = renderPerPipe(frame);
    if (perPipe) body.appendChild(perPipe);
    body.appendChild(renderCounters(frame));
    const spine = renderSpine(frame);
    if (spine) body.appendChild(spine);
    const churn = renderSpineChurn(frame);
    if (churn) body.appendChild(churn);
    const filter = renderFilter(frame);
    if (filter) body.appendChild(filter);
    const execCalls = renderExecuteCalls(frame.pipeExecuteCalls);
    if (execCalls) body.appendChild(execCalls);

    // Scene dump - live frame only.
    if (sceneDumpOmitted) {
      const note = document.createElement("div");
      note.className = "ppi-note";
      note.textContent =
        "scene dump (render groups + instructions) - available for the live frame only";
      body.appendChild(note);
    } else {
      body.appendChild(renderRenderGroups(capture.renderGroups));
      body.appendChild(renderInstructions(capture.instructions));
    }
  }
}

// ─── section renderers (HUD-styled) ──────────────────────────────────────────

function renderTopMetrics(frame: FrameRecord): HTMLDivElement {
  const div = document.createElement("div");
  div.className = "ppi-top";
  const gpuStr =
    typeof frame.gpuMs === "number"
      ? `${frame.gpuMs.toFixed(2)}ms`
      : frame.gpuDisjoint
        ? "disjoint"
        : "-";
  div.textContent = `CPU ${frame.measuredCpuMs.toFixed(2)}ms · GPU ${gpuStr} · unacc ${frame.unaccountedMs.toFixed(2)}ms`;
  return div;
}

function renderPartition(frame: FrameRecord): HTMLDivElement {
  const wrap = section("partition");
  const pixiMs = sumPhases(frame);
  const max = Math.max(
    frame.prePixiMs,
    pixiMs,
    frame.postPixiMs,
    frame.rafDeltaMs,
    0.01
  );
  wrap.appendChild(barRow("pre", frame.prePixiMs, max, COLOR_PRE));
  wrap.appendChild(barRow("pixi", pixiMs, max, COLOR_PIXI));
  wrap.appendChild(
    barRow("post (incl. spine)", frame.postPixiMs, max, "#B07AC4")
  );
  return wrap;
}

function renderPixiInternals(frame: FrameRecord): HTMLDivElement | null {
  const split = frame.renderSplit;
  if (!split) return null;
  const p = frame.phases;
  const boilerplate = Math.max(
    0,
    p.prerenderMs + p.renderStartMs + p.renderEndMs + p.postrenderMs - p.gcMs
  );
  const buildCluster =
    split.buildInstructionsMs + split.updateRenderablesMs + split.batchUploadMs;
  const wrap = section("pixi internals");
  const max = Math.max(
    boilerplate,
    split.transformsMs,
    buildCluster,
    split.executeInstructionsMs,
    split.renderOtherMs,
    p.gcMs,
    0.01
  );
  wrap.appendChild(barRow("boilerplate", boilerplate, max, COLOR_PIXI_BOILER));
  wrap.appendChild(
    barRow("transforms", split.transformsMs, max, COLOR_PIXI_XFORM)
  );
  wrap.appendChild(barRow("build+upd+up", buildCluster, max, COLOR_PIXI_BUILD));
  wrap.appendChild(
    barRow("execute", split.executeInstructionsMs, max, COLOR_PIXI_EXEC)
  );
  wrap.appendChild(
    barRow("render-other", split.renderOtherMs, max, COLOR_PIXI_OTHER)
  );
  wrap.appendChild(barRow("gc", p.gcMs, max, COLOR_PIXI_GC));
  return wrap;
}

function renderPerPipe(frame: FrameRecord): HTMLDivElement | null {
  const perPipe = frame.perPipe;
  if (!perPipe) return null;
  const entries = Object.entries(perPipe)
    .filter(([, s]) => s.ms > 0)
    .sort(([, a], [, b]) => b.ms - a.ms);
  if (entries.length === 0) return null;
  const max = Math.max(...entries.map(([, s]) => s.ms), 0.01);
  const wrap = section("per-pipe execute");
  entries.forEach(([name, s], i) => {
    const hue = (200 + i * 33) % 360;
    wrap.appendChild(
      barRow(
        name,
        s.ms,
        max,
        `hsl(${hue}, 55%, 62%)`,
        `${s.invocations}× ${s.drawCalls}dc`
      )
    );
  });
  return wrap;
}

function renderCounters(frame: FrameRecord): HTMLDivElement {
  const c = frame.counters;
  const t = frame.textures;
  const wrap = section("counters");
  wrap.appendChild(
    pre(
      [
        `draws ${c.drawCalls}  rebuilds ${c.rebuilds}  breaks ${c.batchBreaks}  instr ${c.instructions}`,
        `groups rebuilt ${c.renderGroupsRebuilt}  state ${c.stateChanges}  shader ${c.shaderCompiles}`,
        `buf ${c.bufferUploads} (${formatBytes(c.bufferBytesUploaded)})`,
        `textures: ${t.activeGpuCount} active  uploads ${t.realGpuUploadsThisFrame} (${formatBytes(t.bytesUploadedThisFrame)})`,
      ].join("\n")
    )
  );
  return wrap;
}

function renderSpine(frame: FrameRecord): HTMLDivElement | null {
  const s = frame.spine;
  if (!s || s.instanceCount === 0) return null;
  const p = s.phases;
  const cpu =
    p.animationStateUpdateMs +
    p.skeletonPrePhysicsMs +
    p.animationApplyMs +
    p.worldTransformMs +
    p.slotObjectsMs;
  const pipe =
    p.pipeAddRenderableMs +
    p.pipeUpdateRenderableMs +
    p.pipeValidateRenderableMs;
  const wrap = section(`spine · ${s.instanceCount} instances`);
  wrap.appendChild(
    pre(
      [
        `total real ${(cpu + pipe).toFixed(2)}ms  (cpu ${cpu.toFixed(2)} + pipe ${pipe.toFixed(2)})`,
        `attach nested ${p.attachmentTransformMs.toFixed(2)}ms (inside pipe)`,
        `animState ${p.animationStateUpdateMs.toFixed(2)}  apply ${p.animationApplyMs.toFixed(2)}  worldXform ${p.worldTransformMs.toFixed(2)}  slots ${p.slotObjectsMs.toFixed(2)}`,
        `bones ${s.structure.totalBones}  updateCache ${s.structure.totalUpdateCacheLen}  drawOrder ${s.structure.totalDrawOrderSlots}`,
        `tracks active ${s.structure.totalActiveTracks}  mixing ${s.structure.totalMixingPairs}`,
      ].join("\n")
    )
  );
  return wrap;
}

function renderSpineChurn(frame: FrameRecord): HTMLDivElement | null {
  const s = frame.spine;
  const split = frame.renderSplit;
  if (!s || s.instanceCount === 0 || !split) return null;
  const p = s.phases;
  const spinePipeMs =
    p.pipeAddRenderableMs +
    p.pipeUpdateRenderableMs +
    p.pipeValidateRenderableMs;
  const buildAndUpdate = split.buildInstructionsMs + split.updateRenderablesMs;
  const sharePct =
    buildAndUpdate > 0
      ? Math.min(100, (spinePipeMs / buildAndUpdate) * 100)
      : 0;
  const nonSpineMs = Math.max(0, buildAndUpdate - spinePipeMs);

  const wrap = section("spine churn");
  wrap.appendChild(
    pre(
      [
        `build+update: ${buildAndUpdate.toFixed(2)}ms  (rebuilds ${frame.counters.renderGroupsRebuilt}/${s.instanceCount} instances)`,
        `spine pipe:   ${spinePipeMs.toFixed(2)}ms  (${sharePct.toFixed(0)}% of build+upd)`,
        `non-spine:    ${nonSpineMs.toFixed(2)}ms  (${(100 - sharePct).toFixed(0)}%)`,
      ].join("\n")
    )
  );

  const stack = document.createElement("div");
  stack.className = "ppi-stack";
  if (spinePipeMs > 0) {
    const b = document.createElement("div");
    b.style.cssText = `height:100%;background:#E89567;width:${sharePct.toFixed(2)}%;`;
    b.title = `spine ${spinePipeMs.toFixed(2)}ms`;
    stack.appendChild(b);
  }
  if (nonSpineMs > 0) {
    const b = document.createElement("div");
    b.style.cssText = `height:100%;background:${COLOR_PIXI_BUILD};flex:1;`;
    b.title = `non-spine ${nonSpineMs.toFixed(2)}ms`;
    stack.appendChild(b);
  }
  wrap.appendChild(stack);

  const perInstance = s.perInstance;
  if (perInstance) {
    const entries = Object.values(perInstance)
      .map((inst) => ({
        uid: inst.spineUid,
        pipeMs:
          inst.phases.pipeAddRenderableMs +
          inst.phases.pipeUpdateRenderableMs +
          inst.phases.pipeValidateRenderableMs,
        bones: inst.structure.totalBones,
      }))
      .filter((e) => e.pipeMs > 0)
      .sort((a, b) => b.pipeMs - a.pipeMs)
      .slice(0, 5);
    if (entries.length > 0) {
      const maxMs = entries[0]!.pipeMs;
      const sub = document.createElement("div");
      sub.className = "ppi-subhead";
      sub.textContent = `top ${entries.length} instance(s) by pipe ms:`;
      wrap.appendChild(sub);
      for (const e of entries)
        wrap.appendChild(
          barRow(`#${e.uid}`, e.pipeMs, maxMs, "#E89567", `${e.bones} bones`)
        );
    }
  }
  return wrap;
}

function renderFilter(frame: FrameRecord): HTMLDivElement | null {
  const f = frame.filter;
  if (!f || f.passes === 0) return null;
  const wrap = section(`filter · ${f.passes} passes`);
  wrap.appendChild(
    pre(
      `push ${f.pushMs.toFixed(2)}  apply ${f.applyMs.toFixed(2)}  pop ${f.popMs.toFixed(2)} ms`
    )
  );
  return wrap;
}

function renderRenderGroups(groups: RenderGroupDump[]): HTMLDivElement {
  const wrap = section(`render groups · ${groups.length}`);
  wrap.appendChild(
    pre(
      groups
        .map((g) => {
          const indent = "  ".repeat(g.depth);
          const cached = g.isCachedAsTexture ? " [cached]" : "";
          return `${indent}[${g.depth}] ${g.instructionCount} instr · ${g.childrenCount} children${cached}`;
        })
        .join("\n"),
      true
    )
  );
  return wrap;
}

const INSTRUCTIONS_PREVIEW_COUNT = 30;

function renderExecuteCalls(
  calls: PipeExecuteCall[] | undefined
): HTMLDivElement | null {
  if (!calls || calls.length === 0) return null;
  const wrap = section(`execute calls · ${calls.length}`);
  const maxMs = Math.max(...calls.map((c) => c.ms), 0.01);
  const BAR_CHARS = 12;
  const renderList = (limit: number): string =>
    calls
      .slice(0, limit)
      .map((c) => {
        const idx = c.index.toString().padStart(3, " ");
        const ms = c.ms.toFixed(2).padStart(6, " ");
        const action = c.action ? ` (${c.action})` : "";
        const dc = c.drawCalls > 0 ? `  ${c.drawCalls}dc` : "";
        const fillLen = Math.min(
          BAR_CHARS,
          Math.max(0, Math.round((c.ms / maxMs) * BAR_CHARS))
        );
        const bar = "█".repeat(fillLen) + "·".repeat(BAR_CHARS - fillLen);
        return `[${idx}] ${c.pipeId.padEnd(12, " ")} ${ms} ${bar}${action}${dc}`;
      })
      .join("\n");
  appendExpandable(wrap, calls.length, renderList, "calls");
  return wrap;
}

function renderInstructions(instructions: InstructionDump[]): HTMLDivElement {
  const wrap = section(`instructions · ${instructions.length}`);
  const renderList = (limit: number): string =>
    instructions
      .slice(0, limit)
      .map((ins) => {
        const action = ins.action ? ` / ${ins.action}` : "";
        const bundle = ins.canBundle === false ? " (no-bundle)" : "";
        return `${ins.index.toString().padStart(3, " ")}: ${ins.renderPipeId}${action}${bundle}`;
      })
      .join("\n");
  appendExpandable(wrap, instructions.length, renderList, "instructions");
  return wrap;
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function section(title: string): HTMLDivElement {
  const wrap = document.createElement("div");
  wrap.className = "ppi-section";
  const h = document.createElement("div");
  h.className = "ppi-section-title";
  h.textContent = title;
  wrap.appendChild(h);
  return wrap;
}

function pre(text: string, small = false): HTMLDivElement {
  const el = document.createElement("div");
  el.className = small ? "ppi-pre ppi-pre-sm" : "ppi-pre";
  el.textContent = text;
  return el;
}

function appendExpandable(
  wrap: HTMLElement,
  total: number,
  renderList: (n: number) => string,
  noun: string
): void {
  const body = pre("", true);
  if (total <= INSTRUCTIONS_PREVIEW_COUNT) {
    body.textContent = renderList(total);
    wrap.appendChild(body);
    return;
  }
  body.textContent = renderList(INSTRUCTIONS_PREVIEW_COUNT);
  wrap.appendChild(body);
  const more = document.createElement("button");
  more.className = "ppi-btn ppi-more";
  more.textContent = `… show all ${total} ${noun}`;
  more.addEventListener("click", () => {
    body.textContent = renderList(total);
    more.remove();
  });
  wrap.appendChild(more);
}

function barRow(
  label: string,
  ms: number,
  max: number,
  color: string,
  meta?: string
): HTMLDivElement {
  const row = document.createElement("div");
  row.className = "ppi-row";
  const lbl = document.createElement("span");
  lbl.className = "ppi-row-l";
  lbl.textContent = label;
  const num = document.createElement("span");
  num.className = "ppi-row-n";
  num.textContent = ms.toFixed(2);
  const trackWrap = document.createElement("div");
  trackWrap.className =
    meta !== undefined ? "ppi-track-wrap ppi-track-meta" : "ppi-track-wrap";
  const track = document.createElement("div");
  track.className = "ppi-track";
  if (ms > 0) {
    const fill = document.createElement("div");
    fill.className = "ppi-fill";
    fill.style.width = `${Math.min(100, (ms / max) * 100).toFixed(2)}%`;
    fill.style.background = color;
    track.appendChild(fill);
  }
  trackWrap.appendChild(track);
  if (meta !== undefined) {
    const m = document.createElement("span");
    m.className = "ppi-meta";
    m.textContent = meta;
    trackWrap.appendChild(m);
  }
  row.append(lbl, num, trackWrap);
  return row;
}

function sumPhases(f: FrameRecord): number {
  const p = f.phases;
  return (
    p.prerenderMs +
    p.renderStartMs +
    p.renderMs +
    p.renderEndMs +
    p.postrenderMs
  );
}

function formatBytes(b: number): string {
  if (b === 0) return "0";
  if (b < 1024) return `${b}B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)}KB`;
  return `${(b / 1024 / 1024).toFixed(2)}MB`;
}

// ─── styles (HUD glass aesthetic) ────────────────────────────────────────────

const CSS = `
#worst-frame-inspector.ppi-panel {
    position: fixed; top: 8px; left: 8px; width: 480px;
    max-width: calc(100vw - 16px); max-height: calc(100vh - 16px);
    display: flex; flex-direction: column; overflow: hidden;
    /* Solid fill, no backdrop blur - blurring the live scene behind the panel
       composites the whole viewport each frame and skews the measurements. */
    background: rgba(14, 18, 24, 0.97); color: rgba(232, 240, 246, 0.95);
    font: 11px/1.5 ui-monospace, "SF Mono", Consolas, monospace;
    border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 8px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(0,0,0,0.4);
    z-index: 100000; pointer-events: auto; outline: none;
}
.ppi-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 9px 12px; border-bottom: 1px solid rgba(255,255,255,0.08);
    background: linear-gradient(180deg, rgba(255,255,255,0.02), transparent); flex: none;
}
.ppi-title { font-size: 13px; font-weight: 500; font-variant-numeric: tabular-nums; color: rgba(232,240,246,0.95); }
.ppi-controls {
    display: flex; align-items: center; gap: 6px; padding: 6px 12px;
    border-bottom: 1px solid rgba(255,255,255,0.06); flex: none;
}
.ppi-counter { font-size: 10px; color: rgba(180,200,220,0.6); font-variant-numeric: tabular-nums; margin: 0 4px; }
.ppi-btn {
    pointer-events: auto; cursor: pointer; background: rgba(255,255,255,0.05);
    color: rgba(200,216,230,0.85); border: 1px solid rgba(255,255,255,0.1); border-radius: 4px;
    font: 10px ui-monospace, monospace; padding: 2px 8px; -webkit-tap-highlight-color: transparent;
}
.ppi-btn:hover { background: rgba(255,255,255,0.1); color: rgba(232,240,246,0.95); }
.ppi-btn-close { font-size: 14px; line-height: 1; padding: 0 7px; color: rgba(255,138,138,0.85); border-color: rgba(255,138,138,0.4); }
.ppi-btn-close:hover { background: rgba(255,80,80,0.18); }
.ppi-live { margin-left: auto; }
.ppi-live-on { background: rgba(80,200,120,0.22); color: #8be0a0; border-color: rgba(80,200,120,0.5); }
.ppi-timeline { padding: 8px 12px 6px; border-bottom: 1px solid rgba(255,255,255,0.06); flex: none; }
.ppi-canvas { display: block; width: 100%; height: ${TIMELINE_H}px; cursor: crosshair; border-radius: 3px; background: rgba(255,255,255,0.03); }
.ppi-hint { font-size: 9px; color: rgba(180,200,220,0.4); margin-top: 4px; text-align: center; }
.ppi-body { flex: 1 1 auto; min-height: 0; overflow-y: auto; overflow-x: hidden; padding: 4px 12px 12px;
    overscroll-behavior: contain; -webkit-overflow-scrolling: touch; touch-action: pan-y; }
.ppi-top { color: rgba(232,240,246,0.9); font-variant-numeric: tabular-nums; margin: 8px 0 2px; }
.ppi-section { margin-top: 10px; }
.ppi-section-title { font-size: 9px; text-transform: uppercase; letter-spacing: 0.08em; color: rgba(180,200,220,0.45); font-weight: 600; margin-bottom: 4px; }
.ppi-subhead { font-size: 9px; color: rgba(180,200,220,0.5); margin: 8px 0 3px; }
.ppi-pre { white-space: pre; color: rgba(232,240,246,0.85); font-variant-numeric: tabular-nums; }
.ppi-pre-sm { font-size: 10px; line-height: 1.45; }
.ppi-row { display: grid; grid-template-columns: 110px 52px 1fr; align-items: center; gap: 6px; font-size: 10px; margin-bottom: 2px; }
.ppi-row-l { color: rgba(180,200,220,0.7); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ppi-row-n { text-align: right; font-variant-numeric: tabular-nums; color: rgba(232,240,246,0.85); }
.ppi-track-wrap { display: block; }
.ppi-track-wrap.ppi-track-meta { display: grid; grid-template-columns: 1fr auto; gap: 6px; align-items: center; }
.ppi-track { height: 8px; background: rgba(255,255,255,0.05); border-radius: 2px; overflow: hidden; }
.ppi-fill { height: 100%; }
.ppi-meta { color: rgba(180,200,220,0.55); font-size: 10px; font-variant-numeric: tabular-nums; }
.ppi-stack { display: flex; height: 8px; margin-top: 6px; border-radius: 2px; overflow: hidden; background: rgba(255,255,255,0.05); }
.ppi-note { font-size: 9px; font-style: italic; color: rgba(180,200,220,0.45); margin-top: 12px; }
.ppi-more { margin-top: 6px; color: #88c8ff; border-color: rgba(136,200,255,0.4); }
`;
