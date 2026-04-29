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

  // --- Enhanced inputs (optional, backwards-compatible) ---

  /**
   * Mix-scaled effective bone counts per constraint type. Each value is
   * `sum(constraint.bones.length * mixScale)` across active constraints.
   * When provided, constraint cost uses per-bone weights instead of
   * per-constraint weights for more accurate mix-aware scoring.
   */
  constraintBones?: { ik: number; path: number; transform: number };

  /**
   * Extra mixing entries beyond the one-track-no-crossfade baseline:
   * sum of `mixingFrom` chain lengths across active tracks (the head
   * track entry itself is NOT counted). A skeleton playing a single
   * animation with no crossfade has `mixingDepth === 0`, so the
   * enhanced CI path matches the basic path on the baseline. Each
   * additional layered mixer (crossfade `mixingFrom`, deeper chains)
   * contributes 1.
   */
  mixingDepth?: number;

  /**
   * Per-mesh details for accurate per-mesh capped cost with bone influence
   * scaling. When provided, replaces the average-based mesh cost calculation.
   */
  meshDetails?: ReadonlyArray<{
    vertices: number;
    weighted: boolean;
    deformed: boolean;
    /** Average bone influences per vertex (1 for non-weighted). */
    boneInfluences: number;
  }>;
}

/**
 * CI formula (basic path, used when enhanced inputs are absent):
 *
 *   constraintCost = (physics x 0.7) + (path x 0.55)
 *                  + (ik x 0.35) + (transform x 0.2)
 *
 *   avgVerts = totalVertices / max(activeMeshCount, 1)
 *
 *   deformedMeshWeight = 0.08 + min(0.5, avgVerts / 500)
 *   weightedMeshWeight = 0.1  + min(0.55, avgVerts / 450)
 *
 *   meshCost = (deformedMeshCount x deformedMeshWeight)
 *            + (weightedMeshCount x weightedMeshWeight)
 *            + (totalVertices / 2000)
 *
 *   CI = constraintCost + meshCost
 *
 * Enhanced path (when `constraintBones`, `meshDetails`, or `mixingDepth` are
 * provided):
 *
 *   constraintCost uses per-bone weights scaled by mix:
 *     (physics x 0.7) + (pathBones x 0.275)
 *     + (ikBones x 0.175) + (transformBones x 0.10)
 *
 *   meshCost uses per-mesh capped cost with bone-influence scaling
 *   normalized to a baseline of 2 influences per vertex:
 *     for each mesh:
 *       if deformed: += 0.08 + min(0.5, verts / 500)
 *       if weighted: += (0.1 + min(0.55, verts / 450)) x (boneInfluences / 2)
 *     += totalVertices / 2000
 *
 *   mixCost = mixingDepth x 0.15
 *
 *   CI = constraintCost + meshCost + mixCost
 *
 * Per-bone constraint weights are calibrated so that a "standard" skeleton
 * (2 bones per chain, mix=1) produces the same constraint cost as the basic
 * path - 0.175 x 2 = 0.35 (IK), 0.275 x 2 = 0.55 (path), 0.10 x 2 = 0.20
 * (transform). The bone-influence multiplier is normalized the same way: a
 * vertex skinned to 2 bones reproduces the old fixed weighted-mesh weight.
 * `mixingDepth` is defined as the count of *extra* mixing entries beyond a
 * single playing animation (sum of `mixingFrom` chain lengths only), so
 * single-track playback with no crossfade contributes zero. Together this
 * means DEFAULT_IMPACT_BRACKETS keep meaning what they meant before: the
 * enhanced path matches the basic path on the canonical baseline (2-bone
 * chains, mix=1, 2-influence skinning, no crossfade) and only diverges
 * when inputs deviate from it.
 *
 * Constraint weights mirror the early-out cost profile of `spine-ts` core;
 * mesh weights scale by per-mesh vertex density because deformation/skinning
 * is the dominant cost rather than mesh count alone.
 */
export function computationalImpactCost(inputs: ComputationalImpactInputs): number {
  // Constraint cost: use per-bone scaling when mix-scaled bone counts are
  // available, otherwise fall back to simple per-constraint weights.
  let constraintCost: number;
  if (inputs.constraintBones) {
    constraintCost =
      inputs.constraints.physics * 0.7 +
      inputs.constraintBones.path * 0.275 +
      inputs.constraintBones.ik * 0.175 +
      inputs.constraintBones.transform * 0.10;
  } else {
    constraintCost =
      inputs.constraints.physics * 0.7 +
      inputs.constraints.path * 0.55 +
      inputs.constraints.ik * 0.35 +
      inputs.constraints.transform * 0.2;
  }

  // Mesh cost: use per-mesh details when available for accurate per-mesh
  // capped cost with bone influence scaling, otherwise use averaged approach.
  let meshCost: number;
  if (inputs.meshDetails && inputs.meshDetails.length > 0) {
    meshCost = 0;
    for (const mesh of inputs.meshDetails) {
      if (mesh.deformed) {
        meshCost += 0.08 + Math.min(0.5, mesh.vertices / 500);
      }
      if (mesh.weighted) {
        // Normalize boneInfluences against a baseline of 2 (typical skinning
        // density) so a 2-influence vertex matches the basic path's fixed
        // weighted-mesh weight, while heavier/lighter skinning scales
        // linearly above/below it.
        meshCost +=
          (0.1 + Math.min(0.55, mesh.vertices / 450)) * (mesh.boneInfluences / 2);
      }
    }
    meshCost += inputs.totalVertices / 2000;
  } else {
    const meshCount = Math.max(inputs.activeMeshCount, 1);
    const averageVerticesPerMesh = inputs.totalVertices / meshCount;
    const deformedMeshWeight = 0.08 + Math.min(0.5, averageVerticesPerMesh / 500);
    const weightedMeshWeight = 0.1 + Math.min(0.55, averageVerticesPerMesh / 450);
    meshCost =
      inputs.deformedMeshCount * deformedMeshWeight +
      inputs.weightedMeshCount * weightedMeshWeight +
      inputs.totalVertices / 2000;
  }

  // Mixing cost: crossfade entries across animation tracks.
  const mixCost = (inputs.mixingDepth ?? 0) * 0.15;

  return constraintCost + meshCost + mixCost;
}

// ──────────────────────────────────────────────────────────────
// Input extractors (canonical, duck-typed, zero-deps)
//
// These helpers translate raw skeleton/state shapes into the numeric
// inputs that `computationalImpactCost` expects. They live here so every
// scoring path - offline pipeline, live crawler, in-app heatmap, gif
// capture, CLI - resolves bone influences, mix scaling, and mixing depth
// the same way. Duplicating this logic in a consumer is a parity bug:
// the formula is shared but the inputs would diverge.
// ──────────────────────────────────────────────────────────────

/** Minimal shape for any constraint with an `active` flag. */
export interface ConstraintActiveLike {
  active?: boolean;
}

/** Treat absent `active` as active (matches spine-core default). */
export function isConstraintActive(constraint: ConstraintActiveLike): boolean {
  return constraint.active !== false;
}

/** Duck-typed IK constraint shape. */
export interface IkConstraintLike extends ConstraintActiveLike {
  mix?: number;
  bones?: ReadonlyArray<unknown>;
}

/** Duck-typed transform constraint shape. */
export interface TransformConstraintLike extends ConstraintActiveLike {
  mixRotate?: number;
  mixX?: number;
  mixY?: number;
  mixScaleX?: number;
  mixScaleY?: number;
  mixShearY?: number;
  bones?: ReadonlyArray<unknown>;
}

/** Duck-typed path constraint shape. */
export interface PathConstraintLike extends ConstraintActiveLike {
  mixRotate?: number;
  mixX?: number;
  mixY?: number;
  bones?: ReadonlyArray<unknown>;
}

/** Duck-typed physics constraint shape. */
export interface PhysicsConstraintLike extends ConstraintActiveLike {
  mix?: number;
}

/** Mix scale for an IK constraint: `abs(mix ?? 1)`. */
export function ikMixScale(c: { mix?: number }): number {
  return Math.abs(c.mix ?? 1);
}

/**
 * Mix scale for a transform constraint: max abs across all six mix axes.
 *
 * Distinguishes "duck-typed object without any mix fields" (older spine
 * versions or partial mocks - falls back to 1 so the constraint still
 * counts at full weight) from "every mix axis is explicitly 0" (real
 * Spine constraint that produces no output - returns 0 so it does not
 * contribute to CI). This mirrors the semantics of {@link ikMixScale}
 * (`abs(mix ?? 1)`), where an explicit `mix: 0` returns 0 but absent
 * `mix` returns 1.
 */
export function transformMixScale(c: {
  mixRotate?: number; mixX?: number; mixY?: number;
  mixScaleX?: number; mixScaleY?: number; mixShearY?: number;
}): number {
  const max = Math.max(
    Math.abs(c.mixRotate ?? 0),
    Math.abs(c.mixX ?? 0),
    Math.abs(c.mixY ?? 0),
    Math.abs(c.mixScaleX ?? 0),
    Math.abs(c.mixScaleY ?? 0),
    Math.abs(c.mixShearY ?? 0),
  );
  if (max > 0) return max;
  const hasAnyField =
    c.mixRotate !== undefined || c.mixX !== undefined || c.mixY !== undefined ||
    c.mixScaleX !== undefined || c.mixScaleY !== undefined || c.mixShearY !== undefined;
  return hasAnyField ? 0 : 1;
}

/**
 * Mix scale for a path constraint: max abs across `mixRotate`/`mixX`/`mixY`.
 * Same fallback semantics as {@link transformMixScale}: absent fields ->
 * neutral 1, all-fields-explicitly-zero -> 0 (no contribution).
 */
export function pathMixScale(c: { mixRotate?: number; mixX?: number; mixY?: number }): number {
  const max = Math.max(
    Math.abs(c.mixRotate ?? 0),
    Math.abs(c.mixX ?? 0),
    Math.abs(c.mixY ?? 0),
  );
  if (max > 0) return max;
  const hasAnyField =
    c.mixRotate !== undefined || c.mixX !== undefined || c.mixY !== undefined;
  return hasAnyField ? 0 : 1;
}

/**
 * `mix === 0` means the physics constraint output is not blended into
 * the skeleton, so it should not contribute to CI. Combined with the
 * usual `active` check.
 */
export function isPhysicsConstraintContributing(c: PhysicsConstraintLike): boolean {
  return isConstraintActive(c) && c.mix !== 0;
}

/**
 * Per-animation / per-frame stats that every CI consumer needs at once:
 * active constraint counts (filtered by {@link isConstraintActive} and
 * {@link isPhysicsConstraintContributing}) plus mix-scaled effective
 * bone counts. Returned together because every consumer needs both in
 * lockstep, and computing them in two passes is both wasteful and a
 * parity bug waiting to happen if the predicates ever diverge.
 */
export interface ConstraintStats {
  /** Active counts. Physics also requires non-zero `mix`. */
  active: { ik: number; transform: number; path: number; physics: number };
  /** Mix-scaled effective bone counts: `sum(bones.length * mixScale)`. */
  bones: { ik: number; transform: number; path: number };
}

/**
 * Single-pass walk over a skeleton's constraint arrays, producing both
 * active counts and mix-scaled effective bone counts. Use this everywhere
 * CI inputs are gathered (crawler, heatmap, gif-capture, CLI) so the
 * predicates and mix-scale rules stay identical across paths.
 */
export function activeConstraintStats(skeleton: {
  ikConstraints?: ReadonlyArray<IkConstraintLike> | null;
  transformConstraints?: ReadonlyArray<TransformConstraintLike> | null;
  pathConstraints?: ReadonlyArray<PathConstraintLike> | null;
  physicsConstraints?: ReadonlyArray<PhysicsConstraintLike> | null;
}): ConstraintStats {
  let ik = 0;
  let ikBones = 0;
  for (const c of skeleton.ikConstraints ?? []) {
    if (!isConstraintActive(c)) continue;
    ik++;
    ikBones += (c.bones?.length ?? 1) * ikMixScale(c);
  }
  let transform = 0;
  let transformBones = 0;
  for (const c of skeleton.transformConstraints ?? []) {
    if (!isConstraintActive(c)) continue;
    transform++;
    transformBones += (c.bones?.length ?? 1) * transformMixScale(c);
  }
  let path = 0;
  let pathBones = 0;
  for (const c of skeleton.pathConstraints ?? []) {
    if (!isConstraintActive(c)) continue;
    path++;
    pathBones += (c.bones?.length ?? 1) * pathMixScale(c);
  }
  let physics = 0;
  for (const c of skeleton.physicsConstraints ?? []) {
    if (!isPhysicsConstraintContributing(c)) continue;
    physics++;
  }
  return {
    active: { ik, transform, path, physics },
    bones: { ik: ikBones, transform: transformBones, path: pathBones },
  };
}

/**
 * Parse the bones array of a weighted MeshAttachment to compute the
 * average number of bone influences per vertex. Returns 1 for empty
 * input (so non-weighted meshes get a neutral multiplier).
 *
 * Spine bones[] layout (from spine-core VertexAttachment):
 *   [n, boneIdx0, boneIdx1, ..., n, boneIdx0, ...]
 * where n is the number of bones influencing that vertex.
 */
export function avgBoneInfluencesForMesh(bones: ReadonlyArray<number>): number {
  let totalInfluences = 0;
  let vertexCount = 0;
  let i = 0;
  while (i < bones.length) {
    const n = bones[i];
    totalInfluences += n;
    vertexCount++;
    i += 1 + n;
  }
  return vertexCount > 0 ? totalInfluences / vertexCount : 1;
}

/**
 * Count *extra* mixing entries beyond the baseline of one playing animation
 * per track: sum of each active track's `mixingFrom` chain length. The head
 * track entry itself is NOT counted, only the chain it is mixing from.
 *
 * - single track, no crossfade -> 0   (head only, no mixingFrom)
 * - crossfade A->B              -> 1  (one mixingFrom)
 * - layered N-deep crossfade    -> N-1
 *
 * Defining the cost this way lets the CI formula treat the canonical
 * "one animation playing, no crossfade" case as the zero-cost baseline,
 * matching the `constraintBones` and `meshDetails` calibration. Real CPU
 * cost in spine-core's `AnimationState.apply` scales with the number of
 * additional timeline applications a crossfade forces, which is exactly
 * the chain length beyond the head entry.
 */
export function countMixingDepth(
  state: { tracks?: ReadonlyArray<unknown> } | null | undefined,
): number {
  if (!state?.tracks) return 0;
  let depth = 0;
  for (const track of state.tracks) {
    if (track == null) continue;
    let entry = (track as { mixingFrom?: unknown }).mixingFrom as
      | { mixingFrom?: unknown }
      | null
      | undefined;
    while (entry != null) {
      depth++;
      entry = (entry as { mixingFrom?: unknown }).mixingFrom as
        | { mixingFrom?: unknown }
        | null
        | undefined;
    }
  }
  return depth;
}
