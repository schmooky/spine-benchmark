/**
 * Per-run device capacity + measurement self-validation.
 *
 * The calibration study needs a SINGLE run to answer two things about the device
 * it ran on:
 *   1. How much can it do? - its capacity on each cost axis (RI/fill and
 *      CI/compute), expressed as the load where it can no longer hold its own
 *      refresh (the "ceiling"), plus a safe headroom budget.
 *   2. Are our measurements any good? - whether the RI/CI features actually
 *      predict the measured breaking points on THIS device (a self-fit), so we
 *      know if the "spine = X% of device" mapping can be trusted.
 *
 * A run already carries the data: every per-second row is a (features,
 * instances, gpuMs/cpuMs/fps) point, and the pure-RI / pure-CI calibration
 * primitives isolate one axis each. We reuse the existing fit/predict math
 * rather than inventing new formulas.
 *
 * Works with OR without the GPU timer: on Safari/iOS (no
 * EXT_disjoint_timer_query) there is no per-frame GPU ms, so the ceiling and the
 * self-fit fall back to the frame-time / fps knee. This is a first-class path,
 * not an error.
 */
import {
  type ImpactFeatures,
  FEATURE_KEYS,
} from "@spine-benchmark/metrics-impact-formula";
import { fitAxis, type TrainingRow } from "./index.js";
import { fitQuality, solveRidge } from "./ridge.js";

/** first load where median fps falls this far below native refresh = "can't
 * sustain". 0.92 * 60 ~= 55fps. Above this it is holding refresh. */
const SUSTAIN_FRAC = 0.92;

/** one per-second row of the capture, as the runner records it. `one` is the
 * per-INSTANCE feature vector; `ri`/`ci` are scene TOTALS. */
export interface CapacityRow {
  scenarioId: string;
  instances: number;
  fps: number;
  frameMsP95: number;
  ri: number;
  ci: number;
  one: Partial<ImpactFeatures> | null;
  gpuMs?: number | null;
  cpuMs?: number | null;
  /** Total per-frame CPU (spine.update + render-side); the honest compute (CI)
   * target. Preferred over cpuMs for the CPU-axis fit; cpuMs alone undercounts
   * Spine (computeWorldVertices lands in the render phases). */
  frameCpuMs?: number | null;
}

export interface CapacityScenarioMeta {
  id: string;
  label: string;
  kind?: string;
}

export interface AnalyzeRunInput {
  perSecond: CapacityRow[];
  scenarios: CapacityScenarioMeta[];
  displayHz: number;
  /** explicit GPU-timer support; if omitted, inferred from any non-null gpuMs. */
  gpuTimerSupported?: boolean;
}

export interface AxisFit {
  r2: number;
  mae: number;
  n: number;
}

export interface SceneKnee {
  id: string;
  label: string;
  /** per-instance RI and CI of this scene. */
  ri: number;
  ci: number;
  /** measured sustain knee (instances where it drops below refresh), or null if
   * it never dropped within the ramp. */
  measured: number | null;
  /** knee predicted from RI/CI x the per-unit costs, or null if not computable. */
  predicted: number | null;
  /** |predicted-measured|/measured, percent. */
  errPct: number | null;
}

export interface RunCapacityReport {
  gpuTimerAvailable: boolean;
  displayHz: number;
  /** 100% capacity: one native frame period (1000/Hz). */
  ceilingBudgetMs: number;
  /** practical target leaving headroom for game logic (half the frame). */
  safeBudgetMs: number;
  /** ms per one unit of RI / CI, measured from the calibration primitives (or a
   * 2-axis fit over the real scenes when primitives are absent). null if not
   * measurable. */
  perUnit: { riUnitMs: number | null; ciUnitMs: number | null };
  /** RI / CI units affordable at the ceiling budget. */
  ceilingUnits: { ri: number | null; ci: number | null };
  /** which axis saturates first for the run's typical scene. */
  binding: "ri" | "ci" | "unknown";
  /** self-fit quality. gpu/cpu: full-feature ridge on true ms (when timer on).
   * combined: frame-cost ridge (no-timer path). riCi: the 2-axis RI/CI model
   * scored against measured cost across real scenes. */
  fit: {
    gpu: AxisFit | null;
    cpu: AxisFit | null;
    combined: AxisFit | null;
    riCi: AxisFit | null;
  };
  knees: { scenes: SceneKnee[]; medianErrPct: number | null };
  /** what one typical real spine costs on this device. */
  capacity: {
    meanSceneRi: number;
    meanSceneCi: number;
    /** % of the ceiling one instance of the mean scene consumes. */
    perInstancePct: number | null;
    /** how many of the mean scene fit at the ceiling. */
    maxConcurrent: number | null;
  } | null;
  verdict: "good" | "marginal" | "poor" | "insufficient";
  verdictReason: string;
  note: string;
}

// ── small helpers ──────────────────────────────────────────────

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function normFeatures(one: Partial<ImpactFeatures> | null): ImpactFeatures {
  const f = {} as ImpactFeatures;
  for (const k of FEATURE_KEYS) f[k] = one?.[k] ?? 0;
  return f;
}

/** A training row for the self-fit: per-instance features scaled to the composite
 * at `instances` (overdrawFactor is intensive, not multiplied), paired with the
 * measured composite ms. Mirrors deviceFit.toTrainingRows, inlined so this pure
 * capacity module stays free of the spine-dependent analyzers package. */
function scaledRow(
  one: Partial<ImpactFeatures> | null,
  instances: number,
  gpuMs: number | null,
  cpuMs: number | null,
): TrainingRow {
  const f = normFeatures(one);
  const scaled = {} as ImpactFeatures;
  for (const k of FEATURE_KEYS) scaled[k] = k === "overdrawFactor" ? f[k] : f[k] * instances;
  return { features: scaled, gpuMs, cpuMs, family: "device" };
}

/** collapse a scenario's rows to one (instances -> median cost) step per density. */
function aggregateSteps(
  rows: CapacityRow[],
  costOf: (r: CapacityRow) => number | null,
): { instances: number; costMs: number }[] {
  const byN = new Map<number, number[]>();
  for (const r of rows) {
    const c = costOf(r);
    if (r.instances > 0 && c != null && c > 0) {
      (byN.get(r.instances) ?? byN.set(r.instances, []).get(r.instances)!).push(c);
    }
  }
  return [...byN.entries()]
    .map(([instances, cs]) => ({ instances, costMs: median(cs) }))
    .sort((a, b) => a.instances - b.instances);
}

/** slope (ms per instance) of a set of (instances, cost) steps via least squares. */
function slope(steps: { instances: number; costMs: number }[]): number {
  if (steps.length < 2) return 0;
  const n = steps.length;
  const mx = steps.reduce((a, s) => a + s.instances, 0) / n;
  const my = steps.reduce((a, s) => a + s.costMs, 0) / n;
  let num = 0;
  let den = 0;
  for (const s of steps) {
    num += (s.instances - mx) * (s.costMs - my);
    den += (s.instances - mx) ** 2;
  }
  return den > 0 ? num / den : 0;
}

/** measured sustain knee: instances where median fps first drops below
 * SUSTAIN_FRAC*Hz, linearly interpolated between the bracketing densities. */
function sustainKnee(rows: CapacityRow[], displayHz: number): number | null {
  const thresh = SUSTAIN_FRAC * displayHz;
  const byN = new Map<number, number[]>();
  for (const r of rows) {
    if (r.instances > 0 && r.fps > 0) {
      (byN.get(r.instances) ?? byN.set(r.instances, []).get(r.instances)!).push(r.fps);
    }
  }
  const steps = [...byN.entries()]
    .map(([instances, fps]) => ({ instances, fps: median(fps) }))
    .sort((a, b) => a.instances - b.instances);
  if (steps.length === 0) return null;
  let prev = steps[0];
  for (const s of steps) {
    if (s.fps < thresh) {
      if (s.instances === prev.instances || s.fps === prev.fps) return s.instances;
      // interpolate on fps between prev (>=thresh) and s (<thresh)
      const t = (prev.fps - thresh) / (prev.fps - s.fps);
      return Math.round(prev.instances + t * (s.instances - prev.instances));
    }
    prev = s;
  }
  return null; // never dropped below refresh within the ramp
}

/** median per-instance RI and CI for a scenario (ri/ci are totals). */
function perInstanceRiCi(rows: CapacityRow[]): { ri: number; ci: number } {
  const ri = rows.filter((r) => r.instances > 0).map((r) => r.ri / r.instances);
  const ci = rows.filter((r) => r.instances > 0).map((r) => r.ci / r.instances);
  return { ri: median(ri), ci: median(ci) };
}

const isFill = (m: CapacityScenarioMeta) => /fill|ri[-_\s]?heavy/i.test(`${m.id} ${m.label}`);
const isCompute = (m: CapacityScenarioMeta) => /compute|ci[-_\s]?heavy/i.test(`${m.id} ${m.label}`);
const isCalib = (m: CapacityScenarioMeta) => /calib|calibration/i.test(`${m.id} ${m.label}`) || isFill(m) || isCompute(m);

// ── main ───────────────────────────────────────────────────────

export function analyzeRunCapacity(input: AnalyzeRunInput): RunCapacityReport {
  const { perSecond, scenarios } = input;
  const displayHz = input.displayHz > 0 ? input.displayHz : 60;
  const ceilingBudgetMs = 1000 / displayHz;
  const safeBudgetMs = ceilingBudgetMs * 0.5;
  const gpuTimerAvailable =
    input.gpuTimerSupported ?? perSecond.some((r) => r.gpuMs != null);

  const metaById = new Map(scenarios.map((s) => [s.id, s]));
  const rowsByScenario = new Map<string, CapacityRow[]>();
  for (const r of perSecond) {
    (rowsByScenario.get(r.scenarioId) ?? rowsByScenario.set(r.scenarioId, []).get(r.scenarioId)!).push(r);
  }

  // cost picker: true GPU ms when we have it, else the frame-time p95 (whose
  // SLOPE over a ramp is a valid cost gradient even though it is vsync-floored).
  const costOf = (r: CapacityRow): number | null =>
    gpuTimerAvailable && r.gpuMs != null ? r.gpuMs : r.frameMsP95 > 0 ? r.frameMsP95 : null;

  // for the no-timer marginal cost, only the rising region carries signal.
  const risingCostOf = (r: CapacityRow): number | null => {
    if (gpuTimerAvailable && r.gpuMs != null) return r.gpuMs;
    return r.frameMsP95 > ceilingBudgetMs * 1.05 ? r.frameMsP95 : null;
  };

  // classify scenarios that actually ramp (>=3 densities).
  const fillScenarios: string[] = [];
  const computeScenarios: string[] = [];
  const realScenarios: string[] = [];
  for (const [id, rows] of rowsByScenario) {
    const densities = new Set(rows.map((r) => r.instances)).size;
    if (densities < 2) continue;
    const meta = metaById.get(id) ?? { id, label: id };
    if (isFill(meta)) fillScenarios.push(id);
    else if (isCompute(meta)) computeScenarios.push(id);
    else if (!isCalib(meta) && densities >= 3) realScenarios.push(id);
  }

  // ── per-unit RI / CI cost from the primitives ──
  const unitFrom = (ids: string[], axis: "ri" | "ci"): number | null => {
    const marginals: number[] = [];
    for (const id of ids) {
      const rows = rowsByScenario.get(id) ?? [];
      const steps = aggregateSteps(rows, risingCostOf);
      const m = slope(steps);
      const per = perInstanceRiCi(rows);
      const unitFeature = axis === "ri" ? per.ri : per.ci;
      if (m > 0 && unitFeature > 0) marginals.push(m / unitFeature);
    }
    return marginals.length ? median(marginals) : null;
  };
  let riUnitMs = unitFrom(fillScenarios, "ri");
  let ciUnitMs = unitFrom(computeScenarios, "ci");

  // fallback: no primitives -> 2-axis least squares over the real scenes'
  // marginal ms per instance vs their (RI, CI) per instance.
  if ((riUnitMs == null || ciUnitMs == null) && realScenarios.length >= 3) {
    const X: number[][] = [];
    const y: number[] = [];
    for (const id of realScenarios) {
      const rows = rowsByScenario.get(id) ?? [];
      const m = slope(aggregateSteps(rows, risingCostOf));
      const per = perInstanceRiCi(rows);
      if (m > 0 && (per.ri > 0 || per.ci > 0)) {
        X.push([per.ri, per.ci]);
        y.push(m);
      }
    }
    if (X.length >= 3) {
      // solveRidge prepends the intercept column; force it near-zero with a
      // small lambda so the two slopes carry the cost.
      const beta = solveRidge(X, y, 1e-4);
      const ri = beta[1];
      const ci = beta[2];
      if (riUnitMs == null && ri > 0) riUnitMs = ri;
      if (ciUnitMs == null && ci > 0) ciUnitMs = ci;
    }
  }

  const ceilingUnits = {
    ri: riUnitMs != null && riUnitMs > 0 ? ceilingBudgetMs / riUnitMs : null,
    ci: ciUnitMs != null && ciUnitMs > 0 ? ceilingBudgetMs / ciUnitMs : null,
  };

  // ── per real scene: measured vs predicted knee ──
  const predCost = (ri: number, ci: number): number | null => {
    if (riUnitMs == null && ciUnitMs == null) return null;
    return (riUnitMs ?? 0) * ri + (ciUnitMs ?? 0) * ci;
  };
  const scenes: SceneKnee[] = [];
  let sumRi = 0;
  let sumCi = 0;
  for (const id of realScenarios) {
    const rows = rowsByScenario.get(id) ?? [];
    const meta = metaById.get(id) ?? { id, label: id };
    const per = perInstanceRiCi(rows);
    const measured = sustainKnee(rows, displayHz);
    const perMs = predCost(per.ri, per.ci);
    const predicted = perMs != null && perMs > 0 ? Math.round(ceilingBudgetMs / perMs) : null;
    const errPct =
      measured != null && predicted != null && measured > 0
        ? Math.abs(predicted - measured) / measured * 100
        : null;
    scenes.push({ id, label: meta.label, ri: per.ri, ci: per.ci, measured, predicted, errPct });
    sumRi += per.ri;
    sumCi += per.ci;
  }
  const errs = scenes.map((s) => s.errPct).filter((e): e is number => e != null);
  const medianErrPct = errs.length ? median(errs) : null;

  // ── self-fit: full-feature ridge on measured ms ──
  const trainingRows = perSecond
    .filter((r) => r.one != null && r.instances > 0)
    // The CPU-axis target is frameCpuMs (honest compute = spine.update +
    // render-side CPU); fall back to cpuMs for pre-0.4.1 runs. It rides in the
    // row's cpuMs slot so the axis fit reads it transparently.
    .map((r) => scaledRow(r.one, r.instances, r.gpuMs ?? null, r.frameCpuMs ?? r.cpuMs ?? null));
  const toAxisFit = (f: ReturnType<typeof fitAxis>): AxisFit | null =>
    f ? { r2: f.r2, mae: f.mae, n: f.n } : null;
  const gpuFit = gpuTimerAvailable ? toAxisFit(fitAxis(trainingRows, "gpuMs", "device")) : null;
  // Compute-axis fit does NOT need the GPU timer - frameCpuMs is measured on
  // every device (including the no-timer Android fleet where RI can't be fit).
  const cpuFit = toAxisFit(fitAxis(trainingRows, "cpuMs", "device"));

  // combined frame-cost fit for the no-timer path (features -> frame ms excess).
  let combinedFit: AxisFit | null = null;
  if (!gpuTimerAvailable) {
    const combRows = perSecond
      .filter((r) => r.one != null && r.instances > 0 && r.frameMsP95 > ceilingBudgetMs * 1.05)
      .map((r) => scaledRow(r.one, r.instances, r.frameMsP95, null));
    combinedFit = toAxisFit(fitAxis(combRows, "gpuMs", "device"));
  }

  // riCi: score the 2-axis RI/CI model against measured cost across real scenes.
  let riCiFit: AxisFit | null = null;
  if (riUnitMs != null || ciUnitMs != null) {
    const pred: number[] = [];
    const actual: number[] = [];
    for (const id of realScenarios) {
      for (const r of rowsByScenario.get(id) ?? []) {
        const c = risingCostOf(r);
        const p = predCost(r.ri, r.ci);
        if (c != null && p != null) {
          pred.push(p);
          actual.push(c);
        }
      }
    }
    if (actual.length >= 3) {
      const q = fitQuality(pred, actual);
      riCiFit = { r2: q.r2, mae: q.mae, n: actual.length };
    }
  }

  // ── binding axis + capacity statement for the mean scene ──
  const meanSceneRi = scenes.length ? sumRi / scenes.length : 0;
  const meanSceneCi = scenes.length ? sumCi / scenes.length : 0;
  const riLoad = (riUnitMs ?? 0) * meanSceneRi;
  const ciLoad = (ciUnitMs ?? 0) * meanSceneCi;
  const binding: RunCapacityReport["binding"] =
    riLoad === 0 && ciLoad === 0 ? "unknown" : riLoad >= ciLoad ? "ri" : "ci";
  const meanPerMs = predCost(meanSceneRi, meanSceneCi);
  const capacity = scenes.length
    ? {
        meanSceneRi,
        meanSceneCi,
        perInstancePct: meanPerMs != null && meanPerMs > 0 ? (meanPerMs / ceilingBudgetMs) * 100 : null,
        maxConcurrent: meanPerMs != null && meanPerMs > 0 ? Math.round(ceilingBudgetMs / meanPerMs) : null,
      }
    : null;

  // ── verdict ──
  let verdict: RunCapacityReport["verdict"] = "insufficient";
  let verdictReason = "not enough ramp data to validate the RI/CI model";
  const primaryR2 = gpuTimerAvailable ? gpuFit?.r2 ?? null : combinedFit?.r2 ?? null;
  if (medianErrPct != null && scenes.filter((s) => s.errPct != null).length >= 3) {
    const r2ok = primaryR2 == null || primaryR2 >= 0.9;
    const r2marginal = primaryR2 == null || primaryR2 >= 0.7;
    if (medianErrPct < 20 && r2ok) {
      verdict = "good";
      verdictReason = `RI/CI predict breaking points within ${medianErrPct.toFixed(0)}% (median)`;
    } else if (medianErrPct < 40 && r2marginal) {
      verdict = "marginal";
      verdictReason = `RI/CI predict breaking points within ${medianErrPct.toFixed(0)}% (median) - usable, watch the outliers`;
    } else {
      verdict = "poor";
      verdictReason = `RI/CI mispredict breaking points by ${medianErrPct.toFixed(0)}% (median) - features miss a cost this device cares about`;
    }
  }

  const note = gpuTimerAvailable
    ? "GPU timer available: capacity and self-fit use true per-frame GPU/CPU ms."
    : "No GPU timer (Safari/iOS): capacity and self-fit use the frame-time / fps knee; GPU and CPU cost cannot be separated on this device.";

  return {
    gpuTimerAvailable,
    displayHz,
    ceilingBudgetMs,
    safeBudgetMs,
    perUnit: { riUnitMs, ciUnitMs },
    ceilingUnits,
    binding,
    fit: { gpu: gpuFit, cpu: cpuFit, combined: combinedFit, riCi: riCiFit },
    knees: { scenes, medianErrPct },
    capacity,
    verdict,
    verdictReason,
    note,
  };
}
