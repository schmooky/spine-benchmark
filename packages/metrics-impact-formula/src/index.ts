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
   * Total bones across *contributing* (active && mix > 0) constraints
   * per type. NOT mix-scaled - spine-ts does the full constraint solve
   * at any non-zero mix, so the per-bone CPU cost is independent of
   * `mix` magnitude. When provided, constraint cost uses per-bone
   * weights to capture long-chain cost that the basic per-constraint
   * formula misses.
   */
  constraintBones?: { ik: number; path: number; transform: number };

  /**
   * Extra timeline applications beyond the one-track-no-crossfade
   * baseline. Counts every active track entry including its `mixingFrom`
   * chain and subtracts 1 for the baseline animation, so:
   *
   *   - 1 track, no crossfade  -> 0  (baseline)
   *   - 1 track, A -> B fade   -> 1  (head + 1 mixingFrom = 2 applies, -1)
   *   - 2 tracks, no crossfade -> 1  (parallel layered playback)
   *   - 2 tracks, second is 3-deep -> 3
   *
   * Each extra application contributes `0.15` to CI, modelling the
   * additional `AnimationState.apply` work spine-ts performs per entry.
   */
  mixingDepth?: number;

  /**
   * Number of *active* physics constraints regardless of `mix` value.
   * Physics integration runs every frame even when `mix === 0` (only
   * the write-back to bones is skipped), so active-but-non-contributing
   * physics still costs CPU. When omitted, falls back to
   * `constraints.physics` (i.e. assumes every active physics constraint
   * is also contributing). Pair with the canonical
   * {@link activeConstraintStats} helper.
   */
  physicsActiveAll?: number;

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
 *   constraintCost = (physicsActiveAll x 0.56) + (physicsContributing x 0.14)
 *                  + (path x 0.55) + (ik x 0.35) + (transform x 0.2)
 *
 *   where physicsActiveAll falls back to physicsContributing when not
 *   provided, recovering the legacy `physics x 0.7` behaviour.
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
 *   constraintCost uses per-bone weights independent of mix magnitude
 *   (spine-ts runs the full constraint solve at any mix > 0; mix only
 *   controls the lerp factor when writing back into bones, which is a
 *   marginal cost compared to the solve):
 *     (physicsActiveAll x 0.56) + (physicsContributing x 0.14)
 *     + (pathBones x 0.275) + (ikBones x 0.175) + (transformBones x 0.10)
 *
 *   `*Bones` here are total bone counts across contributing constraints
 *   - a constraint with `mix=0.01` and a 3-bone chain pays the same
 *   per-bone cost as the same constraint with `mix=1`, matching the
 *   actual CPU work.
 *
 *   The physics split (80% structural / 20% mix-dependent) reflects that
 *   spine-ts always runs the physics integration step even when
 *   `mix === 0`; only the bone write-back depends on mix. So an active
 *   physics constraint that has been temporarily disabled by mix=0 still
 *   pays the integration cost, just not the apply cost.
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
  // Physics split: integration runs on every active constraint regardless
  // of `mix`, so `physicsActiveAll` pays the structural cost. The apply
  // step only runs at `mix > 0`, captured by `constraints.physics` (which
  // every consumer already filters via `isPhysicsConstraintContributing`).
  // When `physicsActiveAll` is absent, fall back to the contributing count
  // so legacy callers reproduce the old `physics x 0.7` weight.
  const physicsContributing = inputs.constraints.physics;
  const physicsActiveAll = inputs.physicsActiveAll ?? physicsContributing;
  const physicsCost = physicsActiveAll * 0.56 + physicsContributing * 0.14;

  // Constraint cost: use per-bone scaling when mix-scaled bone counts are
  // available, otherwise fall back to simple per-constraint weights.
  let constraintCost: number;
  if (inputs.constraintBones) {
    constraintCost =
      physicsCost +
      inputs.constraintBones.path * 0.275 +
      inputs.constraintBones.ik * 0.175 +
      inputs.constraintBones.transform * 0.10;
  } else {
    constraintCost =
      physicsCost +
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
  /** Active counts. Physics also requires non-zero `mix` (contributing). */
  active: { ik: number; transform: number; path: number; physics: number };
  /**
   * Total bones across *contributing* (active && mix > 0) constraints
   * per type, NOT mix-scaled. Spine-ts runs the full constraint solve
   * for every contributing constraint regardless of `mix` value (mix is
   * only used to lerp the result back into bones), so the CPU cost is
   * driven by chain length, not by `mix`. A 5-bone chain with `mix=0.5`
   * costs the same as the same chain with `mix=1`.
   */
  bones: { ik: number; transform: number; path: number };
  /**
   * Active physics constraint count *including* `mix === 0`. Spine-ts
   * runs the physics integration step every frame regardless of `mix`,
   * so this is the right input for the integration-side cost; the
   * mix-dependent apply cost still uses `active.physics`.
   */
  physicsActiveAll: number;
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
  // For IK/transform/path: a constraint contributes (i.e. costs CPU) iff
  // it is active AND has non-zero mix on at least one axis - spine-ts
  // early-exits at all-zero mix, but otherwise does the full solve and
  // pays per-bone CPU regardless of `mix` magnitude. So `bones` is the
  // raw bone count of contributing constraints, NOT mix-scaled.
  let ik = 0;
  let ikBones = 0;
  for (const c of skeleton.ikConstraints ?? []) {
    if (!isConstraintActive(c)) continue;
    if (ikMixScale(c) === 0) continue;
    ik++;
    ikBones += c.bones?.length ?? 1;
  }
  let transform = 0;
  let transformBones = 0;
  for (const c of skeleton.transformConstraints ?? []) {
    if (!isConstraintActive(c)) continue;
    if (transformMixScale(c) === 0) continue;
    transform++;
    transformBones += c.bones?.length ?? 1;
  }
  let path = 0;
  let pathBones = 0;
  for (const c of skeleton.pathConstraints ?? []) {
    if (!isConstraintActive(c)) continue;
    if (pathMixScale(c) === 0) continue;
    path++;
    pathBones += c.bones?.length ?? 1;
  }
  let physics = 0;
  let physicsActiveAll = 0;
  for (const c of skeleton.physicsConstraints ?? []) {
    if (!isConstraintActive(c)) continue;
    physicsActiveAll++;
    if (c.mix !== 0) physics++;
  }
  return {
    active: { ik, transform, path, physics },
    bones: { ik: ikBones, transform: transformBones, path: pathBones },
    physicsActiveAll,
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
 * Count *extra* timeline applications beyond a single playing animation.
 * Sums every active track entry plus its `mixingFrom` chain, then
 * subtracts 1 for the baseline (a single playing animation costs one
 * `AnimationState.apply` invocation, which the formula treats as free).
 *
 * - 0 active tracks            -> 0  (nothing playing)
 * - 1 track, no crossfade      -> 0  (1 apply - 1 baseline)
 * - 1 track, A -> B fade       -> 1  (head + 1 mixingFrom = 2 applies, -1)
 * - 2 tracks, no crossfade     -> 1  (parallel layered playback)
 * - 2 tracks, second is 3-deep -> 3  (1 + 3 = 4 applies, -1)
 *
 * Real CPU cost in spine-core's `AnimationState.apply` scales with the
 * total number of timeline applications - one per active track plus one
 * per `mixingFrom` entry in each chain. Subtracting the baseline keeps
 * the canonical "one animation playing, no crossfade" case at zero so
 * the enhanced CI path still matches the basic path on the calibration
 * baseline.
 */
export function countMixingDepth(
  state: { tracks?: ReadonlyArray<unknown> } | null | undefined,
): number {
  if (!state?.tracks) return 0;
  let totalApplies = 0;
  for (const track of state.tracks) {
    if (track == null) continue;
    let entry = track as { mixingFrom?: unknown } | null | undefined;
    while (entry != null) {
      totalApplies++;
      entry = (entry as { mixingFrom?: unknown }).mixingFrom as
        | { mixingFrom?: unknown }
        | null
        | undefined;
    }
  }
  return Math.max(0, totalApplies - 1);
}
