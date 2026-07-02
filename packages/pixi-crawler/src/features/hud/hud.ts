import {
  DEVICE_CEILINGS,
  type DeviceTierConfig,
  computeTier,
} from "../../core/device-tier";
import type { GpuCost } from "../../core/gpu-cost";
import { StatsAggregator } from "../../core/stats";
import type { WorkloadCost } from "../../core/workload-cost";
import type { Crawler } from "../../crawler";
import {
  COLOR_GPU,
  COLOR_OVERRUN,
  COLOR_PIXI,
  COLOR_PIXI_BOILER,
  COLOR_PIXI_BUILD,
  COLOR_PIXI_EXEC,
  COLOR_PIXI_GC,
  COLOR_PIXI_OTHER,
  COLOR_PIXI_XFORM,
  COLOR_PRE,
  COLOR_SPINE,
} from "../../shared/colors";
import { injectMobileStyles } from "../../shared/mobile-styles";
import type { FrameRecord } from "../../types";
import { WorstFrameInspector } from "../inspector/inspector";

import { formatBytes } from "./format";
import {
  type BarItem,
  type BarRowRefs,
  applyBarRow,
  barTip,
  createBarRow,
  makeBarLegend,
} from "./sections/bars";
import { injectHudStyles } from "./styles";
import {
  type BarView,
  FPS_WINDOW_FRAMES,
  buildAveragedView,
  pipeColor,
} from "./view";

const UPDATE_INTERVAL_MS = 250;

// Format a driver value: byte drivers via formatBytes, others as a count.
function fmtDriverVal(
  name: WorkloadCost["drivers"][number]["name"],
  v: number
): string {
  if (name === "bufferBytes" || name === "texUploadBytes")
    return formatBytes(v);
  return v >= 10 ? v.toFixed(0) : v.toFixed(1);
}

// FPS readout color: green ≥95% of target, amber ≥85%, red below. Shared by the
// collapsed badge and the expanded header so they never disagree.
function fpsColorFor(fps: number, budget: number): string {
  const target = budget > 0 ? 1000 / budget : 60;
  const ratio = fps / target;
  return ratio < 0.85 ? COLOR_OVERRUN : ratio < 0.95 ? "#c2a878" : "#8fb89a";
}

// Averaged view over the FPS window - what we feed the bar and the partition row.
// Lifts single-frame noise: the user sees a "typical frame" at a stable
// FPS, not a random spike (individual frames' rafDelta jumps +-10% at an even
// avg, which without smoothing reads as a constant overrun).
//
// Contract: prePixiMs + pixiMs + postPixiMs ~= avg rafDelta. spineSharedMs
// is a separate field (taken cross-frame: for each frame i in the window we use
// frames[i+1].spine, see the Ticker.shared desync note), physically sits INSIDE
// postPixiMs. In the bar, spine is drawn as a separate segment, post-other = max(0, post - spine).
export class CrawlerHud {
  private el: HTMLDivElement | undefined;
  private headerEl: HTMLDivElement | undefined;
  private barsEl: HTMLDivElement | undefined;
  private barsTitleEl: HTMLDivElement | undefined;
  private barsBodyEl: HTMLDivElement | undefined;
  private countersEl: HTMLDivElement | undefined;
  private budgetEl: HTMLDivElement | undefined;
  private devicesEl: HTMLDivElement | undefined;
  private detailsEl: HTMLDivElement | undefined;
  private hotEl: HTMLDivElement | undefined;
  private worstEl: HTMLDivElement | undefined;
  private recBtnEl: HTMLButtonElement | undefined;
  private fileInputEl: HTMLInputElement | undefined;
  private timer: number | undefined;
  /** Cost compute throttle. `getGpuCost()` walks the LIVE scene graph
   *  (extractFillProxy + getFastGlobalBounds per drawable leaf) - too heavy to
   *  run every HUD tick on a busy scene (it would perturb the very frame timings
   *  we measure). Recompute ~1×/s, reuse the cached value for the header chips +
   *  Cost section in between. */
  private _costTick = 0;
  private _wcCache: WorkloadCost | undefined;
  private _gcCache: GpuCost | undefined;
  private static readonly COST_REFRESH_TICKS = 4; // 4 × 250ms ≈ 1s
  private readonly stats: StatsAggregator;
  private readonly inspector = new WorstFrameInspector();
  private recordCb: ((nextActive: boolean) => Promise<void> | void) | undefined;
  private recordingActive = false;
  private recordEl: HTMLDivElement | undefined;
  private badgeFpsEl: HTMLSpanElement | undefined;
  private _minimized = false;
  // Sticky flags - once a metric is seen, keep its bar row visible (at 0ms)
  // even when the current window has no data. Prevents layout jumping
  // when rare metrics (LoAF, async loads) pop in/out.
  private _stickyHasGpu = false;
  private _stickyHasAsync = false;
  private _stickyHasLoaf = false;
  private _stickyHasAudio = false;
  private _stickyHasLongTasks = false;
  private _stickyHasOtherShared = false;
  /** Set of collapsed bar-parent keys (stable `collapseKey`, NOT display label -
   *  count-bearing labels mutate every frame). Click on parent header toggles.
   *  Children skipped in render. Persists across `_update()` ticks. Audio/LoAF
   *  (deep, rarely-watched sub-trees) start collapsed to cut default density. */
  private _collapsed = new Set<string>(["audio", "loaf"]);
  /** Collapsed top-level SECTION ids. Diagnostics start collapsed - the at-a-
   *  glance summary lives in the header (FPS + cost/gpu chips); the sections hold
   *  the drill-down. Click a section title (caret) to toggle. Persists per HUD. */
  private _sectionCollapsed = new Set<string>([
    "counters",
    "cost",
    "details",
    "hot",
  ]);
  /** Reused bar-row DOM pool (index-keyed). Patched in place each tick by
   *  `applyBarRow`; only grown/trimmed when the visible row count changes. */
  private _barRows: BarRowRefs[] = [];

  constructor(private readonly profiler: Crawler) {
    this.stats = new StatsAggregator(profiler);
  }

  /**
   * Register a callback for the in-HUD "Record" button.
   * Button visible only when callback is set. Click invokes cb(nextActive)
   * and flips internal state. External callers can sync state via
   * `setRecording(active)` (e.g. when their async recording start completed).
   */
  onRecord(
    cb: ((nextActive: boolean) => Promise<void> | void) | undefined
  ): void {
    this.recordCb = cb;
    this._renderRecordButton();
  }

  /** External state sync - the caller informs the HUD that recording is on/off (e.g.
   *  recording started/stopped externally). Updates button label/color. */
  setRecording(active: boolean): void {
    this.recordingActive = active;
    this._renderRecordButton();
  }

  mount(): void {
    if (this.el) return;
    injectHudStyles();
    injectMobileStyles(); // worst-frame inspector responsive rules (HUD owns the inspector)
    const el = document.createElement("div");
    el.id = "sbc-crawler";
    el.className = "sbc-hud";

    // Collapsed state: only this badge is shown; click expands.
    const badge = document.createElement("div");
    badge.className = "sbc-badge";
    badge.title = "Expand crawler";
    badge.addEventListener("click", () => {
      this._setCollapsed(false);
    });
    const badgeFps = document.createElement("span");
    badgeFps.className = "sbc-badge-fps";
    badgeFps.textContent = "-";
    const badgeLabel = document.createElement("span");
    badgeLabel.className = "sbc-badge-label";
    badgeLabel.textContent = "fps";
    badge.append(badgeFps, badgeLabel);

    // Body - everything below the badge; hidden when collapsed.
    const body = document.createElement("div");
    body.className = "sbc-body";

    // 1. Header - FPS, status indicator, frame totals, collapse toggle.
    const header = document.createElement("div");
    header.id = "sbc-crawler-header";
    header.className = "sbc-header";

    // 2. Bars - frame breakdown with % overlays. Collapsible section.
    const barsSection = document.createElement("div");
    barsSection.className = "sbc-section";
    const barsTitle = document.createElement("div");
    barsTitle.className = "sbc-section-title sbc-section-toggle";
    barsTitle.dataset["section"] = "bars";
    barsTitle.textContent = "Frame breakdown";
    const barsBody = document.createElement("div"); // legend + bars; hidden when collapsed
    const bars = document.createElement("div");
    bars.className = "sbc-bars";
    // Single delegated click listener - toggles collapse for the clicked
    // parent row (stable key in data-key). Replaces per-row listeners that were
    // re-attached on every tick when rows were recreated.
    bars.addEventListener("click", (e) => {
      const target = e.target as HTMLElement | null;
      const row = target?.closest(".sbc-bar-parent") as HTMLElement | null;
      const key = row?.dataset["key"];
      if (!key) return;
      e.stopPropagation();
      if (this._collapsed.has(key)) this._collapsed.delete(key);
      else this._collapsed.add(key);
      this._update();
    });
    barsBody.append(makeBarLegend(), bars);
    barsSection.append(barsTitle, barsBody);

    // 3. Counters - collapsible section; title + grid rendered each tick.
    const countersSection = document.createElement("div");
    countersSection.className = "sbc-section";

    // 3b. Cost - merged WorkloadCost (cpu/workload) + GpuCost (fill-proxy)
    //     drill-down. The headline numbers live in the header chips; this
    //     section (collapsed by default) holds per-driver breakdowns.
    const budget = document.createElement("div");
    budget.id = "sbc-crawler-budget";
    budget.className = "sbc-section";

    // 3c. Devices - tier matrix: current scene cost vs EVERY device in
    //     DEVICE_CEILINGS at once (cpu tier vs ceiling, gpu tier vs gpuCeiling).
    //     Device-independent cost, device-dependent boundary - see device-tier.ts.
    const devices = document.createElement("div");
    devices.id = "sbc-crawler-devices";
    devices.className = "sbc-section";

    // 4. Details - conditional rows (spine, filter, heap, memory). Timing rows
    //    that already live in the bars (audio/loaf/async/longTasks) are NOT
    //    duplicated here.
    const details = document.createElement("div");
    details.id = "sbc-crawler-details";
    details.className = "sbc-section";

    // 4b. Hot functions - JS Self-Profiling sampled self-time (when enabled).
    const hot = document.createElement("div");
    hot.id = "sbc-crawler-hot";
    hot.className = "sbc-section";

    // 5. Record control - hidden until onRecord(cb) registered.
    const record = document.createElement("div");
    record.id = "sbc-crawler-record";
    record.className = "sbc-record";

    // 5b. Capture toolbar - built-in recorder: rec (start/stop) · save (JSON
    //     download) · load (open a saved recording offline in the explorer).
    const capture = document.createElement("div");
    capture.id = "sbc-crawler-capture";
    capture.className = "sbc-capture";
    const capLabel = document.createElement("span");
    capLabel.className = "sbc-capture-l";
    capLabel.textContent = "Capture";
    const recBtn = this._capBtn(
      "● rec",
      "Start/stop recording frames into a buffer for export",
      () => {
        this._toggleRecording();
      }
    );
    const saveBtn = this._capBtn(
      "⬇ save",
      "Download the recording (or the current buffer) as JSON",
      () => {
        this._saveRecording();
      }
    );
    const loadBtn = this._capBtn(
      "⬆ load",
      "Load a saved recording JSON and replay it in the explorer",
      () => this.fileInputEl?.click()
    );
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = "application/json,.json";
    fileInput.style.display = "none";
    fileInput.addEventListener("change", () => {
      this._onLoadFile();
    });
    capture.append(capLabel, recBtn, saveBtn, loadBtn, fileInput);
    this.recBtnEl = recBtn;
    this.fileInputEl = fileInput;

    // 6. Worst frame footer.
    const worst = document.createElement("div");
    worst.id = "sbc-crawler-worst";
    worst.className = "sbc-worst";
    worst.addEventListener("click", () => {
      this._onWorstClick();
    });
    this.inspector.onClose(() => {
      this._update();
    });

    // Delegated section-collapse toggle: any click on a `.sbc-section-toggle`
    // title flips its `data-section` id in `_sectionCollapsed` and re-renders.
    // (Bar-parent toggles stopPropagation on `.sbc-bars`, so they never reach here.)
    body.addEventListener("click", (e) => {
      const t = e.target as HTMLElement | null;
      const toggle = t?.closest(".sbc-section-toggle") as HTMLElement | null;
      const id = toggle?.dataset["section"];
      if (!id) return;
      if (this._sectionCollapsed.has(id)) this._sectionCollapsed.delete(id);
      else this._sectionCollapsed.add(id);
      this._update();
    });

    // Header sits OUTSIDE the scroll body so FPS stays pinned while the
    // sections below scroll.
    body.append(
      barsSection,
      countersSection,
      budget,
      devices,
      details,
      hot,
      record,
      capture,
      worst
    );
    el.append(badge, header, body);

    document.body.appendChild(el);
    this.el = el;
    this.badgeFpsEl = badgeFps;
    this.headerEl = header;
    this.barsEl = bars;
    this.barsTitleEl = barsTitle;
    this.barsBodyEl = barsBody;
    this.countersEl = countersSection;
    this.budgetEl = budget;
    this.devicesEl = devices;
    this.detailsEl = details;
    this.hotEl = hot;
    this.worstEl = worst;
    this.recordEl = record;
    if (this._minimized) el.classList.add("sbc-collapsed");
    this._renderRecordButton();
    this.timer = window.setInterval(() => {
      this._update();
    }, UPDATE_INTERVAL_MS);
    this._update();
  }

  private _setCollapsed(v: boolean): void {
    this._minimized = v;
    this.el?.classList.toggle("sbc-collapsed", v);
    // Expanding: the body was hidden and `_update` skipped the heavy render,
    // so the DOM is stale - redraw immediately, without waiting for a tick.
    if (!v) this._update();
  }

  unmount(): void {
    if (this.timer !== undefined) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    this.inspector.hide();
    this.el?.remove();
    this._barRows = [];
    this.el = undefined;
    this.headerEl = undefined;
    this.barsEl = undefined;
    this.barsTitleEl = undefined;
    this.barsBodyEl = undefined;
    this.countersEl = undefined;
    this.budgetEl = undefined;
    this.detailsEl = undefined;
    this.hotEl = undefined;
    this.worstEl = undefined;
    this.recordEl = undefined;
    this.recBtnEl = undefined;
    this.fileInputEl = undefined;
  }

  /**
   * Force-show the inspector for an arbitrary FrameCapture.
   * Used by tests when the worst frame cannot be captured
   * naturally (a fast CPU -> measuredCpuMs is always < target).
   */
  showInspectorFor(capture: import("../../types").FrameCapture): void {
    this.inspector.show(capture);
    this._update();
  }

  private _onWorstClick(): void {
    // Toggle: open the frame explorer (pinned to worst when present, else live).
    if (this.inspector.isOpen()) {
      this.inspector.hide();
      return;
    }
    this.inspector.open(
      this.profiler,
      this.profiler.getWorstFrame()?.frame.frameIdx
    );
    this._update();
  }

  // ── capture toolbar (record -> JSON -> offline replay) ─────────────────────

  private _capBtn(
    label: string,
    tip: string,
    onClick: () => void
  ): HTMLButtonElement {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "sbc-cap-btn";
    b.textContent = label;
    b.title = tip;
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      onClick();
    });
    return b;
  }

  private _toggleRecording(): void {
    if (this.profiler.isRecording()) this.profiler.stopRecording();
    else this.profiler.startRecording();
    this.syncRecorder();
  }

  /** Refresh the rec button's label/state (recording vs idle + live frame count).
   *  Public - Crawler calls it from start/stopRecording. */
  syncRecorder(): void {
    const btn = this.recBtnEl;
    if (!btn) return;
    if (this.profiler.isRecording()) {
      btn.textContent = `■ stop · ${this.profiler.recordedFrameCount()}`;
      btn.classList.add("sbc-cap-rec-on");
    } else {
      const n = this.profiler.recordedFrameCount();
      btn.textContent = n > 0 ? `● rec (${n})` : "● rec";
      btn.classList.remove("sbc-cap-rec-on");
    }
  }

  private _saveRecording(): void {
    const rec = this.profiler.getRecording();
    if (rec.frames.length === 0) {
      console.warn("[hud] nothing to save - no frames recorded");
      return;
    }
    const json = JSON.stringify(rec);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `frames-${rec.frames.length}-${rec.sessionId.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  private _onLoadFile(): void {
    const input = this.fileInputEl;
    const file = input?.files?.[0];
    if (!file) return;
    file
      .text()
      .then((text) => {
        let rec: import("../../types").FrameRecording;
        try {
          rec = JSON.parse(text) as import("../../types").FrameRecording;
        } catch {
          console.warn("[hud] load failed - invalid JSON");
          return;
        }
        if (!rec || !Array.isArray(rec.frames) || rec.frames.length === 0) {
          console.warn(
            "[hud] load failed - not a frame recording (expected { frames: [...] })"
          );
          return;
        }
        this.profiler.openRecording(rec);
      })
      .catch((err) => {
        console.warn("[hud] load failed:", err);
      })
      .finally(() => {
        if (input) input.value = "";
      }); // allow re-loading the same file
  }

  /** Render a collapsible section title (caret + label) into `el`, wiring it to
   *  the delegated toggle via `data-section`. Returns whether the section is
   *  collapsed -> caller skips the body. */
  private _sectionTitle(
    el: HTMLElement,
    id: string,
    text: string,
    tip: string
  ): boolean {
    const collapsed = this._sectionCollapsed.has(id);
    const title = document.createElement("div");
    title.className = collapsed
      ? "sbc-section-title sbc-section-toggle"
      : "sbc-section-title sbc-section-toggle sbc-open";
    title.dataset["section"] = id;
    title.textContent = `${collapsed ? "▸ " : "▾ "}${text}`;
    title.title = tip;
    el.append(title);
    return collapsed;
  }

  private _update(): void {
    if (!this.el) return;
    const frames = this.profiler.getFrames();
    const last = frames[frames.length - 1];
    if (!last) {
      if (this.headerEl) this.headerEl.textContent = "crawler: no frames yet";
      // Clear every section body so nothing stale lingers before the first frame.
      for (const el of [
        this.barsEl,
        this.countersEl,
        this.budgetEl,
        this.detailsEl,
        this.hotEl,
        this.worstEl,
      ]) {
        el?.replaceChildren();
      }
      return;
    }

    const recent = frames.slice(-FPS_WINDOW_FRAMES);
    const rafDeltas = recent.map((f) => f.rafDeltaMs).filter((v) => v > 0);
    const avgRafDelta =
      rafDeltas.length > 0
        ? rafDeltas.reduce((a, b) => a + b, 0) / rafDeltas.length
        : 0;
    const fps = avgRafDelta > 0 ? 1000 / avgRafDelta : 0;
    const budget = this.profiler.targetFrameMs;

    // Collapsed to a badge -> body hidden via display:none. Rebuilding the whole
    // bars/counters/details DOM every 250 ms is wasteful - we update only
    // the badge's live FPS counter and return.
    if (this._minimized) {
      this._updateBadge(fps, budget);
      return;
    }

    const view = buildAveragedView(frames, this.profiler.usesSharedTicker);
    const droppedCount = recent.filter((f) => f.frameDropped).length;
    const cpuQ = this.stats.quantiles(
      (f) => f.measuredCpuMs,
      FPS_WINDOW_FRAMES
    );
    // Throttled cost compute (see _costTick) - the gpuCost scene walk is heavy.
    if (this._costTick <= 0) {
      this._wcCache = this.profiler.getWorkloadCost();
      this._gcCache = this.profiler.getGpuCost();
      this._costTick = CrawlerHud.COST_REFRESH_TICKS;
    }
    this._costTick--;
    const workload = this._wcCache;
    const gpuCost = this._gcCache;

    this._renderHeader(
      fps,
      avgRafDelta,
      budget,
      droppedCount,
      recent.length,
      view,
      last,
      cpuQ,
      workload,
      gpuCost
    );
    if (view) this._renderBars(view, recent);
    this._renderCounters(last);
    this._renderCost(workload, gpuCost);
    this._renderDevices(workload, gpuCost);
    this._renderDetails(view, last);
    this._renderHot();
    this._renderWorst();
    this.syncRecorder(); // keep the live recorded-frame count fresh
  }

  /** Top sampled self-time functions (JS Self-Profiling). Hidden when the API
   *  is off/unsupported or no window has completed. De-blackboxes derived
   *  buckets - e.g. shows Spine `computeWorldVertices` that hides in `transforms`,
   *  and surfaces the profiler's OWN hot functions (honest self-cost). */
  private _renderHot(): void {
    const el = this.hotEl;
    if (!el) return;
    const top = this.profiler.getSelfProfileTop();
    if (top.length === 0) {
      el.style.display = "none";
      el.replaceChildren();
      return;
    }
    el.style.display = "";
    el.replaceChildren();

    if (
      this._sectionTitle(
        el,
        "hot",
        "Hot functions · sampled self-time",
        "W3C JS Self-Profiling (window.Profiler): statistical sampler, near-zero overhead. Self-time per function over the last window. Reveals work hidden in derived buckets (transforms/render-other) and the profiler's own cost."
      )
    )
      return;

    const maxMs = top[0]!.selfMs || 1;
    for (const fn of top) {
      const row = document.createElement("div");
      row.className = "sbc-kv";
      const label = document.createElement("span");
      label.className = "sbc-kv-l";
      label.textContent =
        fn.name.length > 28 ? fn.name.slice(0, 27) + "…" : fn.name;
      label.title = `${fn.name}${fn.location ? "  @ " + fn.location : ""}`;
      const value = document.createElement("span");
      value.className = "sbc-kv-v";
      value.textContent = `${fn.selfMs.toFixed(1)}ms · ${fn.pct.toFixed(0)}%`;
      value.title = label.title;
      // subtle inline bar via background gradient on the value
      const w = Math.min(100, (fn.selfMs / maxMs) * 100);
      value.style.background = `linear-gradient(90deg, rgba(125, 156, 178,0.18) ${w.toFixed(0)}%, transparent ${w.toFixed(0)}%)`;
      row.append(label, value);
      el.append(row);
    }
  }

  /** Update only the badge's FPS label (number + color). Used both when
   *  collapsed (the fast path) and from `_renderHeader`. */
  private _updateBadge(fps: number, budget: number): void {
    if (!this.badgeFpsEl) return;
    this.badgeFpsEl.textContent = fps.toFixed(0);
    this.badgeFpsEl.style.color = fpsColorFor(fps, budget);
  }

  private _renderHeader(
    fps: number,
    avgRafDelta: number,
    budget: number,
    dropped: number,
    windowFrames: number,
    view: BarView | null,
    last: FrameRecord,
    cpuQ: ReturnType<typeof this.stats.quantiles>,
    workload: WorkloadCost | undefined,
    gpuCost: GpuCost | undefined
  ): void {
    if (!this.headerEl) return;
    // Total frame ms = rafDelta = prePixi + pixi + postPixi (I1 invariant).
    // NOT cpuActive + postPixi - spineShared lies INSIDE postPixi, and
    // double-adding would give sum > rafDelta.
    const totalMs = view
      ? view.prePixiMs + view.pixiMs + view.postPixiMs
      : last.rafDeltaMs;
    // CPU "active" - work that we own (pre + pixi only, no postPixi
    // browser-side). spineShared is shown separately in bars, not here.
    const cpuMs = view ? view.prePixiMs + view.pixiMs : last.measuredCpuMs;
    const ratio = totalMs / budget;
    const statusColor =
      ratio > 1 ? COLOR_OVERRUN : ratio > 0.85 ? "#c2a878" : "#8fb89a";
    const fpsColor = fpsColorFor(fps, budget);

    // Keep the collapsed badge's FPS readout live even while expanded.
    this._updateBadge(fps, budget);

    this.headerEl.replaceChildren();

    // Left column: FPS big number.
    const left = document.createElement("div");
    left.className = "sbc-hd-col sbc-hd-left";
    const fpsRow = document.createElement("div");
    fpsRow.className = "sbc-hd-fpsrow";
    const dot = document.createElement("span");
    dot.className = "sbc-dot";
    dot.style.background = statusColor;
    dot.style.boxShadow = `0 0 8px ${statusColor}99`;
    const fpsNum = document.createElement("span");
    fpsNum.className = "sbc-fps";
    fpsNum.style.color = fpsColor;
    fpsNum.textContent = fps.toFixed(0);
    const fpsLabel = document.createElement("span");
    fpsLabel.className = "sbc-fps-label";
    fpsLabel.textContent = `fps · ${avgRafDelta.toFixed(1)}ms · drop ${dropped}/${windowFrames}`;
    fpsRow.append(dot, fpsNum, fpsLabel);
    left.append(fpsRow);

    // Workload-cost chip. The bare number is meaningless on an open measure, so
    // the chip names WHAT dominates (bottleneck driver) right on the face - that's
    // the actionable bit. Verbose units/provenance go in the tooltip. Neutral
    // color (open measure, no grade); red ONLY when a per-game threshold is set
    // and status==='over'.
    if (workload) {
      const chip = document.createElement("div");
      chip.className = "sbc-budget-chip";
      // Red ONLY when a device ceiling resolves AND the scene is over it
      // (tier.ratio > 1). Open measure -> neutral otherwise.
      const over = !!workload.tier && workload.tier.ratio > 1;
      const color = over ? COLOR_OVERRUN : "rgba(158, 161, 170, 0.8)";
      chip.style.color = color;
      chip.style.borderColor = `${color}66`;
      // Device-tier label (light/medium/heavy/over) + `/ceiling` on the face if a ceiling is set.
      const thr = workload.tier ? `/${workload.tier.ceiling}` : "";
      const tierTxt = workload.tier ? ` · ${workload.tier.label}` : "";
      // e.g. "cpu 2.0/5 · heavy · spineInstances"  - "2.0 of what" answered by ceiling+driver.
      chip.textContent = `cpu ${workload.cost.toFixed(1)}${thr}${tierTxt} · ${workload.bottleneck}`;
      const tierTip = workload.tier
        ? ` Device-tier: ${workload.tier.label} (${(workload.tier.ratio * 100).toFixed(0)}% of ceiling ${workload.tier.ceiling}${workload.tier.deviceKey ? `, ${workload.tier.deviceKey}` : ""}) - UX layer, a device-dependent boundary, NOT part of the measure.`
        : " No ceiling set (config.deviceKey/ceiling).";
      chip.title = `Workload-cost = ${workload.cost.toFixed(2)} (an open measure in fixed units: sum weight*counter, device+game-independent - NO grade/norm; the number alone is not "good/bad", compare against your own runs). Dominant: ${workload.bottleneck}.${tierTip} The real slowdown is device-dependent (the device row in the Cost section). Full per-driver breakdown - the Cost section.`;
      left.append(chip);
    }

    // GpuCost chip. Same idea: name the bottleneck on the face. gpu-cost is a
    // device-flavored ms-EQUIVALENT (both axes calibrated to ms) -> show "~Nms"
    // ("~" = footprint-proxy, not measured). The verbose coverage (fill=proxy,
    // particle-blind, explains-%) lives in the tooltip + the Cost-section banner;
    // a bare "⚠" appears on the face ONLY for a real gap (particle-blind / bounds
    // errors), not for the always-true proxy nature.
    if (gpuCost) {
      const chip = document.createElement("div");
      chip.className = "sbc-budget-chip";
      const over = !!gpuCost.tier && gpuCost.tier.ratio > 1;
      const color = over ? COLOR_OVERRUN : "rgba(158, 161, 170, 0.8)";
      chip.style.color = color;
      chip.style.borderColor = `${color}66`;
      const cov = gpuCost.coverage;
      const gap = cov.missing.includes("particle-fill") || cov.boundsErrors > 0;
      // Device-tier label (separate gpuCeiling) if set.
      const tierTxt = gpuCost.tier ? ` · ${gpuCost.tier.label}` : "";
      // e.g. "gpu ~2.0ms · heavy · fill"  ("~" = proxy estimate, ms-equivalent).
      chip.textContent = `gpu ~${gpuCost.cost.toFixed(1)}ms${tierTxt} · ${gpuCost.bottleneck}${gap ? " ⚠" : ""}`;
      left.append(chip);
    }

    // Right column: frame budget summary + collapse toggle.
    const right = document.createElement("div");
    right.className = "sbc-hd-col sbc-hd-right";
    const totalLine = document.createElement("div");
    totalLine.className = "sbc-total";
    if (ratio > 1) totalLine.style.color = COLOR_OVERRUN;
    totalLine.textContent = `${totalMs.toFixed(2)} / ${budget.toFixed(1)} ms`;
    totalLine.title = "frame total (prePixi + pixi + postPixi) / budget";
    const subLine = document.createElement("div");
    subLine.className = "sbc-sub";
    const cpuQStr = cpuQ ? ` · p95 ${cpuQ.p95.toFixed(1)}ms` : "";
    // gpu (EXT-timer ms) lives in the Frame-breakdown GPU bar - not duplicated here.
    subLine.textContent = `cpu ${cpuMs.toFixed(1)}ms${cpuQStr}`;
    subLine.title =
      "cpu = prePixi + pixi (owned work) · p95 over window. GPU ms -> Frame-breakdown bar.";
    right.append(totalLine, subLine);

    const collapseBtn = document.createElement("button");
    collapseBtn.type = "button";
    collapseBtn.className = "sbc-collapse-btn";
    collapseBtn.textContent = "-";
    collapseBtn.title = "Collapse to badge";
    collapseBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this._setCollapsed(true);
    });

    this.headerEl.append(left, right, collapseBtn);
  }

  private _renderCounters(last: FrameRecord): void {
    const el = this.countersEl;
    if (!el) return;
    el.replaceChildren();
    if (
      this._sectionTitle(
        el,
        "counters",
        "Counters",
        "Per-frame GL/render counters (last frame)."
      )
    )
      return;
    const c = last.counters;
    const gpuTexMb = this.profiler.getGpuTextureMb();
    // tip = developer-friendly expansion of the terse label (shown on hover).
    const cells: { label: string; value: string; tip: string }[] = [
      {
        label: "draws",
        value: String(c.drawCalls),
        tip: "GL draw calls this frame (drawElements/drawArrays)",
      },
      {
        label: "rebuilds",
        value: String(c.rebuilds),
        tip: "batcher buildStart events - instruction-set rebuilds",
      },
      {
        label: "breaks",
        value: String(c.batchBreaks),
        tip: "batch.break splits (state/shader/texture changes)",
      },
      {
        label: "instr",
        value: String(c.instructions),
        tip: "render instructions in the instruction set",
      },
      {
        label: "groups",
        value: String(c.renderGroupsRebuilt),
        tip: "render groups rebuilt this frame",
      },
      {
        label: "state",
        value: String(c.stateChanges),
        tip: "GL state id changes (GlStateSystem.set)",
      },
      {
        label: "shader",
        value: String(c.shaderCompiles),
        tip: "shader program compiles - spikes = hot recompile",
      },
      {
        label: "buf",
        value: `${c.bufferUploads}/${formatBytes(c.bufferBytesUploaded)}`,
        tip: "buffer uploads / bytes uploaded this frame",
      },
      {
        label: "tex active",
        value: String(last.textures.activeGpuCount),
        tip: "textures resident on the GPU",
      },
      {
        label: "tex MB",
        value: gpuTexMb.toFixed(1),
        tip: "resident GPU texture memory (MB)",
      },
      {
        label: "tex up",
        value: String(last.textures.realGpuUploadsThisFrame),
        tip: "real GPU texture uploads this frame",
      },
      {
        label: "unacc",
        value: `${last.unaccountedMs.toFixed(2)}ms`,
        tip: "unaccounted ms - frame time not attributed to any measured phase",
      },
    ];

    const grid = document.createElement("div");
    grid.className = "sbc-counters";
    for (const cell of cells) {
      const div = document.createElement("div");
      div.className = "sbc-counter";
      const label = document.createElement("span");
      label.className = "sbc-counter-l";
      label.textContent = cell.label;
      label.title = cell.tip;
      const value = document.createElement("span");
      value.className = "sbc-counter-v";
      value.textContent = cell.value;
      value.title = cell.tip;
      div.append(label, value);
      grid.append(div);
    }
    el.append(grid);
  }

  private _renderDetails(view: BarView | null, last: FrameRecord): void {
    const el = this.detailsEl;
    if (!el) return;
    el.replaceChildren();

    // Only metrics that DON'T already have a home in the Frame-breakdown bars
    // live here. Timing rows (audio/loaf/async/longTasks) are NOT duplicated -
    // they're sticky rows in the PARALLEL/INFO section of the bars.
    const rows: { label: string; value: string; tip: string }[] = [];

    // Spine - real wall-clock (cpu+pipe); bars show the cpu phase split only.
    const s = view?.spineSummary;
    if (s && s.instanceCount > 0) {
      rows.push({
        label: "spine",
        value: `${s.totalRealMs.toFixed(2)}ms · ${s.instanceCount} inst · ${s.totalBones} bones (cpu ${s.cpuMs.toFixed(2)} + pipe ${s.pipeMs.toFixed(2)})`,
        tip: "Spine real wall-clock = cpu (5 Ticker.shared phases) + pipe (3 SpinePipe phases); attach nested in pipe",
      });
      const c = view.churn;
      if (c) {
        rows.push({
          label: "spine churn",
          value: `${c.spinePipeMs.toFixed(2)}ms (${c.spineSharePct.toFixed(0)}% of build+upd)`,
          tip: "share of build+updateRenderables ms that is Spine pipe churn (structureDidChange every frame)",
        });
      }
    }

    // Filter - push/apply/pop split (the bars only show the filter pipe's
    // execute slice, a different scope).
    const f = view?.filter;
    if (f) {
      rows.push({
        label: "filter",
        value: `${f.passes.toFixed(1)} passes · push ${f.pushMs.toFixed(2)} apply ${f.applyMs.toFixed(2)} pop ${f.popMs.toFixed(2)}`,
        tip: "FilterSystem push/applyFilter/pop ms + applyFilter pass count",
      });
    }

    // Heap (JS heap MB; long-tasks live in the bars PARALLEL section).
    const heap = last.browser.jsHeapMb;
    if (heap !== undefined) {
      rows.push({
        label: "heap",
        value: `${heap.toFixed(1)}MB`,
        tip: "JS heap usedJSHeapSize (Chrome only). Long-task ms -> Frame-breakdown PARALLEL section.",
      });
    }
    // Process-level memory (measureUserAgentSpecificMemory) - whole footprint by type.
    const mem = this.profiler.getMemoryMeasurement();
    if (mem) {
      const types = mem.byType
        .slice(0, 3)
        .map((t) => `${t.type.split("+")[0]} ${t.mb.toFixed(1)}`)
        .join(" · ");
      rows.push({
        label: "memory (UA)",
        value: `${mem.totalMb.toFixed(1)}MB${types ? " · " + types : ""}`,
        tip: "performance.measureUserAgentSpecificMemory: total process memory attributed to the page (JS + DOM + workers + shared), by type. Sampled on a slow interval; needs cross-origin isolation.",
      });
    }

    if (rows.length === 0) {
      el.style.display = "none";
      return;
    }
    el.style.display = "";
    if (
      this._sectionTitle(
        el,
        "details",
        "Details",
        "Spine / filter / memory - metrics without a Frame-breakdown bar of their own."
      )
    )
      return;
    for (const r of rows) {
      const row = document.createElement("div");
      row.className = "sbc-kv";
      const label = document.createElement("span");
      label.className = "sbc-kv-l";
      label.textContent = r.label;
      label.title = r.tip;
      const value = document.createElement("span");
      value.className = "sbc-kv-v";
      value.textContent = r.value;
      value.title = r.tip;
      row.append(label, value);
      el.append(row);
    }
  }

  /** Append a sub-block heading inside the merged Cost section. */
  private _subhead(el: HTMLElement, text: string, tip: string): void {
    const h = document.createElement("div");
    h.className = "sbc-subhead";
    h.textContent = text;
    h.title = tip;
    el.append(h);
  }

  /** Append one driver row (label + `contribution (value)` with an inline bar). */
  private _driverRow(
    el: HTMLElement,
    name: string,
    isBottleneck: boolean,
    contribution: number,
    valStr: string,
    tip: string,
    maxC: number,
    grad: string
  ): void {
    const row = document.createElement("div");
    row.className = "sbc-kv";
    if (isBottleneck) row.classList.add("sbc-budget-bottleneck");
    const label = document.createElement("span");
    label.className = "sbc-kv-l";
    label.textContent = name;
    label.title = tip;
    const value = document.createElement("span");
    value.className = "sbc-kv-v";
    value.textContent = `${contribution.toFixed(2)} (${valStr})`;
    value.title = tip;
    const w = Math.min(100, (contribution / maxC) * 100);
    value.style.background = `linear-gradient(90deg, ${grad} ${w.toFixed(0)}%, transparent ${w.toFixed(0)}%)`;
    row.append(label, value);
    el.append(row);
  }

  /** Merged Cost section: WorkloadCost (cpu/workload axes) + GpuCost (fill proxy
   *  + filters) drill-down. The at-a-glance numbers are the header chips; this
   *  collapsible section holds per-driver contributions, the device reality
   *  indicator, and the loud gpu coverage banner. */
  private _renderCost(
    wc: WorkloadCost | undefined,
    gc: GpuCost | undefined
  ): void {
    const el = this.budgetEl;
    if (!el) return;
    if (!wc && !gc) {
      el.style.display = "none";
      el.replaceChildren();
      return;
    }
    el.style.display = "";
    el.replaceChildren();
    if (
      this._sectionTitle(
        el,
        "cost",
        "Cost · workload + gpu",
        "Two open device+game-independent measures (fixed units, no saturation): workload = sum weight*counter (cpu/bandwidth), gpu = fill footprint-proxy + filters. Headline numbers are in the header chips; here is the per-driver breakdown. NOTE filterPasses is in BOTH - do not add workload+gpu as a full price."
      )
    )
      return;

    // ---- workload sub-block ----
    if (wc) {
      const thr = wc.tier
        ? ` / ${wc.tier.ceiling} (${(wc.tier.ratio * 100).toFixed(0)}% · ${wc.tier.label})`
        : "";
      this._subhead(
        el,
        `workload  ${wc.cost.toFixed(1)}${thr} · ⚠ ${wc.bottleneck}`,
        "cost = sum weight*value (open, fixed units); bottleneck = the driver with the max contribution. value = p95/mean over the window. The same scene -> the same number on any hardware/game."
      );
      const maxC = Math.max(1e-9, wc.drivers[0]?.contribution ?? 1);
      for (const d of wc.drivers) {
        const v = fmtDriverVal(d.name, d.value);
        this._driverRow(
          el,
          d.name,
          d.name === wc.bottleneck,
          d.contribution,
          v,
          `${d.name}: ${d.aggregation} ${v} x weight ${d.weight} = contribution ${d.contribution.toFixed(2)}`,
          maxC,
          "#7d9cb22e"
        );
      }
      // Device reality - a device-dependent indicator, does NOT affect cost.
      const dev = document.createElement("div");
      dev.className = "sbc-kv sbc-budget-device";
      const dl = document.createElement("span");
      dl.className = "sbc-kv-l";
      dl.textContent = "device";
      dl.title =
        "Device-dependent real indicator: share of dropped frames + p95 rafDelta. NOT part of cost.";
      const dvv = document.createElement("span");
      dvv.className = "sbc-kv-v";
      dvv.textContent = `drop ${(wc.device.dropRate * 100).toFixed(0)}% · p95 ${wc.device.frameP95Ms.toFixed(1)}ms`;
      dvv.title = dl.title;
      dev.append(dl, dvv);
      el.append(dev);
    }

    // ---- gpu sub-block ----
    if (gc) {
      const thr = gc.tier
        ? ` / ${gc.tier.ceiling} (${(gc.tier.ratio * 100).toFixed(0)}% · ${gc.tier.label})`
        : "";
      this._subhead(
        el,
        `gpu  ${gc.cost.toFixed(1)}${thr} · ⚠ ${gc.bottleneck}`,
        "sum weight*value over GPU axes. fill = sum footprint of visible drawables x dpr^2 (a MONOTONIC overestimate). fill from the LIVE stage (a snapshot). != gpu_ms (a direct measurement)."
      );
      // Coverage banner - neutral when clean, warning-yellow only on a real gap.
      const dirty =
        gc.coverage.missing.length > 0 || gc.coverage.boundsErrors > 0;
      const note = document.createElement("div");
      note.className = "sbc-kv sbc-budget-note";
      if (!dirty) note.style.color = "rgba(158, 161, 170, 0.5)"; // neutral - no missing/errors
      const errNote =
        gc.coverage.boundsErrors > 0
          ? ` - ${gc.coverage.boundsErrors} bounds-err (fill underreported)`
          : "";
      note.textContent = `fill=proxy${gc.coverage.missing.length ? " · missing " + gc.coverage.missing.join("/") : ""} · explains ~${(gc.coverage.explains * 100).toFixed(0)}% gpu_ms${errNote}`;
      el.append(note);
      const maxC = Math.max(1e-9, gc.drivers[0]?.contribution ?? 1);
      for (const d of gc.drivers) {
        const valStr =
          d.name === "fill"
            ? `${(d.value / 1e6).toFixed(2)}M px`
            : d.name === "vertices"
              ? `${(d.value / 1e3).toFixed(1)}k verts`
              : d.value.toFixed(1);
        this._driverRow(
          el,
          d.name,
          d.name === gc.bottleneck,
          d.contribution,
          valStr,
          `${d.name}: ${valStr} x weight ${d.weight} = contribution ${d.contribution.toFixed(2)}`,
          maxC,
          "#b58c782e"
        );
      }
    }
  }

  /** Devices section: the current scene's cost tiered against EVERY device in
   *  DEVICE_CEILINGS at once. cost is device-independent (one number); the boundary
   *  is per-device - cpu vs `ceiling`, gpu vs `gpuCeiling`. A row turns red when the
   *  scene is `over` on either axis for that device. ★ marks the configured deviceKey.
   *  Bands honor `workloadCost.tierBands/tierLabels` (fractions are axis-agnostic). */
  private _renderDevices(
    wc: WorkloadCost | undefined,
    gc: GpuCost | undefined
  ): void {
    const el = this.devicesEl;
    if (!el) return;
    if (!wc && !gc) {
      el.style.display = "none";
      el.replaceChildren();
      return;
    }
    el.style.display = "";
    el.replaceChildren();
    if (
      this._sectionTitle(
        el,
        "devices",
        "Devices · tier matrix",
        "The current scene against ALL table devices at once. cost is device-independent (one number); the boundary is per-device: cpu vs ceiling, gpu vs gpuCeiling. NOTE ceilings are SEED placeholders (calibrate ramp-to-drop). A single scalar is mix-dependent (honest within one content band). * = the configured deviceKey."
      )
    )
      return;

    const wcCfg = this.profiler.workloadCostConfig;
    const bandsCfg: DeviceTierConfig = {};
    if (wcCfg?.tierBands) bandsCfg.tierBands = wcCfg.tierBands;
    if (wcCfg?.tierLabels) bandsCfg.tierLabels = wcCfg.tierLabels;
    const cfgKey = wcCfg?.deviceKey;

    for (const dev of Object.values(DEVICE_CEILINGS)) {
      const cpu = wc ? computeTier(wc.cost, dev.ceiling, bandsCfg) : undefined;
      const gpu = gc
        ? computeTier(gc.cost, dev.gpuCeiling, bandsCfg)
        : undefined;
      const over = (cpu && cpu.ratio > 1) || (gpu && gpu.ratio > 1);

      const row = document.createElement("div");
      row.className = "sbc-kv";
      const label = document.createElement("span");
      label.className = "sbc-kv-l";
      label.textContent = `${dev.key === cfgKey ? "★ " : ""}${dev.key}`;
      label.title = `${dev.label} - ceiling ${dev.ceiling} (cpu), gpuCeiling ${dev.gpuCeiling} (ms-equiv). SEED placeholder.`;
      const value = document.createElement("span");
      value.className = "sbc-kv-v";
      const cpuTxt = cpu
        ? `cpu ${cpu.label} ${(cpu.ratio * 100).toFixed(0)}%`
        : "";
      const gpuTxt = gpu
        ? `gpu ${gpu.label} ${(gpu.ratio * 100).toFixed(0)}%`
        : "";
      value.textContent = [cpuTxt, gpuTxt].filter(Boolean).join(" · ");
      if (over) value.style.color = COLOR_OVERRUN;
      value.title = label.title;
      row.append(label, value);
      el.append(row);
    }
  }

  private _renderRecordButton(): void {
    const el = this.recordEl;
    if (!el) return;
    if (!this.recordCb) {
      el.style.display = "none";
      el.replaceChildren();
      return;
    }
    el.style.display = "flex";
    el.replaceChildren();

    const label = document.createElement("span");
    label.className = "sbc-record-label";
    label.textContent = "Recording";

    const btn = document.createElement("button");
    btn.type = "button";
    const active = this.recordingActive;
    btn.textContent = active ? "■ Stop" : "● Start";
    btn.className = active ? "sbc-btn sbc-btn-active" : "sbc-btn";
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const next = !this.recordingActive;
      this.recordingActive = next;
      this._renderRecordButton();
      const cb = this.recordCb;
      if (!cb) return;
      Promise.resolve()
        .then(() => cb(next))
        .catch((err) => {
          console.warn("[hud] onRecord callback failed:", err);
        });
    });

    el.append(label, btn);
  }

  private _renderWorst(): void {
    if (!this.worstEl) return;
    const worst = this.profiler.getWorstFrame();
    this.worstEl.replaceChildren();
    const left = document.createElement("span");
    left.className = "sbc-worst-l";
    left.textContent = "Frames";
    left.title =
      "Open the frame explorer: timeline over the ring buffer - click any frame to inspect its metrics. Worst frame shown here.";
    const mid = document.createElement("span");
    mid.className = "sbc-worst-mid";
    // Still surfaces the worst frame at a glance; clicking opens the explorer.
    mid.textContent = worst
      ? `worst #${worst.frame.frameIdx} · ${worst.frame.measuredCpuMs.toFixed(1)}ms`
      : "-";
    const action = document.createElement("span");
    action.className = "sbc-worst-action";
    action.textContent = this.inspector.isOpen() ? "▾ open" : "▸ explore";
    this.worstEl.append(left, mid, action);
  }

  private _renderBars(view: BarView, recent: FrameRecord[]): void {
    if (!this.barsEl) return;
    // Section collapse: sync the caret on the static title, hide the body
    // (legend + bars) when collapsed, and skip the (heavy) row build entirely.
    const sectionCollapsed = this._sectionCollapsed.has("bars");
    if (this.barsTitleEl) {
      this.barsTitleEl.textContent = `${sectionCollapsed ? "▸ " : "▾ "}Frame breakdown`;
      this.barsTitleEl.classList.toggle("sbc-open", !sectionCollapsed);
    }
    if (this.barsBodyEl)
      this.barsBodyEl.style.display = sectionCollapsed ? "none" : "";
    if (sectionCollapsed) return;
    const budget = this.profiler.targetFrameMs;

    // ADDITIVE PARTITION (Σ top-level == rafDelta):
    //   rafDelta = prePixiMs + pixiMs + postPixiMs   (invariant I1)
    //
    // spineSharedMs (5 Ticker.shared phases) sits INSIDE one of the parents,
    // depending on the ticker (view.spineInPrePixi):
    //   - shared ticker -> inside prePixi (Spine NORMAL=0 runs before app.render)
    //   - separate -> inside postPixi (Ticker.shared ticks after app.ticker)
    // The corresponding parent is split into a spine segment + a non-spine remainder.
    //
    // The GPU runs in PARALLEL with the CPU -> not in the sum, a separate row below.
    // Filter info lives INSIDE execute (via the filter pipe) -> shown
    // as a drill in execute, not as a separate parent.
    const frameTotalMs = view.prePixiMs + view.pixiMs + view.postPixiMs;
    const maxMs = Math.max(frameTotalMs, view.gpuMs, budget);

    const sp = view.spineSummary;
    const hasSpine = !!sp && sp.instanceCount > 0;
    const spineInPre = hasSpine && view.spineInPrePixi;
    const spineInPost = hasSpine && !view.spineInPrePixi;

    // 5 Ticker.shared sub-phases of spine-cpu - shared render for the prePixi/postPixi branch.
    const pushSpineCpuRows = (depth: number): void => {
      const cpuParent = Math.max(sp!.cpuMs, 0.001);
      items.push({
        label: "animState.update",
        ms: sp!.animationStateUpdateMs,
        color: COLOR_SPINE,
        depth,
        parentMs: cpuParent,
      });
      items.push({
        label: "skeleton.prePhysics",
        ms: sp!.skeletonPrePhysicsMs,
        color: COLOR_SPINE,
        depth,
        parentMs: cpuParent,
      });
      items.push({
        label: "animState.apply",
        ms: sp!.animationApplyMs,
        color: COLOR_SPINE,
        depth,
        parentMs: cpuParent,
      });
      items.push({
        label: "worldTransform",
        ms: sp!.worldTransformMs,
        color: COLOR_SPINE,
        depth,
        parentMs: cpuParent,
      });
      items.push({
        label: "slotObjects",
        ms: sp!.slotObjectsMs,
        color: COLOR_SPINE,
        depth,
        parentMs: cpuParent,
      });
    };

    // STABLE LAYOUT: rows shown unconditionally - bars at 0 ms still render with
    // 0% fill. Prevents popping (UI jump) when a metric drops below threshold.
    // Conditional secs (Spine/Filter/LoAF) sticky-toggle: appear when we see
    // data, disappear NOT instantly - needs sticky logic in future. For now only
    // hard-conditional on presence in the view (parent.instanceCount, filter.passes etc.).
    const items: BarItem[] = [];

    // 1. prePixi - under the shared ticker spine-cpu lies HERE (Spine NORMAL before app.render).
    if (spineInPre) {
      items.push({
        label: "prePixi",
        ms: view.prePixiMs,
        color: COLOR_PRE,
        depth: 0,
        isHeader: true,
        parentMs: frameTotalMs,
      });
      const preParent = Math.max(view.prePixiMs, 0.001);
      items.push({
        label: `spine cpu · ${sp.instanceCount} inst (shared ticker)`,
        ms: view.spineSharedMs,
        color: COLOR_SPINE,
        depth: 1,
        isHeader: true,
        parentMs: preParent,
        collapseKey: "spine-cpu",
      });
      pushSpineCpuRows(2);
      const preNonSpine = Math.max(0, view.prePixiMs - view.spineSharedMs);
      items.push({
        label: "user listeners + idle",
        ms: preNonSpine,
        color: COLOR_PRE,
        depth: 1,
        parentMs: preParent,
      });
    } else {
      items.push({
        label: "prePixi",
        ms: view.prePixiMs,
        color: COLOR_PRE,
        depth: 0,
        parentMs: frameTotalMs,
      });
    }

    // 2. pixi (top-level parent - runner window prerender->tickEnd).
    items.push({
      label: "pixi",
      ms: view.pixiMs,
      color: COLOR_PIXI,
      depth: 0,
      isHeader: true,
      parentMs: frameTotalMs,
    });
    const ins = view.pixiInternals;
    const pixiParent = view.pixiMs;
    if (ins) {
      items.push({
        label: "boilerplate",
        ms: ins.boilerplateMs,
        color: COLOR_PIXI_BOILER,
        depth: 1,
        isHeader: true,
        parentMs: pixiParent,
      });
      // Phase marks - breakdown boilerplate aggregate. Σ ≈ boilerplate
      // (the renderMs body's separate phases are transforms+build+exec etc.).
      const blParent = Math.max(ins.boilerplateMs, 0.001);
      items.push({
        label: "prerender",
        ms: ins.prerenderMs,
        color: COLOR_PIXI_BOILER,
        depth: 2,
        parentMs: blParent,
      });
      items.push({
        label: "renderStart",
        ms: ins.renderStartMs,
        color: COLOR_PIXI_BOILER,
        depth: 2,
        parentMs: blParent,
      });
      items.push({
        label: "renderEnd",
        ms: ins.renderEndMs,
        color: COLOR_PIXI_BOILER,
        depth: 2,
        parentMs: blParent,
      });
      items.push({
        label: "postrender tail",
        ms: ins.postrenderTailMs,
        color: COLOR_PIXI_BOILER,
        depth: 2,
        parentMs: blParent,
      });
      items.push({
        label: "transforms",
        ms: ins.transformsMs,
        color: COLOR_PIXI_XFORM,
        depth: 1,
        parentMs: pixiParent,
      });
      // Build cluster sub-parent. SpinePipe.{add,update,validate}Renderable
      // called from RenderGroupSystem._buildInstructions/_updateRenderables
      // -> the spine pipe info row lives HERE, not under execute.
      items.push({
        label: "build+upd+upload",
        ms: ins.buildClusterMs,
        color: COLOR_PIXI_BUILD,
        depth: 1,
        isHeader: true,
        parentMs: pixiParent,
      });
      const bcParent = Math.max(ins.buildClusterMs, 0.001);
      items.push({
        label: "buildInstr",
        ms: ins.buildInstructionsMs,
        color: COLOR_PIXI_BUILD,
        depth: 2,
        parentMs: bcParent,
      });
      items.push({
        label: "updateRend",
        ms: ins.updateRenderablesMs,
        color: COLOR_PIXI_BUILD,
        depth: 2,
        parentMs: bcParent,
      });
      items.push({
        label: "batchUpload",
        ms: ins.batchUploadMs,
        color: COLOR_PIXI_BUILD,
        depth: 2,
        parentMs: bcParent,
      });
      // (Spine pipe / attach breakdown is NOT shown in the bar - they are nested in
      //  buildInstr/updateRend, not additive, and attach is inflated by timer overhead
      //  -> misleading. The real per-pipe self-time + attach live in
      //  the worst-frame inspector and in Details "spine churn".)
      // Execute sub-parent (per-pipe drill).
      items.push({
        label: "execute",
        ms: ins.executeMs,
        color: COLOR_PIXI_EXEC,
        depth: 1,
        isHeader: true,
        parentMs: pixiParent,
      });
      const exParent = Math.max(ins.executeMs, 0.001);
      if (view.perPipe) {
        for (let i = 0; i < view.perPipe.length; i++) {
          const p = view.perPipe[i]!;
          // Pipe-specific counter annotations:
          //   batch  -> rebuilds + breaks (batch break = batch pipe wraps)
          //   filter -> passes (number of applyFilter invocations)
          //   particle/mesh/graphics - generic invocations + dc
          let extra = "";
          if (p.name === "batch") {
            const rebuilds = view.batchRebuildsAvg ?? 0;
            const breaks = view.batchBreaksAvg ?? 0;
            extra = ` · ${rebuilds.toFixed(1)}rb ${breaks.toFixed(1)}br`;
          } else if (p.name === "filter" && view.filter) {
            extra = ` · ${view.filter.passes.toFixed(1)}pass`;
          }
          items.push({
            label: `${p.name} · ${p.invocations.toFixed(0)}× ${p.drawCalls.toFixed(0)}dc${extra}`,
            ms: p.ms,
            color: pipeColor(i),
            depth: 2,
            parentMs: exParent,
          });
        }
      }
      // (FilterSystem push/apply/pop breakdown is NOT shown in the bar - it is
      //  nested in execute, not additive, and its scope does not match the per-pipe
      //  'filter' row -> confusing. The real per-pipe filter execute stays
      //  above; the full split - in the worst-frame inspector + Details "filter".)
      items.push({
        label: "render-other",
        ms: ins.renderOtherMs,
        color: COLOR_PIXI_OTHER,
        depth: 1,
        parentMs: pixiParent,
      });
      items.push({
        label: "gc",
        ms: ins.gcMs,
        color: COLOR_PIXI_GC,
        depth: 1,
        parentMs: pixiParent,
      });
    }

    // 3. postPixi (always shown). With separate tickers spine-cpu lies HERE
    // (Ticker.shared ticks after app.ticker); under the shared one - already counted in prePixi.
    items.push({
      label: "postPixi",
      ms: view.postPixiMs,
      color: "#7589A3",
      depth: 0,
      isHeader: true,
      parentMs: frameTotalMs,
    });
    const ppParent = Math.max(view.postPixiMs, 0.001);
    if (spineInPost) {
      items.push({
        label: `spine cpu · ${sp.instanceCount} inst (Ticker.shared)`,
        ms: view.spineSharedMs,
        color: COLOR_SPINE,
        depth: 1,
        isHeader: true,
        parentMs: ppParent,
        collapseKey: "spine-cpu",
      });
      pushSpineCpuRows(2);
    }
    // Breakdown of the postPixi remainder (sharedTickerMs measured by a UTILITY marker on
    // Ticker.shared, separate-ticker only):
    //   spine cpu (above) + other ticker.shared + composite + vsync idle = postPixi.
    //   otherShared    = Ticker.shared total - spine cpu (other shared-listeners)
    //   compositeIdle  = postPixi − spine cpu − otherShared (browser render + idle)
    const spineInPostMs = spineInPost ? view.spineSharedMs : 0;
    const otherShared = Math.max(0, view.sharedTickerMs - spineInPostMs);
    if (this._stickyHasOtherShared || otherShared > 0.05)
      this._stickyHasOtherShared = true;
    const shownOther = this._stickyHasOtherShared ? otherShared : 0;
    if (this._stickyHasOtherShared) {
      items.push({
        label: "other ticker.shared",
        ms: otherShared,
        color: "#7589A3",
        depth: 1,
        parentMs: ppParent,
      });
    }
    const compositeIdle = Math.max(
      0,
      view.postPixiMs - spineInPostMs - shownOther
    );
    items.push({
      label: "composite + vsync idle",
      ms: compositeIdle,
      color: "#7589A3",
      depth: 1,
      parentMs: ppParent,
    });

    // 4. Parallel / info section. GPU always shown if config enabled gpuTiming.
    // Async + LoAF + Audio are sticky: once seen - keep the row visible (at 0 ms if
    // current batch has none), to avoid jerking the layout.
    if (this._stickyHasGpu || view.gpuMs > 0.005) this._stickyHasGpu = true;
    if (this._stickyHasAsync || (view.asyncMs ?? 0) > 0.005)
      this._stickyHasAsync = true;
    if (this._stickyHasLoaf || recent.some((f) => f.loaf))
      this._stickyHasLoaf = true;
    if (this._stickyHasAudio || view.audio !== undefined)
      this._stickyHasAudio = true;
    if (this._stickyHasLongTasks || (view.longTasksMsAvg ?? 0) > 0.05)
      this._stickyHasLongTasks = true;

    const hasParallelSection =
      this._stickyHasGpu ||
      this._stickyHasAsync ||
      this._stickyHasLoaf ||
      this._stickyHasAudio ||
      this._stickyHasLongTasks;
    if (hasParallelSection) {
      items.push({
        label: "────  PARALLEL / INFO  ────",
        ms: 0,
        color: "transparent",
        depth: 0,
        separator: true,
      });
    }
    if (this._stickyHasGpu) {
      items.push({
        label: "GPU",
        ms: view.gpuMs,
        color: COLOR_GPU,
        depth: 0,
        isHeader: true,
        parentMs: frameTotalMs,
      });
    }
    if (this._stickyHasAsync) {
      items.push({
        label: "Assets.load (async)",
        ms: view.asyncMs ?? 0,
        color: "#9BB0D4",
        depth: 0,
        info: true,
        parentMs: frameTotalMs,
      });
    }
    if (this._stickyHasLongTasks) {
      const ltMs = view.longTasksMsAvg ?? 0;
      const ltCnt = view.longTasksCountAvg ?? 0;
      items.push({
        label: `Long Tasks · ${ltCnt.toFixed(1)} avg/frame`,
        ms: ltMs,
        color: "#bf94a0",
        depth: 0,
        info: true,
        parentMs: frameTotalMs,
      });
    }
    if (this._stickyHasAudio) {
      const a = view.audio;
      const ctxN = a?.contextCount ?? 0;
      const active = a?.activeSourceCount ?? 0;
      const peak = a?.peakSourceCount ?? 0;
      const drift = a?.currentTimeDriftMs ?? 0;
      const driftStr =
        Math.abs(drift) < 0.5
          ? "~0"
          : `${drift >= 0 ? "+" : ""}${drift.toFixed(2)}`;
      items.push({
        label: `Audio · ${ctxN} ctx · ${active}/${peak} src · drift ${driftStr}ms`,
        ms: a?.decodeMs ?? 0,
        color: "#82ab98",
        depth: 0,
        info: true,
        isHeader: true,
        parentMs: frameTotalMs,
        collapseKey: "audio",
      });
      // Audio sub-rows: decode wall-clock (only ms-based metric). Counters
      // shown in the label header AND as label-only rows below (ms=0,
      // labels carry actual counter values).
      items.push({
        label: `decode · ${a?.decodeCount ?? 0} ops`,
        ms: a?.decodeMs ?? 0,
        color: "#82ab98",
        depth: 1,
        info: true,
        parentMs: Math.max(a?.decodeMs ?? 0, 0.001),
      });
      // Non-ms counter rows: encode counts in the label, a zero ms bar - a visual
      // signal that they are not time-based. Helps the user see that counter changes
      // happen without taking up the ms partition.
      const srcStarted = a?.sourceStarted ?? 0;
      const srcStopped = a?.sourceStopped ?? 0;
      const autoOps = a?.automationOps ?? 0;
      const stateTrans = a?.contextStateTransitions ?? 0;
      items.push({
        label: `sources · started ${srcStarted} / stopped ${srcStopped}`,
        ms: 0,
        color: "#82ab98",
        depth: 1,
        info: true,
        parentMs: 1,
      });
      items.push({
        label: `automation · ${autoOps} ops`,
        ms: 0,
        color: "#82ab98",
        depth: 1,
        info: true,
        parentMs: 1,
      });
      items.push({
        label: `state transitions · ${stateTrans}`,
        ms: 0,
        color: "#82ab98",
        depth: 1,
        info: true,
        parentMs: 1,
      });
    }
    // LoAF - sticky once seen in the session. We use the last available loaf snapshot.
    if (this._stickyHasLoaf) {
      const loafSrc = recent
        .slice()
        .reverse()
        .find((f) => f.loaf);
      const l = loafSrc?.loaf;
      const loafMs = l?.durationMs ?? 0;
      const scripts = l?.scriptsCount ?? 0;
      items.push({
        label: `LoAF · ${scripts} scripts`,
        ms: loafMs,
        color: "#bf94a0",
        depth: 0,
        info: true,
        isHeader: true,
        parentMs: frameTotalMs,
        collapseKey: "loaf",
      });
      const lParent = Math.max(loafMs, 0.001);
      items.push({
        label: "script",
        ms: l?.scriptMs ?? 0,
        color: "#bf94a0",
        depth: 1,
        info: true,
        parentMs: lParent,
      });
      items.push({
        label: "style+layout",
        ms: l?.styleAndLayoutMs ?? 0,
        color: "#bf94a0",
        depth: 1,
        info: true,
        parentMs: lParent,
      });
      items.push({
        label: "render",
        ms: l?.renderMs ?? 0,
        color: "#bf94a0",
        depth: 1,
        info: true,
        parentMs: lParent,
      });
      items.push({
        label: "blocking",
        ms: l?.blockingMs ?? 0,
        color: "#bf94a0",
        depth: 1,
        info: true,
        parentMs: lParent,
      });
    }

    // Fill hover explanations (visible labels stay terse - column truncates).
    for (const it of items) {
      const t = barTip(it.label);
      if (t !== undefined) it.tip = t;
    }

    // Detect which headers are actually parents (next item has higher depth).
    // Mark + apply collapse state.
    const visible: BarItem[] = [];
    let skipBelowDepth = Infinity;
    for (let i = 0; i < items.length; i++) {
      const it = items[i]!;
      if (it.depth >= skipBelowDepth) continue; // skip child of collapsed
      // Exit skip range once we go back to ≤ collapsed depth.
      if (it.depth < skipBelowDepth) skipBelowDepth = Infinity;
      // Is parent? Header + next item exists with higher depth.
      const next = items[i + 1];
      const isParent =
        it.isHeader === true && next !== undefined && next.depth > it.depth;
      const collapsed =
        isParent && this._collapsed.has(it.collapseKey ?? it.label);
      visible.push({ ...it, hasChildren: isParent, isCollapsed: collapsed });
      if (collapsed) skipBelowDepth = it.depth + 1;
    }

    // Reconcile against the persistent row pool: reuse element i, patch in
    // place. Grow when more rows are needed, trim the tail otherwise. Node
    // creation only happens when the visible count grows - steady-state is
    // pure attribute mutation (no GC churn). Hover/click are CSS + a single
    // delegated listener (see mount), so no per-row listener re-attach.
    const pool = this._barRows;
    for (let i = 0; i < visible.length; i++) {
      let refs = pool[i];
      if (!refs) {
        refs = createBarRow();
        pool[i] = refs;
      }
      applyBarRow(refs, visible[i]!, maxMs, budget);
    }
    if (pool.length > visible.length) {
      for (let i = visible.length; i < pool.length; i++) pool[i]!.row.remove();
      pool.length = visible.length;
    }
    // Sync DOM order to pool order. replaceChildren with the SAME (already
    // attached) nodes is cheap - no node creation, just reorder/no-op when
    // order is unchanged (the common case under sticky layout).
    this.barsEl.replaceChildren(...pool.map((r) => r.row));
  }
}

// Only the Ticker.shared subset of SpinePhaseMs - what physically lies in postPixi.
// The other five phases (pipe*, attachment*) enter the pixi window via SpinePipe and here
// must not be counted (see the comment in BarView).
