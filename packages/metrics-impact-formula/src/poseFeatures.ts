/**
 * THE canonical pose-feature walker (ADR 0001 extended to formula INPUTS).
 *
 * Every path that turns a posed skeleton into an {@link ImpactFeatures}
 * vector MUST call this walker - the hosted benchmark, the bench-runner
 * feature capture that TRAINS the fitted cost model, the offline sampler, the
 * CLI and the watcher sidecar. Before this module existed the walk was copied
 * four times and the copies drifted (three different drawCallEst definitions;
 * two copies silently dropped every non-mesh vertex, so the model was trained
 * on features where a region-only skeleton scored 0 vertices and then applied
 * on features where it scored 4/slot - systematic train/inference skew).
 *
 * The skeleton is DUCK-TYPED (no spine-* dependency) so this package stays a
 * zero-dependency leaf that even the npm-shipped crawler can import. The
 * structural shapes below are stable across spine-core 4.x.
 *
 * Canonical semantics (the parity tests in poseFeatures.test.ts pin these):
 * - a slot is active when `color.a > 0` and its bone is active;
 * - ClippingAttachment counts as a mask and nothing else;
 * - only RENDERABLE attachments (mesh or region quad) contribute vertices,
 *   non-normal blends and draw-call estimation - bounding boxes, paths and
 *   points render nothing and never affect batching;
 * - a MeshAttachment contributes worldVerticesLength/2 vertices;
 * - a RegionAttachment (including sequence-driven frames - the active frame
 *   is just a different region on the same fixed quad) contributes exactly 4;
 * - drawCallEst starts at the first renderable with an atlas page and breaks
 *   on page identity change OR blend-mode change (mirrors pixi batching);
 *   renderables with no page yet (unassigned sequence) don't break batches.
 */
import {
  computationalImpactCost,
  renderingImpactCost,
  type ComputationalWeights,
  type ImpactFeatures,
  type RenderingWeights,
} from "./index.js";

/** spine-core `BlendMode.Normal`. Duck-typing can't import the enum; the
 * numeric value is part of the spine binary/json format and stable. */
const BLEND_NORMAL = 0;

export interface WalkableConstraint {
  active: boolean;
}

export interface WalkableSlot {
  color: { a: number };
  bone: { active: boolean };
  deform: { length: number };
  data: { blendMode: number };
  getAttachment(): unknown;
}

/** The structural subset of a spine-core `Skeleton` the walker reads. A real
 * `Skeleton` (spine-core, spine-pixi-v8) satisfies this as-is. */
export interface WalkableSkeleton {
  drawOrder: readonly WalkableSlot[];
  ikConstraints: readonly WalkableConstraint[];
  transformConstraints: readonly WalkableConstraint[];
  pathConstraints: readonly WalkableConstraint[];
  /** absent on spine-core < 4.2 */
  physicsConstraints?: readonly WalkableConstraint[];
}

/** Structural attachment probe (see module doc for the discrimination). */
interface AttShape {
  worldVerticesLength?: number;
  triangles?: unknown;
  endSlot?: unknown;
  region?: { page?: unknown } | null;
  bones?: { length: number } | null;
}

/** ClippingAttachment is the only attachment with an `endSlot`. */
function isClipping(a: AttShape): boolean {
  return "endSlot" in a;
}

/** MeshAttachment: the only VertexAttachment that carries triangles. */
function isMesh(a: AttShape): boolean {
  return typeof a.worldVerticesLength === "number" && Array.isArray(a.triangles);
}

/** RegionAttachment: has a `region` but is not a VertexAttachment. (Bounding
 * boxes/paths have worldVerticesLength; points have neither field.) */
function isRegion(a: AttShape): boolean {
  return !("worldVerticesLength" in a) && "region" in a;
}

function countActive(cs: readonly WalkableConstraint[] | undefined): number {
  if (!cs) return 0;
  let n = 0;
  for (const c of cs) if (c.active) n++;
  return n;
}

export interface PoseCoverage {
  /** rasterized coverage, thousands of px. */
  coveredKpx: number;
  /** mean overdraw depth over the covered region (>= 1). */
  overdrawFactor: number;
}

/**
 * Walk the skeleton's CURRENT pose into the canonical feature vector.
 * `coverage` is the fill term when a caller has measured/estimated it;
 * defaults to 0 kpx / factor 1 (formula weight 0 keeps legacy behavior).
 */
export function extractPoseFeatures(
  skeleton: WalkableSkeleton,
  coverage?: PoseCoverage,
): ImpactFeatures {
  let vertices = 0;
  let clippingMasks = 0;
  let nonNormalBlends = 0;
  let meshes = 0;
  let weightedMeshes = 0;
  let deformedMeshes = 0;
  let drawCallEst = 0;
  let prevPage: unknown = null;
  let prevBlend = -1;

  for (const slot of skeleton.drawOrder) {
    const att = slot.getAttachment() as AttShape | null;
    if (!att) continue;
    if (slot.color.a <= 0 || !slot.bone.active) continue;

    if (isClipping(att)) {
      clippingMasks++;
      continue;
    }

    const mesh = isMesh(att);
    if (!mesh && !isRegion(att)) continue; // renders nothing

    if (slot.data.blendMode !== BLEND_NORMAL) nonNormalBlends++;

    const page = att.region?.page ?? null;
    if (page != null) {
      const blend = slot.data.blendMode;
      if (drawCallEst === 0 || page !== prevPage || blend !== prevBlend) drawCallEst++;
      prevPage = page;
      prevBlend = blend;
    }

    if (mesh) {
      meshes++;
      vertices += (att.worldVerticesLength as number) / 2;
      if (att.bones && att.bones.length > 0) weightedMeshes++;
      if (slot.deform.length > 0) deformedMeshes++;
    } else {
      vertices += 4; // region/sequence quad
    }
  }

  return {
    vertices,
    nonNormalBlends,
    clippingMasks,
    meshes,
    weightedMeshes,
    deformedMeshes,
    ik: countActive(skeleton.ikConstraints),
    transform: countActive(skeleton.transformConstraints),
    path: countActive(skeleton.pathConstraints),
    physics: countActive(skeleton.physicsConstraints),
    drawCallEst,
    coveredKpx: coverage?.coveredKpx ?? 0,
    overdrawFactor: coverage?.overdrawFactor ?? 1,
  };
}

export interface PoseImpact {
  ri: number;
  ci: number;
  total: number;
  /** the canonical feature vector the scores were computed from. */
  features: ImpactFeatures;
}

/**
 * Features + RI/CI of the current pose through the canonical formulas. The
 * single entry point for every "score this pose" call site.
 */
export function poseImpact(
  skeleton: WalkableSkeleton,
  coverage?: PoseCoverage,
  weights?: { rendering?: RenderingWeights; computational?: ComputationalWeights },
): PoseImpact {
  const f = extractPoseFeatures(skeleton, coverage);
  const ri = renderingImpactCost(
    {
      activeNonNormalBlends: f.nonNormalBlends,
      activeClippingMasks: f.clippingMasks,
      totalVertices: f.vertices,
      coveredKpx: f.coveredKpx,
      overdrawFactor: f.overdrawFactor,
    },
    weights?.rendering,
  );
  const ci = computationalImpactCost(
    {
      constraints: { ik: f.ik, transform: f.transform, path: f.path, physics: f.physics },
      totalVertices: f.vertices,
      activeMeshCount: f.meshes,
      weightedMeshCount: f.weightedMeshes,
      deformedMeshCount: f.deformedMeshes,
    },
    weights?.computational,
  );
  return { ri, ci, total: ri + ci, features: f };
}
