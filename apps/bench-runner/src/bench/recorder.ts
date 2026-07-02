import type { FrameMetrics, ImpactInputs, PerSecondRow, ScenarioResult } from "@/types";

/**
 * Frame-by-frame metrics recorder. The engine feeds it one tick per
 * rendered frame; it keeps raw deltas per scenario (the full capture) and
 * derives per-second rows and per-scenario aggregate stats.
 */

/** Mean rounded to 1dp, or null for an empty sample (GPU timing unsupported). */
function mean1(xs: number[]): number | null {
  if (xs.length === 0) return null;
  return Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10;
}

/** Mean each field of a per-second batch of frame metrics. null if empty. */
function meanFrameMetrics(fs: FrameMetrics[]): FrameMetrics | null {
  if (fs.length === 0) return null;
  const keys = Object.keys(fs[0]) as (keyof FrameMetrics)[];
  const out = {} as FrameMetrics;
  for (const k of keys) {
    let sum = 0;
    for (const f of fs) sum += f[k];
    // counts kept fractional (mean per frame), ms rounded to 2 dp
    out[k] = Math.round((sum / fs.length) * 100) / 100;
  }
  return out;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[idx];
}

interface ScenarioMeta {
  id: string;
  label: string;
  spine: string;
  kind: ScenarioResult["kind"];
  scene?: ScenarioResult["scene"];
}

export interface TickSample {
  /** Scene totals (one instance x count). */
  ri: number;
  ci: number;
  /** Raw formula inputs for ONE instance, or null before first sample. */
  one: ImpactInputs | null;
  heapMb: number | null;
  /** True GPU render time for the frame (EXT timer query), or null when the
   * extension is unavailable. This is the vsync-independent cost signal. */
  gpuMs?: number | null;
  /** CPU time spent advancing spines this frame (spine.update), ms. */
  cpuMs?: number;
  /** Full crawler frame measurement (counters, render-split, textures), or null. */
  frame?: FrameMetrics | null;
  /** This frame's resolved GPU query came back disjoint (reading discarded). */
  gpuDisjoint?: boolean;
}

export class Recorder {
  private frames: { scenarioId: string; dtMs: number[] }[] = [];
  private perSecond: PerSecondRow[] = [];
  private results: ScenarioResult[] = [];

  private current: ScenarioMeta | null = null;
  private dts: number[] = [];
  private startMs = 0;
  private elapsedMs = 0;
  private maxInstances = 0;
  private riPeak = 0;
  private ciPeak = 0;
  private steps: NonNullable<ScenarioResult["steps"]> = [];
  private abortedReason: string | null = null;
  private sustainInstances: number | null = null;
  private collapseInstances: number | null = null;

  // GPU/CPU cost samples (the vsync-independent signal)
  private gpuMs: number[] = [];
  private cpuMs: number[] = [];
  private secGpu: number[] = [];
  private secCpu: number[] = [];

  // full per-frame measurement set + data-quality counters, per second
  private secFrames: FrameMetrics[] = [];
  private secDisjoint = 0;

  // rolling per-second window
  private secDts: number[] = [];
  private secStart = 0;
  private secIndex = 0;
  private lastInstances = 0;
  private lastRi = 0;
  private lastCi = 0;

  private runStart = performance.now();
  hiddenMs = 0;

  beginScenario(meta: ScenarioMeta): void {
    this.endScenario();
    this.current = meta;
    this.dts = [];
    this.startMs = performance.now() - this.runStart;
    this.elapsedMs = 0;
    this.maxInstances = 0;
    this.riPeak = 0;
    this.ciPeak = 0;
    this.steps = [];
    this.abortedReason = null;
    this.sustainInstances = null;
    this.collapseInstances = null;
    this.gpuMs = [];
    this.cpuMs = [];
    this.secGpu = [];
    this.secCpu = [];
    this.secFrames = [];
    this.secDisjoint = 0;
    this.secDts = [];
    this.secStart = 0;
  }

  /** Tag the current scenario as cut short / capped. */
  markAborted(reason: string): void {
    if (this.current && !this.abortedReason) this.abortedReason = reason;
  }

  /** Record the ramp's pinned knees (sustain = capacity, collapse = hard stop). */
  setKnees(sustain: number | null, collapse: number | null): void {
    this.sustainInstances = sustain;
    this.collapseInstances = collapse;
  }

  /** Rolling tail of per-second rows for the crash stash. */
  recentPerSecond(n: number): PerSecondRow[] {
    return this.perSecond.slice(-n);
  }

  /** One rendered frame: dt in ms, current instance count, latest sample. */
  tick(dtMs: number, instances: number, sample: TickSample): void {
    if (!this.current) return;
    this.elapsedMs += dtMs;
    this.dts.push(Math.round(dtMs * 10) / 10);
    this.secDts.push(dtMs);
    this.maxInstances = Math.max(this.maxInstances, instances);
    this.lastInstances = instances;
    this.lastRi = sample.ri;
    this.lastCi = sample.ci;
    this.riPeak = Math.max(this.riPeak, sample.ri);
    this.ciPeak = Math.max(this.ciPeak, sample.ci);
    if (sample.gpuMs != null) {
      this.gpuMs.push(sample.gpuMs);
      this.secGpu.push(sample.gpuMs);
    }
    if (sample.cpuMs != null) {
      this.cpuMs.push(sample.cpuMs);
      this.secCpu.push(sample.cpuMs);
    }
    if (sample.frame) this.secFrames.push(sample.frame);
    if (sample.gpuDisjoint) this.secDisjoint++;

    if (this.elapsedMs - this.secStart >= 1000) {
      const secMs = this.elapsedMs - this.secStart;
      const sorted = [...this.secDts].sort((a, b) => a - b);
      const avg = secMs / this.secDts.length;
      this.perSecond.push({
        t: ++this.secIndex,
        scenarioId: this.current.id,
        fps: Math.round((this.secDts.length / secMs) * 100000) / 100,
        frameMsAvg: Math.round(avg * 10) / 10,
        frameMsP95: Math.round(percentile(sorted, 95) * 10) / 10,
        instances,
        ri: Math.round(sample.ri * 10) / 10,
        ci: Math.round(sample.ci * 10) / 10,
        heapMb: sample.heapMb,
        one: sample.one,
        gpuMs: mean1(this.secGpu),
        cpuMs: mean1(this.secCpu),
        m: meanFrameMetrics(this.secFrames),
        frames: this.secDts.length,
        gpuFrames: this.secGpu.length,
        gpuDisjoint: this.secDisjoint,
      });
      this.secDts = [];
      this.secGpu = [];
      this.secCpu = [];
      this.secFrames = [];
      this.secDisjoint = 0;
      this.secStart = this.elapsedMs;
    }
  }

  /** Ramp scenarios call this at every step boundary with the closing step's frames. */
  closeStep(instances: number, stepDts: number[]): void {
    if (stepDts.length === 0) return;
    const sorted = [...stepDts].sort((a, b) => a - b);
    const total = stepDts.reduce((a, b) => a + b, 0);
    this.steps.push({
      instances,
      fps: Math.round((stepDts.length / total) * 100000) / 100,
      frameMsP95: Math.round(percentile(sorted, 95) * 10) / 10,
    });
  }

  endScenario(): void {
    if (!this.current || this.dts.length === 0) {
      this.current = null;
      return;
    }
    const sorted = [...this.dts].sort((a, b) => a - b);
    const totalMs = this.dts.reduce((a, b) => a + b, 0);
    this.frames.push({ scenarioId: this.current.id, dtMs: this.dts });
    this.results.push({
      id: this.current.id,
      label: this.current.label,
      spine: this.current.spine,
      kind: this.current.kind,
      ...(this.current.scene ? { scene: this.current.scene } : {}),
      startMs: Math.round(this.startMs),
      durationMs: Math.round(totalMs),
      stats: {
        frames: this.dts.length,
        avgFps: Math.round((this.dts.length / totalMs) * 100000) / 100,
        frameMsAvg: Math.round((totalMs / this.dts.length) * 10) / 10,
        frameMsP95: Math.round(percentile(sorted, 95) * 10) / 10,
        frameMsP99: Math.round(percentile(sorted, 99) * 10) / 10,
        longFrames: this.dts.filter((d) => d > 50).length,
        maxInstances: this.maxInstances,
        riPeak: Math.round(this.riPeak * 10) / 10,
        ciPeak: Math.round(this.ciPeak * 10) / 10,
        gpuMsAvg: mean1(this.gpuMs),
        gpuMsP95:
          this.gpuMs.length > 0
            ? Math.round(percentile([...this.gpuMs].sort((a, b) => a - b), 95) * 10) / 10
            : null,
        cpuMsAvg: mean1(this.cpuMs),
        cpuMsP95:
          this.cpuMs.length > 0
            ? Math.round(percentile([...this.cpuMs].sort((a, b) => a - b), 95) * 10) / 10
            : null,
        sustainInstances: this.sustainInstances,
        collapseInstances: this.collapseInstances,
      },
      steps: this.steps.length > 0 ? this.steps : undefined,
      ...(this.abortedReason ? { aborted: this.abortedReason } : {}),
    });
    this.current = null;
  }

  finalize(quick: boolean) {
    this.endScenario();
    const totalFrames = this.results.reduce((a, r) => a + r.stats.frames, 0);
    const totalDurationMs = this.results.reduce((a, r) => a + r.durationMs, 0);
    const worstFrameMsP99 = Math.max(
      0,
      ...this.results.map((r) => r.stats.frameMsP99),
    );
    return {
      scenarios: this.results,
      frames: this.frames,
      perSecond: this.perSecond,
      summary: {
        totalDurationMs: Math.round(totalDurationMs),
        totalFrames,
        avgFps:
          totalDurationMs > 0
            ? Math.round((totalFrames / totalDurationMs) * 100000) / 100
            : 0,
        worstFrameMsP99,
        hiddenMs: Math.round(this.hiddenMs),
        degraded: this.hiddenMs > 5000,
        quick,
      },
    };
  }
}
