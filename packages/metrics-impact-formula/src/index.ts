/**
 * @module @spine-benchmark/metrics-impact-formula
 *
 * Canonical Rendering Impact (RI) and Computational Impact (CI) formulas
 * shared by every Spine Benchmark scorer:
 *
 *   - `@spine-benchmark/metrics-reporting`  (offline analysis pipeline)
 *   - `@spine-benchmark/pixi-crawler`        (real-time runtime profiler)
 *   - `@spine-benchmark/site` heatmap hook   (in-app per-frame heatmap)
 *
 * Keeping the constants in exactly one place is what guarantees that the
 * crawler running on a live scene produces the same numbers as the benchmark
 * running on the same skeleton offline. Anything that scores Spine impact
 * MUST go through the functions exported here  -  never copy them.
 *
 * The formulas are intentionally pure, framework-free, and zero-dependency
 * so that even ultra-light consumers (browser overlays, sandboxed workers)
 * can import them without dragging in pixi, the analysis pipeline, or the
 * Spine runtime.
 */

// ──────────────────────────────────────────────────────────────
// Impact level + brackets
// ──────────────────────────────────────────────────────────────

/**
 * Canonical impact level union. Use the kebab-case `'very-high'` literal
 * everywhere - it reads naturally as a multi-word identifier next to the
 * single-word levels, matches the CSS class names used by the offline
 * report viewer (`impact-very-high`, `badge-very-high`), and keeps the
 * crawler and the offline scorer in lockstep.
 */
export type ImpactLevel = 'minimal' | 'low' | 'moderate' | 'high' | 'very-high';

/**
 * Default bracket boundaries `[low, moderate, high, very-high]`.
 *
 *   score < 3   -> minimal
 *   score < 8   -> low
 *   score < 15  -> moderate
 *   score < 25  -> high
 *   score >= 25 -> very-high
 *
 * Raise these for high-end targets (e.g. desktop GPU `[6, 16, 30, 50]`)
 * or lower them for constrained devices (e.g. mobile `[2, 5, 10, 18]`).
 */
export const DEFAULT_IMPACT_BRACKETS: readonly [number, number, number, number] = [3, 8, 15, 25];

/**
 * Classify a numeric impact score into a level using the supplied brackets.
 * Defaults to {@link DEFAULT_IMPACT_BRACKETS}.
 */
export function classifyImpactLevel(
  score: number,
  brackets: readonly [number, number, number, number] = DEFAULT_IMPACT_BRACKETS,
): ImpactLevel {
  if (score >= brackets[3]) return 'very-high';
  if (score >= brackets[2]) return 'high';
  if (score >= brackets[1]) return 'moderate';
  if (score >= brackets[0]) return 'low';
  return 'minimal';
}

/**
 * `{ level, cost }` pair derived from a raw impact score. Equivalent to
 * `{ level: classifyImpactLevel(cost), cost }` and kept as a separate
 * helper for backwards compatibility with the offline reporter.
 */
export interface ImpactBadge {
  level: ImpactLevel;
  cost: number;
}

export function impactFromCost(
  cost: number,
  brackets: readonly [number, number, number, number] = DEFAULT_IMPACT_BRACKETS,
): ImpactBadge {
  return { level: classifyImpactLevel(cost, brackets), cost };
}

// ──────────────────────────────────────────────────────────────
// Rendering Impact
// ──────────────────────────────────────────────────────────────

/**
 * Inputs to {@link renderingImpactCost}. Counts are *active*: visible slots
 * with non-zero alpha, evaluated either over a single live frame (crawler /
 * heatmap hook) or aggregated over an animation timeline (offline pipeline).
 */
export interface RenderingImpactInputs {
  /** Slots with a non-`normal` blend mode that are currently visible. */
  activeNonNormalBlends: number;
  /** Active `ClippingAttachment` slots. */
  activeClippingMasks: number;
  /** Sum of vertices across all visible mesh attachments. */
  totalVertices: number;
  /** Rasterized coverage in thousands of pixels (fill work). Optional so
   * existing callers that can't measure coverage keep the legacy behavior. */
  coveredKpx?: number;
  /** Mean overdraw depth over the covered region (layered/semi-transparent
   * fill multiplies fragment cost). Optional; defaults to 1. */
  overdrawFactor?: number;
}

/** Tunable RI weights. Defaults reproduce the original formula exactly; the
 * fitted values from @spine-benchmark/metrics-model can be injected instead. */
export interface RenderingWeights {
  nonNormalBlend: number;
  clippingMask: number;
  vertex: number;
  /** per 1000 covered px (0 in the legacy formula - the missing fill term). */
  coveredKpx: number;
}

export const DEFAULT_RENDERING_WEIGHTS: RenderingWeights = {
  nonNormalBlend: 3,
  clippingMask: 5,
  vertex: 1 / 200,
  coveredKpx: 0,
};

/**
 * RI formula (parameterized):
 *
 *   RI = blends·w_blend + clips·w_clip + vertices·w_vertex
 *      + coveredKpx·overdrawFactor·w_coveredKpx
 *
 * With {@link DEFAULT_RENDERING_WEIGHTS} and no coverage this equals the
 * original `blends·3 + clips·5 + vertices/200`.
 */
export function renderingImpactCost(
  inputs: RenderingImpactInputs,
  weights: RenderingWeights = DEFAULT_RENDERING_WEIGHTS,
): number {
  const overdraw = inputs.overdrawFactor ?? 1;
  return (
    inputs.activeNonNormalBlends * weights.nonNormalBlend +
    inputs.activeClippingMasks * weights.clippingMask +
    inputs.totalVertices * weights.vertex +
    (inputs.coveredKpx ?? 0) * overdraw * weights.coveredKpx
  );
}

// ──────────────────────────────────────────────────────────────
// Computational Impact
// ──────────────────────────────────────────────────────────────

export interface ConstraintInputs {
  /** Active physics constraints. */
  physics: number;
  /** Active path constraints. */
  path: number;
  /** Active IK constraints. */
  ik: number;
  /** Active transform constraints. */
  transform: number;
}

/**
 * Inputs to {@link computationalImpactCost}.
 */
export interface ComputationalImpactInputs {
  constraints: ConstraintInputs;
  /** Sum of vertices across active mesh attachments. */
  totalVertices: number;
  /** Number of currently active mesh attachments (any kind). */
  activeMeshCount: number;
  /** Subset of meshes that are weighted (have bones). */
  weightedMeshCount: number;
  /** Subset of meshes that are deformed (have a non-empty deform array). */
  deformedMeshCount: number;
}

/**
 * CI formula:
 *
 *   constraintCost = (physics × 0.7) + (path × 0.55)
 *                  + (ik × 0.35) + (transform × 0.2)
 *
 *   avgVerts = totalVertices / max(activeMeshCount, 1)
 *
 *   deformedMeshWeight = 0.08 + min(0.5, avgVerts / 500)
 *   weightedMeshWeight = 0.1  + min(0.55, avgVerts / 450)
 *
 *   meshCost = (deformedMeshCount × deformedMeshWeight)
 *            + (weightedMeshCount × weightedMeshWeight)
 *            + (totalVertices / 2000)
 *
 *   CI = constraintCost + meshCost
 *
 * Constraint weights mirror the early-out cost profile of `spine-ts` core;
 * mesh weights scale by per-mesh vertex density because deformation/skinning
 * is the dominant cost rather than mesh count alone.
 */
/** Tunable CI weights. Defaults reproduce the original formula. */
export interface ComputationalWeights {
  physics: number;
  path: number;
  ik: number;
  transform: number;
  deformedMeshBase: number;
  weightedMeshBase: number;
  vertex: number;
}

export const DEFAULT_COMPUTATIONAL_WEIGHTS: ComputationalWeights = {
  physics: 0.7,
  path: 0.55,
  ik: 0.35,
  transform: 0.2,
  deformedMeshBase: 0.08,
  weightedMeshBase: 0.1,
  vertex: 1 / 2000,
};

export function computationalImpactCost(
  inputs: ComputationalImpactInputs,
  weights: ComputationalWeights = DEFAULT_COMPUTATIONAL_WEIGHTS,
): number {
  const meshCount = Math.max(inputs.activeMeshCount, 1);
  const averageVerticesPerMesh = inputs.totalVertices / meshCount;

  const constraintCost =
    inputs.constraints.physics * weights.physics +
    inputs.constraints.path * weights.path +
    inputs.constraints.ik * weights.ik +
    inputs.constraints.transform * weights.transform;

  const deformedMeshWeight = weights.deformedMeshBase + Math.min(0.5, averageVerticesPerMesh / 500);
  const weightedMeshWeight = weights.weightedMeshBase + Math.min(0.55, averageVerticesPerMesh / 450);
  const meshComputationCost =
    inputs.deformedMeshCount * deformedMeshWeight +
    inputs.weightedMeshCount * weightedMeshWeight +
    inputs.totalVertices * weights.vertex;

  return constraintCost + meshComputationCost;
}

// ──────────────────────────────────────────────────────────────
// Fitted ms cost model (#2/#6/#7)
// ──────────────────────────────────────────────────────────────

/**
 * Canonical per-instance feature vector. This is the contract between the
 * runner (which captures these live), the offline fit (metrics-model), and the
 * predictors here. Keep the keys stable - they are the columns of the fit.
 */
export interface ImpactFeatures {
  vertices: number;
  nonNormalBlends: number;
  clippingMasks: number;
  meshes: number;
  weightedMeshes: number;
  deformedMeshes: number;
  ik: number;
  transform: number;
  path: number;
  physics: number;
  drawCallEst: number;
  /** rasterized coverage, thousands of px (the missing RI/fill term). */
  coveredKpx: number;
  /** mean overdraw depth over the covered region. */
  overdrawFactor: number;
}

export const FEATURE_KEYS: readonly (keyof ImpactFeatures)[] = [
  "vertices", "nonNormalBlends", "clippingMasks", "meshes", "weightedMeshes",
  "deformedMeshes", "ik", "transform", "path", "physics", "drawCallEst",
  "coveredKpx", "overdrawFactor",
];

/** A fitted linear map feature-vector -> milliseconds (per instance). */
export interface LinearCostModel {
  /** fixed per-draw overhead, ms. */
  intercept: number;
  /** ms per unit of each feature (missing keys = 0). */
  weights: Partial<Record<keyof ImpactFeatures, number>>;
  /** optional provenance (e.g. GPU family this was fit on). */
  fitFor?: string;
}

/** Predict milliseconds for one instance's features under a fitted model. */
export function predictMs(features: ImpactFeatures, model: LinearCostModel): number {
  let ms = model.intercept;
  for (const k of FEATURE_KEYS) {
    const w = model.weights[k];
    if (w) ms += (features[k] ?? 0) * w;
  }
  return Math.max(0, ms);
}

/**
 * Placeholder default models until real coefficients are fit from the fleet.
 * GPU model carries the rendering/fill features; CPU model the compute ones.
 * The magnitudes are seeded from the current unitless formula so behavior is
 * sane before calibration; metrics-model replaces these.
 */
export const DEFAULT_GPU_COST_MODEL: LinearCostModel = {
  intercept: 0.05,
  weights: { vertices: 0.0005, nonNormalBlends: 0.003, clippingMasks: 0.01, coveredKpx: 0.002, drawCallEst: 0.02 },
  fitFor: "placeholder",
};

export const DEFAULT_CPU_COST_MODEL: LinearCostModel = {
  intercept: 0.02,
  weights: { physics: 0.02, path: 0.015, ik: 0.008, transform: 0.004, deformedMeshes: 0.01, weightedMeshes: 0.008, vertices: 0.0002 },
  fitFor: "placeholder",
};

/** Predicted GPU ms and CPU ms for one instance (the two-budget model, #7). */
export function predictCostMs(
  features: ImpactFeatures,
  gpu: LinearCostModel = DEFAULT_GPU_COST_MODEL,
  cpu: LinearCostModel = DEFAULT_CPU_COST_MODEL,
): { gpuMs: number; cpuMs: number; totalMs: number } {
  const g = predictMs(features, gpu);
  const c = predictMs(features, cpu);
  return { gpuMs: g, cpuMs: c, totalMs: g + c };
}
