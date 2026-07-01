/**
 * Capacity-curve interpolation. A ramp scenario records (instances, cost) steps;
 * this finds the instance count at which cost crosses a target - the device's
 * budget for that spine mix. Defining budget at a fixed cost (ms) rather than
 * "fps below refresh" removes the refresh-rate confound (thesis #5/#6).
 */

export interface CapacityStep {
  instances: number;
  /** cost at this density - GPU ms (preferred) or frame ms. */
  costMs: number;
}

/**
 * Instance count where cost first reaches `targetMs`, linearly interpolated
 * between the bracketing steps. Returns the max step (with `reached:false`) if
 * the curve never crosses the target (device never broke).
 */
export function capacityAt(
  steps: CapacityStep[],
  targetMs: number,
): { instances: number; reached: boolean } {
  const sorted = [...steps].sort((a, b) => a.instances - b.instances);
  if (sorted.length === 0) return { instances: 0, reached: false };
  let prev = sorted[0];
  for (const s of sorted) {
    if (s.costMs >= targetMs) {
      if (s.instances === prev.instances || s.costMs === prev.costMs) {
        return { instances: s.instances, reached: true };
      }
      const t = (targetMs - prev.costMs) / (s.costMs - prev.costMs);
      const interp = prev.instances + t * (s.instances - prev.instances);
      return { instances: Math.round(interp), reached: true };
    }
    prev = s;
  }
  return { instances: sorted[sorted.length - 1].instances, reached: false };
}

/** Per-instance marginal cost (ms) from a linear fit of the ramp - the true
 * cost of one more instance of this mix, once past fixed overhead. */
export function marginalCostMs(steps: CapacityStep[]): number {
  const pts = steps.filter((s) => s.costMs > 0);
  if (pts.length < 2) return 0;
  const n = pts.length;
  const mx = pts.reduce((a, s) => a + s.instances, 0) / n;
  const my = pts.reduce((a, s) => a + s.costMs, 0) / n;
  let num = 0;
  let den = 0;
  for (const s of pts) {
    num += (s.instances - mx) * (s.costMs - my);
    den += (s.instances - mx) ** 2;
  }
  return den > 0 ? num / den : 0;
}
