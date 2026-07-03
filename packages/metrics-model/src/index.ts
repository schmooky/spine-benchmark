/**
 * @module @spine-benchmark/metrics-model
 *
 * Fits the RI/CI cost model from measured device data instead of hand-tuning it.
 * Each training row is one measurement: a feature vector plus the true GPU ms
 * (from the timer query) and CPU ms (spine.update). We fit two linear models -
 * features -> GPU ms, features -> CPU ms - overall and per GPU family, and
 * report cross-validated quality so the coefficients can be trusted (or not).
 *
 * The output {@link LinearCostModel}s plug straight into
 * `predictCostMs()` in @spine-benchmark/metrics-impact-formula.
 */
import {
  FEATURE_KEYS,
  type ImpactFeatures,
  type LinearCostModel,
} from "@spine-benchmark/metrics-impact-formula";
import { fitQuality, solveRidge } from "./ridge.js";

export * from "./ridge.js";
export * from "./analyzeRunCapacity.js";

export interface TrainingRow {
  features: ImpactFeatures;
  /** true GPU render ms for this feature load (per the instance count implied
   * by `features`, i.e. already the composite the row represents). */
  gpuMs: number | null;
  /** true CPU spine-update ms. */
  cpuMs: number | null;
  /** GPU family / cluster key, e.g. "Apple GPU" or "Adreno 6xx". */
  family: string;
}

function toRow(f: ImpactFeatures): number[] {
  return FEATURE_KEYS.map((k) => f[k] ?? 0);
}

function coeffsToModel(beta: number[], fitFor: string): LinearCostModel {
  const weights: LinearCostModel["weights"] = {};
  FEATURE_KEYS.forEach((k, i) => {
    const w = beta[i + 1]; // +1 skips the intercept at index 0
    if (w) weights[k] = w;
  });
  return { intercept: beta[0] ?? 0, weights, fitFor };
}

export interface AxisQuality {
  r2: number;
  mae: number;
  /** mae relative to the mean target magnitude (the error-band fraction the
   * UI shows as "+-N%"). */
  relMae: number;
  n: number;
}

export interface AxisFit {
  model: LinearCostModel;
  r2: number;
  mae: number;
  relMae: number;
  n: number;
}

function relOf(mae: number, y: number[]): number {
  const meanAbs = y.reduce((s, v) => s + Math.abs(v), 0) / Math.max(1, y.length);
  return meanAbs > 0 ? mae / meanAbs : 0;
}

/** Fit one axis (gpu or cpu) from rows that have a value for it. */
export function fitAxis(
  rows: TrainingRow[],
  axis: "gpuMs" | "cpuMs",
  fitFor: string,
  lambda = 1e-3,
): AxisFit | null {
  const usable = rows.filter((r) => r[axis] != null);
  if (usable.length < FEATURE_KEYS.length + 2) return null; // not enough to fit
  const X = usable.map((r) => toRow(r.features));
  const y = usable.map((r) => r[axis] as number);
  const beta = solveRidge(X, y, lambda);
  const model = coeffsToModel(beta, fitFor);
  const pred = X.map((row) => row.reduce((s, v, i) => s + v * beta[i + 1], beta[0]));
  const { r2, mae } = fitQuality(pred, y);
  return { model, r2, mae, relMae: relOf(mae, y), n: usable.length };
}

/** Per-driver weights pinned by an isolation sweep (ms per feature unit). */
export type PinnedWeights = Partial<Record<keyof ImpactFeatures, number>>;

/**
 * Two-stage axis fit. Stage 1 (the caller): isolation sweeps pin the marginal
 * cost of the physically-dominant, scene-collinear drivers (fill, vertices) -
 * a scene-only regression cannot separate them because in real content they
 * move together. Stage 2 (here): the pinned block enters the design matrix as
 * ONE column (its combined predicted ms), so the regression fits a single
 * family scale `alpha` for it plus free weights for everything the sweeps
 * don't cover. Final weights = alpha x pinned + free.
 */
export function fitAxisPinned(
  rows: TrainingRow[],
  axis: "gpuMs" | "cpuMs",
  pinned: PinnedWeights,
  fitFor: string,
  lambda = 1e-3,
): (AxisFit & { pinnedScale: number }) | null {
  const pinnedKeys = (Object.keys(pinned) as (keyof ImpactFeatures)[]).filter(
    (k) => (pinned[k] ?? 0) !== 0,
  );
  if (pinnedKeys.length === 0) {
    const plain = fitAxis(rows, axis, fitFor, lambda);
    return plain ? { ...plain, pinnedScale: 1 } : null;
  }
  const freeKeys = FEATURE_KEYS.filter((k) => !pinnedKeys.includes(k));
  const usable = rows.filter((r) => r[axis] != null);
  if (usable.length < freeKeys.length + 3) return null;

  const comboOf = (f: ImpactFeatures) =>
    pinnedKeys.reduce((s, k) => s + (f[k] ?? 0) * (pinned[k] as number), 0);
  const X = usable.map((r) => [comboOf(r.features), ...freeKeys.map((k) => r.features[k] ?? 0)]);
  const y = usable.map((r) => r[axis] as number);
  // degenerate pinned column (sweeps measured ~0 everywhere): fall back
  if (!X.some((row) => Math.abs(row[0]) > 1e-9)) {
    const plain = fitAxis(rows, axis, fitFor, lambda);
    return plain ? { ...plain, pinnedScale: 1 } : null;
  }
  let beta = solveRidge(X, y, lambda);
  let alpha = beta[1];
  if (!(alpha > 0)) {
    // a non-positive scale means the scene data contradicts the sweeps
    // (usually: too little scene signal). Trust the sweeps at scale 1 and
    // refit ONLY the free weights on the residual - the jointly-solved free
    // weights are not valid once alpha is overridden.
    alpha = 1;
    const resid = usable.map((r, i) => y[i] - comboOf(r.features));
    const Xf = usable.map((r) => freeKeys.map((k) => r.features[k] ?? 0));
    const bf = solveRidge(Xf, resid, lambda);
    beta = [bf[0], alpha, ...bf.slice(1)];
  }
  const weights: LinearCostModel["weights"] = {};
  for (const k of pinnedKeys) weights[k] = (pinned[k] as number) * alpha;
  freeKeys.forEach((k, i) => {
    const w = beta[i + 2];
    if (w) weights[k] = w;
  });
  const model: LinearCostModel = { intercept: beta[0] ?? 0, weights, fitFor };
  const pred = X.map((row) =>
    row.reduce((s, v, i) => s + v * (i === 0 ? alpha : beta[i + 1]), beta[0]),
  );
  const { r2, mae } = fitQuality(pred, y);
  return { model, r2, mae, relMae: relOf(mae, y), n: usable.length, pinnedScale: alpha };
}

export interface FamilyAxisQuality extends AxisQuality {
  /** stage-2 scale applied to the sweep-pinned weights (1 = trusted as-is);
   * present only when the axis was fit with pinned sweeps. */
  pinnedScale?: number;
}

export interface FleetModel {
  gpu: LinearCostModel | null;
  cpu: LinearCostModel | null;
  /** per-GPU-family fits. */
  byFamily: Record<string, { gpu: LinearCostModel | null; cpu: LinearCostModel | null }>;
  /** per-GPU-family fit quality - which families the model actually explains
   * vs. which ones need more/better data (thesis #9's "where to look next"). */
  byFamilyQuality: Record<
    string,
    {
      gpu: FamilyAxisQuality | null;
      cpu: FamilyAxisQuality | null;
    }
  >;
  quality: {
    gpu: AxisQuality | null;
    cpu: AxisQuality | null;
    /** leave-one-device-out cross-val MAE (generalization), if computable. */
    cvMae: { gpu: number | null; cpu: number | null };
  };
}

const toQuality = (f: AxisFit | null): AxisQuality | null =>
  f ? { r2: f.r2, mae: f.mae, relMae: f.relMae, n: f.n } : null;

const toFamilyQuality = (
  f: (AxisFit & { pinnedScale?: number }) | null,
): FamilyAxisQuality | null =>
  f
    ? {
        r2: f.r2,
        mae: f.mae,
        relMae: f.relMae,
        n: f.n,
        ...(f.pinnedScale != null ? { pinnedScale: f.pinnedScale } : {}),
      }
    : null;

/** Fit the whole fleet: pooled models + per-family models + CV quality. */
export function fitFleet(rows: TrainingRow[], lambda = 1e-3): FleetModel {
  return fitFleetTwoStage(rows, {}, lambda);
}

/**
 * Two-stage fleet fit. `pinnedByFamily` carries the per-family sweep-derived
 * marginal weights (stage 1); families with pins get {@link fitAxisPinned}
 * per axis, the rest (and the pooled fleet model) fall back to plain ridge.
 */
export function fitFleetTwoStage(
  rows: TrainingRow[],
  pinnedByFamily: Record<string, { gpu?: PinnedWeights; cpu?: PinnedWeights }>,
  lambda = 1e-3,
): FleetModel {
  const gpu = fitAxis(rows, "gpuMs", "fleet", lambda);
  const cpu = fitAxis(rows, "cpuMs", "fleet", lambda);

  const families = [...new Set(rows.map((r) => r.family))];
  const byFamily: FleetModel["byFamily"] = {};
  const byFamilyQuality: FleetModel["byFamilyQuality"] = {};
  for (const fam of families) {
    const famRows = rows.filter((r) => r.family === fam);
    const pins = pinnedByFamily[fam];
    const famGpu = pins?.gpu
      ? fitAxisPinned(famRows, "gpuMs", pins.gpu, fam, lambda)
      : fitAxis(famRows, "gpuMs", fam, lambda);
    const famCpu = pins?.cpu
      ? fitAxisPinned(famRows, "cpuMs", pins.cpu, fam, lambda)
      : fitAxis(famRows, "cpuMs", fam, lambda);
    byFamily[fam] = { gpu: famGpu?.model ?? null, cpu: famCpu?.model ?? null };
    byFamilyQuality[fam] = {
      gpu: toFamilyQuality(famGpu),
      cpu: toFamilyQuality(famCpu),
    };
  }

  return {
    gpu: gpu?.model ?? null,
    cpu: cpu?.model ?? null,
    byFamily,
    byFamilyQuality,
    quality: {
      gpu: toQuality(gpu),
      cpu: toQuality(cpu),
      cvMae: {
        gpu: crossValMae(rows, "gpuMs", families, lambda),
        cpu: crossValMae(rows, "cpuMs", families, lambda),
      },
    },
  };
}

/** Leave-one-family-out CV: fit on all-but-one family, score on the held-out. */
function crossValMae(
  rows: TrainingRow[],
  axis: "gpuMs" | "cpuMs",
  families: string[],
  lambda: number,
): number | null {
  if (families.length < 2) return null;
  let total = 0;
  let count = 0;
  for (const held of families) {
    const train = rows.filter((r) => r.family !== held);
    const test = rows.filter((r) => r.family === held && r[axis] != null);
    if (test.length === 0) continue;
    const fit = fitAxis(train, axis, "cv", lambda);
    if (!fit) continue;
    for (const r of test) {
      const pred = FEATURE_KEYS.reduce(
        (s, k) => s + (r.features[k] ?? 0) * (fit.model.weights[k] ?? 0),
        fit.model.intercept,
      );
      total += Math.abs((r[axis] as number) - pred);
      count++;
    }
  }
  return count > 0 ? total / count : null;
}
