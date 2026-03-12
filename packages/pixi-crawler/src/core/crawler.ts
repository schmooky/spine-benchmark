import { Application, Container } from "pixi.js";
import { Scanner } from "./scanner.js";
import { Recorder } from "./recorder.js";
import { WaterfallSpy } from "./waterfall.js";
import { CrawlerBridge } from "./bridge.js";
import { openRemotePanel } from "./remote-panel.js";
import type {
  CrawlerConfig,
  FrameSnapshot,
  Recording,
  Issue,
  NodeMeta,
} from "./types.js";
import { DEFAULT_CONFIG, ISSUE_IMPACT } from "./types.js";

export type {
  CrawlerConfig,
  FrameSnapshot,
  Recording,
  NodeMeta,
  Issue,
} from "./types.js";

/**
 * Minimal shape of the lazily-loaded Overlay (avoids importing the full UI module at init).
 * Methods match packages/pixi-crawler/src/ui/overlay.ts public API.
 */
interface OverlayLike {
  readonly container: Container;
  readonly highlightContainer: Container;
  visible: boolean;
  update(
    snapshot: FrameSnapshot | null,
    recent: FrameSnapshot[],
    recentIssues: { issue: Issue; nodeLabel: string }[],
    isRecording: boolean,
    problemNodes: { node: Container; meta: NodeMeta }[],
    impactThreshold: number,
  ): void;
  toggle(): void;
  toggleGraph(): void;
  toggleIssues(): void;
  toggleHighlights(): void;
  toggleAnalysis(): void;
  selectPrev(): void;
  selectNext(): void;
  destroy(): void;
}

/**
 * Main entry point - attaches to a PixiJS Application and runs
 * continuous scene-graph analysis with an optional on-screen overlay
 * and a remote diagnostic panel.
 *
 * ```ts
 * import { Crawler } from '@spine-benchmark/pixi-crawler';
 * const crawler = new Crawler(app, { overlayEnabled: true });
 * ```
 */
export class Crawler {
  readonly scanner: Scanner;
  readonly recorder: Recorder;
  /** On-screen diagnostic overlay (lazy-loaded from the UI module, initially `null`). */
  readonly overlay: OverlayLike | null;
  /** Mutable at runtime - change thresholds on the fly */
  config: CrawlerConfig;

  private _app: Application;
  private _tickerFn:
    | ((ticker: { deltaTime: number; deltaMS: number }) => void)
    | null = null;
  private _keyHandler: ((e: KeyboardEvent) => void) | null = null;
  private _frame = 0;
  private _lastSnapshot: FrameSnapshot | null = null;
  private _recentIssues: { issue: Issue; nodeLabel: string }[] = [];
  private _problemNodes: { node: Container; meta: NodeMeta }[] = [];
  private _destroyed = false;
  private _lastTiming = { scanMs: 0, overlayMs: 0, totalMs: 0 };

  // ── Waterfall spy + remote bridge ──
  private _waterfall: WaterfallSpy;
  private _bridge: CrawlerBridge;
  private _remoteWindow: Window | null = null;

  // ── Thumbnail capture ──
  private _thumbTickerFn: (() => void) | null = null;
  private _thumbPending = false;
  private _thumbInterval = 6; // capture every N frames

  constructor(app: Application, config?: Partial<CrawlerConfig>) {
    this._app = app;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.scanner = new Scanner();
    this.recorder = new Recorder(this.config.historySize);

    // Overlay is loaded asynchronously from the UI module to keep core lightweight
    this.overlay = null;
    if (this.config.overlayEnabled) {
      this._loadOverlay();
    }

    // Install waterfall spy (replaces old GL draw count spy)
    this._waterfall = new WaterfallSpy();
    const spyOk = this._waterfall.install(app.renderer);
    if (spyOk) {
      console.log(
        "%c[crawler]%c GL waterfall spy installed - real DC counting + state tracking active",
        "color:#fff",
        "color:#888",
      );
    } else {
      console.warn(
        "%c[crawler]%c GL context not found - draw call counting uses estimation",
        "color:#fff",
        "color:#888",
      );
    }

    // Create remote bridge
    this._bridge = new CrawlerBridge();

    this._tickerFn = (ticker) => this._onTick(ticker);
    app.ticker.add(this._tickerFn);

    // Post-render thumbnail capture (priority -50 runs after pixi's render at -25)
    this._thumbTickerFn = () => this._captureThumbnail();
    app.ticker.add(this._thumbTickerFn, undefined, -50);

    this._keyHandler = (e) => this._onKey(e);
    globalThis.addEventListener("keydown", this._keyHandler);

    // Print controls to console
    const h = "color:#888;font-weight:normal";
    const b = "color:#fff;font-weight:bold";
    console.log(
      `%c[crawler]%c initialized\n` +
        `%c  ~  %ctoggle overlay\n` +
        `%c  G  %ctoggle graph\n` +
        `%c  I  %ctoggle issues\n` +
        `%c  H  %ctoggle highlights\n` +
        `%c  R  %cstart/stop recording\n` +
        `%c  P  %cexport report\n` +
        `%c  T  %cdump thresholds & bias\n` +
        `%c  D  %ctoggle detailed analysis\n` +
        `%c < > %ccycle selected node\n` +
        `%c  W  %copen remote waterfall panel`,
      b,
      h,
      b,
      h,
      b,
      h,
      b,
      h,
      b,
      h,
      b,
      h,
      b,
      h,
      b,
      h,
      b,
      h,
      b,
      h,
      b,
      h,
    );
  }

  // ── Overlay lazy-loading ─────────────────────────────────────

  private async _loadOverlay(): Promise<void> {
    try {
      const { Overlay } = await import("../ui/overlay.js");
      if (this._destroyed) return;
      const ol: OverlayLike = new Overlay(this._app);
      (this as { overlay: OverlayLike | null }).overlay = ol;
      this._app.stage.addChild(ol.highlightContainer);
      this._app.stage.addChild(ol.container);
      console.log(
        "%c[crawler]%c overlay loaded",
        "color:#4fc3f7;font-weight:bold",
        "color:#888",
      );
    } catch (err) {
      console.warn("[crawler] failed to load overlay module:", err);
    }
  }

  // ── Tick ───────────────────────────────────────────────────

  private _onTick(ticker: { deltaTime: number; deltaMS: number }): void {
    if (this._destroyed) return;

    const t0 = performance.now();
    let scanMs = 0;

    this._frame++;

    // Harvest waterfall entries from the render that just completed
    const harvest = this._waterfall.installed
      ? this._waterfall.harvest()
      : null;

    const doScan =
      this._frame % this.config.scanInterval === 0 || this._frame === 1;

    if (doScan) {
      const scanStart = performance.now();
      const snap = this.scanner.scan(this._app.stage, this.config);
      scanMs = performance.now() - scanStart;

      snap.dt = ticker.deltaMS;
      snap.fps = 1000 / Math.max(ticker.deltaMS, 0.001);

      // Override with real GL draw calls when available
      if (harvest) {
        snap.drawCalls = harvest.drawCount;
      }

      this._lastSnapshot = snap;
      this._recentIssues = [...this.scanner.frameIssues];
      this._problemNodes = [...this.scanner.problemNodes];

      this.recorder.push(snap, this.scanner.frameIssues);
    } else if (this._lastSnapshot) {
      this._lastSnapshot = {
        ...this._lastSnapshot,
        frame: this._frame,
        time: performance.now(),
        dt: ticker.deltaMS,
        fps: 1000 / Math.max(ticker.deltaMS, 0.001),
        ...(harvest ? { drawCalls: harvest.drawCount } : {}),
      };
      this.recorder.push(this._lastSnapshot, []);
    }

    // Update overlay (measured for timing)
    const overlayStart = performance.now();
    if (this.overlay) {
      this.overlay.update(
        this._lastSnapshot,
        this.recorder.getRecent(120),
        this._recentIssues,
        this.recorder.isRecording,
        this._problemNodes,
        this.config.overlayImpactThreshold,
      );
    }
    const overlayMs = performance.now() - overlayStart;
    const totalMs = performance.now() - t0;
    this._lastTiming = { scanMs, overlayMs, totalMs };

    // Send data to remote panel when it's open
    if (
      this._remoteWindow &&
      !this._remoteWindow.closed &&
      this._lastSnapshot
    ) {
      const remoteIssues = this._recentIssues.map((ri) => ({
        code: ri.issue.code,
        severity: ri.issue.severity,
        message: ri.issue.message,
        nodeLabel: ri.nodeLabel,
        impact: ISSUE_IMPACT[ri.issue.code] ?? 0,
      }));

      // Build enriched problem node diagnostics for the remote panel
      const problemNodeData = this._problemNodes
        .map(({ meta }) => {
          const issueScore = meta.issues.reduce(
            (s, i) => s + (ISSUE_IMPACT[i.code] ?? 0),
            0,
          );
          return {
            label: meta.label,
            kind: meta.kind,
            drawCalls: meta.drawCalls,
            depth: meta.depth,
            masked: meta.masked,
            filtered: meta.hasFilters,
            blendBreak: meta.blendBreak,
            boundsW: meta.boundsW,
            boundsH: meta.boundsH,
            ri: meta.spineBudget?.ri.total ?? 0,
            ci: meta.spineBudget?.ci.total ?? 0,
            budgetTotal: meta.spineBudget?.total ?? 0,
            budgetLevel: meta.spineBudget?.level ?? 'n/a',
            issues: meta.issues.map((i) => ({
              code: i.code,
              severity: i.severity,
              message: i.message,
              impact: ISSUE_IMPACT[i.code] ?? 0,
            })),
            blendTransitions: meta.spineAnalysis?.blendModeTransitions ?? 0,
            atlasPageSwitches: meta.spineAnalysis?.atlasPageSwitches ?? 0,
            atlasPages: meta.spineAnalysis?.atlasPages ?? [],
            activeSlots: meta.spineAnalysis?.activeSlots ?? 0,
            totalSlots: meta.spineAnalysis?.totalSlots ?? 0,
            _score: issueScore,
          };
        })
        .sort((a, b) => b._score - a._score)
        .slice(0, 12)
        .map(({ _score, ...rest }) => rest);

      this._bridge.sendFrame({
        frame: this._lastSnapshot.frame,
        time: this._lastSnapshot.time,
        fps: this._lastSnapshot.fps,
        dt: this._lastSnapshot.dt,
        drawCalls: this._lastSnapshot.drawCalls,
        nodeCount: this._lastSnapshot.nodeCount,
        visibleNodes: this._lastSnapshot.visibleNodes,
        issueCount: this._lastSnapshot.issueCount,
        waterfall: harvest?.entries ?? [],
        issues: remoteIssues,
        timing: { scanMs, overlayMs, totalMs },
        aggregateBudget: this._lastSnapshot.aggregateBudget,
        problemNodes: problemNodeData,
        census: this._lastSnapshot.census,
      });
    } else if (this._remoteWindow?.closed) {
      this._remoteWindow = null;
    }

    // Keep overlay containers on top
    if (this.overlay) {
      const stage = this._app.stage;
      const last = stage.children.length - 1;
      const olIdx = stage.children.indexOf(this.overlay.container);
      if (olIdx !== -1 && olIdx !== last) {
        stage.setChildIndex(this.overlay.container, last);
      }
      const hlIdx = stage.children.indexOf(this.overlay.highlightContainer);
      const olIdx2 = stage.children.indexOf(this.overlay.container);
      if (hlIdx !== -1 && hlIdx !== olIdx2 - 1 && olIdx2 > 0) {
        stage.setChildIndex(this.overlay.highlightContainer, olIdx2 - 1);
      }
    }
  }

  private _captureThumbnail(): void {
    if (this._destroyed) return;
    if (!this.config.thumbnails) return;
    if (!this._remoteWindow || this._remoteWindow.closed) return;
    if (this._frame % this._thumbInterval !== 0) return;
    if (this._thumbPending) return;

    const screenW = this._app.screen.width;
    if (screenW === 0) return;

    // Use pixi's extract.base64() - works regardless of preserveDrawingBuffer,
    // returns a data URL string that's trivially safe over BroadcastChannel.
    const extractRes = Math.max(0.05, 160 / screenW);
    const frame = this._frame;

    this._thumbPending = true;

    type ExtractAPI = {
      base64(opts: {
        target: unknown;
        resolution: number;
        format: string;
        quality: number;
      }): Promise<string>;
    };

    const extract = (this._app.renderer as unknown as { extract: ExtractAPI })
      .extract;

    extract
      .base64({
        target: this._app.stage,
        resolution: extractRes,
        format: "jpg",
        quality: 0.4,
      })
      .then((dataUrl) => {
        this._bridge.sendThumbnail(frame, dataUrl);
        this._thumbPending = false;
      })
      .catch((err) => {
        console.warn("[crawler] thumbnail capture failed:", err);
        this._thumbPending = false;
      });
  }

  private _onKey(e: KeyboardEvent): void {
    if (this._destroyed) return;

    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;

    switch (e.key) {
      case "`":
      case "~":
        if (this.overlay) this.overlay.toggle();
        break;
      case "g":
      case "G":
        if (this.overlay) this.overlay.toggleGraph();
        break;
      case "i":
      case "I":
        if (this.overlay) this.overlay.toggleIssues();
        break;
      case "h":
      case "H":
        if (this.overlay) this.overlay.toggleHighlights();
        break;
      case "r":
      case "R":
        if (this.recorder.isRecording) {
          const rec = this.recorder.stopRecording();
          if (rec) {
            console.log(
              "%c[crawler]%c recording stopped - %d frames",
              "color:#fff",
              "color:#888",
              rec.frames.length,
            );
          }
        } else {
          this.recorder.startRecording(this._frame);
          console.log("%c[crawler]%c recording...", "color:#fff", "color:#888");
        }
        break;
      case "p":
      case "P": {
        const recs = this.recorder.recordings;
        if (recs.length > 0) {
          const report = Recorder.generateReport(recs[recs.length - 1]);
          console.log(report);
          this._downloadReport(report);
        } else {
          console.log(
            "%c[crawler]%c no recordings - press R first",
            "color:#fff",
            "color:#888",
          );
        }
        break;
      }
      case "t":
      case "T":
        this._dumpConfig();
        break;
      case "d":
      case "D":
        if (this.overlay) this.overlay.toggleAnalysis();
        break;
      case "w":
      case "W":
        this._openRemotePanel();
        break;
      case "ArrowLeft":
        if (this.overlay) this.overlay.selectPrev();
        break;
      case "ArrowRight":
        if (this.overlay) this.overlay.selectNext();
        break;
    }
  }

  private _dumpConfig(): void {
    const h = "color:#888;font-weight:normal";
    const b = "color:#fff;font-weight:bold";
    const c = this.config;

    console.log("%c[crawler]%c thresholds (mutable via crawler.config)", b, h);
    console.table({
      scanInterval: { value: c.scanInterval, unit: "frames" },
      maxDepth: { value: c.maxDepth, unit: "levels" },
      spineDrawCallThreshold: { value: c.spineDrawCallThreshold, unit: "dc" },
      maskComplexityThreshold: {
        value: c.maskComplexityThreshold,
        unit: "instructions",
      },
      excessiveChildrenThreshold: {
        value: c.excessiveChildrenThreshold,
        unit: "children",
      },
      deepNestingThreshold: { value: c.deepNestingThreshold, unit: "depth" },
      oversizedTextureThreshold: {
        value: c.oversizedTextureThreshold,
        unit: "px",
      },
      invisibleChildrenThreshold: {
        value: c.invisibleChildrenThreshold,
        unit: "children",
      },
      overlayImpactThreshold: {
        value: c.overlayImpactThreshold,
        unit: "impact (1-10)",
      },
    });

    console.log(
      "%c[crawler]%c GL spy: %s",
      b,
      h,
      this._waterfall.installed
        ? "active (waterfall + real DC counting)"
        : "inactive (estimation)",
    );

    console.log(
      "%c[crawler]%c issue impact bias (edit ISSUE_IMPACT to retune)",
      b,
      h,
    );
    const sorted = Object.entries(ISSUE_IMPACT).sort((a, b) => b[1] - a[1]);
    const biasTable: Record<string, { impact: number; bar: string }> = {};
    for (const [code, weight] of sorted) {
      biasTable[code] = {
        impact: weight,
        bar: "▓".repeat(weight) + "░".repeat(10 - weight),
      };
    }
    console.table(biasTable);
  }

  private _downloadReport(report: string): void {
    const blob = new Blob([report], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `crawler-report-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  scan(): FrameSnapshot {
    const snap = this.scanner.scan(this._app.stage, this.config);
    this._lastSnapshot = snap;
    return snap;
  }

  get lastSnapshot(): FrameSnapshot | null {
    return this._lastSnapshot;
  }

  /** Whether the GL draw call spy is active (real DC counting) */
  get glSpyActive(): boolean {
    return this._waterfall.installed;
  }

  /** Last frame's real GL draw call count (0 if spy not installed) */
  get realDrawCalls(): number {
    return this._lastSnapshot?.drawCalls ?? 0;
  }

  get lastTiming(): { scanMs: number; overlayMs: number; totalMs: number } {
    return this._lastTiming;
  }

  startRecording(): void {
    this.recorder.startRecording(this._frame);
  }

  stopRecording(): Recording | null {
    return this.recorder.stopRecording();
  }

  getReport(): string | null {
    const recs = this.recorder.recordings;
    if (recs.length === 0) return null;
    return Recorder.generateReport(recs[recs.length - 1]);
  }

  private _openRemotePanel(): void {
    // Focus existing window if still open
    if (this._remoteWindow && !this._remoteWindow.closed) {
      this._remoteWindow.focus();
      return;
    }
    this._remoteWindow = openRemotePanel();
    if (this._remoteWindow) {
      console.log(
        "%c[crawler]%c remote waterfall panel opened - sending frame data",
        "color:#fff",
        "color:#888",
      );
    } else {
      console.warn(
        "%c[crawler]%c failed to open remote panel - check popup blocker",
        "color:#fff",
        "color:#888",
      );
    }
  }

  destroy(): void {
    this._destroyed = true;
    if (this._tickerFn) {
      this._app.ticker.remove(this._tickerFn);
      this._tickerFn = null;
    }
    if (this._thumbTickerFn) {
      this._app.ticker.remove(this._thumbTickerFn);
      this._thumbTickerFn = null;
    }
    if (this._keyHandler) {
      globalThis.removeEventListener("keydown", this._keyHandler);
      this._keyHandler = null;
    }
    this._bridge.destroy();
    if (this._remoteWindow && !this._remoteWindow.closed) {
      this._remoteWindow.close();
    }
    this._remoteWindow = null;
    if (this.overlay) {
      this.overlay.destroy();
    }
  }
}
