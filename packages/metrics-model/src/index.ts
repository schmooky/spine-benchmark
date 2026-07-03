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

/** Fit one axis (gpu or cpu) from rows that have a value for it. */
export function fitAxis(
  rows: TrainingRow[],
  axis: "gpuMs" | "cpuMs",
  fitFor: string,
  lambda = 1e-3,
): { model: LinearCostModel; r2: number; mae: number; n: number } | null {
  const usable = rows.filter((r) => r[axis] != null);
  if (usable.length < FEATURE_KEYS.length + 2) return null; // not enough to fit
  const X = usable.map((r) => toRow(r.features));
  const y = usable.map((r) => r[axis] as number);
  const beta = solveRidge(X, y, lambda);
  const model = coeffsToModel(beta, fitFor);
  const pred = X.map((row) => row.reduce((s, v, i) => s + v * beta[i + 1], beta[0]));
  const { r2, mae } = fitQuality(pred, y);
  return { model, r2, mae, n: usable.length };
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
      gpu: { r2: number; mae: number; n: number } | null;
      cpu: { r2: number; mae: number; n: number } | null;
    }
  >;
  quality: {
    gpu: { r2: number; mae: number; n: number } | null;
    cpu: { r2: number; mae: number; n: number } | null;
    /** leave-one-device-out cross-val MAE (generalization), if computable. */
    cvMae: { gpu: number | null; cpu: number | null };
  };
}

/** Fit the whole fleet: pooled models + per-family models + CV quality. */
export function fitFleet(rows: TrainingRow[], lambda = 1e-3): FleetModel {
  const gpu = fitAxis(rows, "gpuMs", "fleet", lambda);
  const cpu = fitAxis(rows, "cpuMs", "fleet", lambda);

  const families = [...new Set(rows.map((r) => r.family))];
  const byFamily: FleetModel["byFamily"] = {};
  const byFamilyQuality: FleetModel["byFamilyQuality"] = {};
  for (const fam of families) {
    const famRows = rows.filter((r) => r.family === fam);
    const famGpu = fitAxis(famRows, "gpuMs", fam, lambda);
    const famCpu = fitAxis(famRows, "cpuMs", fam, lambda);
    byFamily[fam] = { gpu: famGpu?.model ?? null, cpu: famCpu?.model ?? null };
    byFamilyQuality[fam] = {
      gpu: famGpu ? { r2: famGpu.r2, mae: famGpu.mae, n: famGpu.n } : null,
      cpu: famCpu ? { r2: famCpu.r2, mae: famCpu.mae, n: famCpu.n } : null,
    };
  }

  return {
    gpu: gpu?.model ?? null,
    cpu: cpu?.model ?? null,
    byFamily,
    byFamilyQuality,
    quality: {
      gpu: gpu ? { r2: gpu.r2, mae: gpu.mae, n: gpu.n } : null,
      cpu: cpu ? { r2: cpu.r2, mae: cpu.mae, n: cpu.n } : null,
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
