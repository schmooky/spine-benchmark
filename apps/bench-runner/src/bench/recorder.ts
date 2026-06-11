import type { RunCapture, ScenarioResult } from "@/types";

/**
 * Frame-by-frame metrics recorder. The engine feeds it one tick per
 * rendered frame; it keeps raw deltas per scenario (the full capture) and
 * derives per-second rows and per-scenario aggregate stats.
 */

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
}

export class Recorder {
  private capture: RunCapture = { frames: [], perSecond: [] };
  private results: ScenarioResult[] = [];

  private current: ScenarioMeta | null = null;
  private dts: number[] = [];
  private startMs = 0;
  private elapsedMs = 0;
  private maxInstances = 0;
  private riPeak = 0;
  private ciPeak = 0;
  private steps: NonNullable<ScenarioResult["steps"]> = [];

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
    this.secDts = [];
    this.secStart = 0;
  }

  /** One rendered frame: dt in ms, current instance count, sampled RI/CI totals. */
  tick(dtMs: number, instances: number, ri: number, ci: number): void {
    if (!this.current) return;
    this.elapsedMs += dtMs;
    this.dts.push(Math.round(dtMs * 10) / 10);
    this.secDts.push(dtMs);
    this.maxInstances = Math.max(this.maxInstances, instances);
    this.lastInstances = instances;
    this.lastRi = ri;
    this.lastCi = ci;
    this.riPeak = Math.max(this.riPeak, ri);
    this.ciPeak = Math.max(this.ciPeak, ci);

    if (this.elapsedMs - this.secStart >= 1000) {
      const secMs = this.elapsedMs - this.secStart;
      const sorted = [...this.secDts].sort((a, b) => a - b);
      const avg = secMs / this.secDts.length;
      this.capture.perSecond.push({
        t: ++this.secIndex,
        scenarioId: this.current.id,
        fps: Math.round((this.secDts.length / secMs) * 100000) / 100,
        frameMsAvg: Math.round(avg * 10) / 10,
        frameMsP95: Math.round(percentile(sorted, 95) * 10) / 10,
        instances,
        ri: Math.round(ri * 10) / 10,
        ci: Math.round(ci * 10) / 10,
      });
      this.secDts = [];
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
    this.capture.frames.push({ scenarioId: this.current.id, dtMs: this.dts });
    this.results.push({
      id: this.current.id,
      label: this.current.label,
      spine: this.current.spine,
      kind: this.current.kind,
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
      },
      steps: this.steps.length > 0 ? this.steps : undefined,
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
      capture: this.capture,
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
