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
}

/**
 * RI formula:
 *
 *   RI = (activeNonNormalBlends × 3) + (activeClippingMasks × 5)
 *      + (totalVertices / 200)
 */
export function renderingImpactCost(inputs: RenderingImpactInputs): number {
  return (
    inputs.activeNonNormalBlends * 3 +
    inputs.activeClippingMasks * 5 +
    inputs.totalVertices / 200
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
export function computationalImpactCost(inputs: ComputationalImpactInputs): number {
  const meshCount = Math.max(inputs.activeMeshCount, 1);
  const averageVerticesPerMesh = inputs.totalVertices / meshCount;

  const constraintCost =
    inputs.constraints.physics * 0.7 +
    inputs.constraints.path * 0.55 +
    inputs.constraints.ik * 0.35 +
    inputs.constraints.transform * 0.2;

  const deformedMeshWeight = 0.08 + Math.min(0.5, averageVerticesPerMesh / 500);
  const weightedMeshWeight = 0.1 + Math.min(0.55, averageVerticesPerMesh / 450);
  const meshComputationCost =
    inputs.deformedMeshCount * deformedMeshWeight +
    inputs.weightedMeshCount * weightedMeshWeight +
    inputs.totalVertices / 2000;

  return constraintCost + meshComputationCost;
}
