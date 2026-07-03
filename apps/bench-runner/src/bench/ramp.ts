/**
 * Adaptive density-ramp controller (pure, so it is unit-testable without a live
 * GPU). It doubles the instance count until the device first drops below its
 * refresh, then BISECTS the last-good / first-bad bracket a few times to pin the
 * "sustain knee" - the load at which it can no longer hold refresh. That knee is
 * the device's capacity for this spine mix (thesis: 100% = can't hold Hz).
 *
 * Doubling alone leaves the knee known only to a factor of 2; the bisection
 * refines it to a tight bracket, which is what the per-run capacity + self-fit
 * (packages/metrics-model analyzeRunCapacity) needs to trust the number.
 *
 * "Sustain" is judged on true GPU ms when the timer is available (gpuP95 <= one
 * frame budget), else on fps (>= a fraction of refresh). Kept vsync-independent
 * where possible.
 *
 * NOTE: the live wiring must be retested on a real device (esp. Safari/iOS with
 * no GPU timer) before a calibration campaign - it cannot be fully verified in a
 * headless build.
 */

export interface RampConfig {
  /** hard safety ceiling (context-loss guard on mobile). */
  stressMax: number;
  /** fps at/above which the device is "holding refresh" (no-timer path). */
  sustainFps: number;
  /** one frame budget in ms; gpuP95 above this = over budget (timer path). */
  ceilingBudgetMs: number;
  /** how many bisection probes to spend pinning the knee. */
  maxBisects: number;
  /** stop bisecting once the bracket is this tight (instances). */
  minGap: number;
}

export interface RampMeasure {
  /** the density this measurement was taken at. */
  count: number;
  fps: number;
  /** p95 GPU ms for the step, or null when the timer is unavailable. */
  gpuP95: number | null;
}

export interface RampState {
  /** density to measure next (caller spawns to this). */
  next: number;
  /** density the last measurement was taken at. */
  count: number;
  /** largest density known to sustain refresh. */
  lo: number;
  /** smallest density known to NOT sustain, or null if not seen yet. */
  hi: number | null;
  phase: "ramp" | "bisect" | "done";
  bisects: number;
  sustainInstances: number | null;
  collapseInstances: number | null;
  reason: string | null;
}

export function initRamp(start: number): RampState {
  const s = Math.max(1, Math.floor(start));
  return {
    next: s,
    count: s,
    lo: 0,
    hi: null,
    phase: "ramp",
    bisects: 0,
    sustainInstances: null,
    collapseInstances: null,
    reason: null,
  };
}

function sustains(m: RampMeasure, cfg: RampConfig): boolean {
  // Spine workloads are dominantly CPU-bound, so fps must ALWAYS gate: a device
  // can hold gpuP95 well under budget while the main thread is at 60ms/frame.
  // The GPU budget is an ADDITIONAL failure axis when the timer is available.
  const fpsOk = m.fps >= cfg.sustainFps;
  const gpuOk = m.gpuP95 == null || m.gpuP95 <= cfg.ceilingBudgetMs;
  return fpsOk && gpuOk;
}

function midpoint(a: number, b: number): number {
  return Math.max(a + 1, Math.floor((a + b) / 2));
}

function finish(s: RampState): RampState {
  // lo === 0 means the device never sustained ANY tested density - reporting
  // the failed count as capacity would overstate it. The knee is unknown
  // (somewhere below the minimum), so report null rather than a wrong number.
  const knee = s.lo > 0 ? s.lo : null;
  return {
    ...s,
    phase: "done",
    next: s.count,
    sustainInstances: knee,
    collapseInstances: s.hi,
    reason:
      knee != null
        ? `sustain knee at ${knee} instances (drops below refresh)`
        : `below refresh at minimum tested density (${s.hi ?? s.count} instances)`,
  };
}

/**
 * Advance the ramp given the just-closed step's measurement (taken at
 * `state.count`). Returns the new state; when `phase === "done"` the ramp is
 * over and `sustainInstances`/`collapseInstances`/`reason` are final. Otherwise
 * the caller should spawn to `next` and hold another step.
 */
export function rampStep(state: RampState, m: RampMeasure, cfg: RampConfig): RampState {
  if (state.phase === "done") return state;
  const ok = sustains(m, cfg);
  const s: RampState = { ...state, count: m.count };
  if (ok) s.lo = Math.max(s.lo, m.count);
  else s.hi = s.hi == null ? m.count : Math.min(s.hi, m.count);

  if (s.phase === "ramp") {
    if (!ok) {
      // first sub-refresh step: bracket is (lo, count]. bisect it, unless there
      // is nothing below or it is already tight.
      if (s.lo <= 0 || m.count - s.lo <= cfg.minGap) return finish(s);
      s.phase = "bisect";
      s.next = midpoint(s.lo, m.count);
      return s;
    }
    // sustained
    if (m.count >= cfg.stressMax) {
      return {
        ...s,
        phase: "done",
        next: m.count,
        sustainInstances: m.count,
        collapseInstances: null,
        reason: `held refresh to safety ceiling ${cfg.stressMax} instances`,
      };
    }
    s.next = Math.min(m.count * 2, cfg.stressMax);
    return s;
  }

  // bisect phase: lo/hi already updated above
  s.bisects += 1;
  if (s.hi != null && (s.bisects >= cfg.maxBisects || s.hi - s.lo <= cfg.minGap)) {
    return finish(s);
  }
  s.next = midpoint(s.lo, s.hi ?? m.count);
  return s;
}
