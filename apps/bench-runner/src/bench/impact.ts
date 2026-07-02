import {
  renderingImpactCost,
  computationalImpactCost,
} from "@spine-benchmark/metrics-impact-formula";
import {
  BlendMode,
  ClippingAttachment,
  MeshAttachment,
  type Skeleton,
  type Slot,
} from "@esotericsoftware/spine-pixi-v8";

/**
 * Live RI/CI of one skeleton's current pose. Same input definitions as the
 * pixi-crawler and the workbench; the math itself comes from the canonical
 * formula package - never copy those constants here.
 */

export interface FrameImpact {
  ri: number;
  ci: number;
  total: number;
}

/**
 * Raw formula inputs for ONE instance, captured alongside the scores so
 * fleet analysis can regress real frame cost against the features and
 * re-fit the RI/CI weights instead of trusting them.
 */
export interface ImpactInputs {
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
  /** Classic page+blend batching estimate for one instance. */
  drawCallEst: number;
  /** Rasterized coverage (thousands of px, local space) - the missing fill term.
   * Measured per scene (not per frame) via gpu-timing sampleCoverage; 0 when
   * not measured. */
  coveredKpx?: number;
  /** Mean overdraw depth over the covered region (>= 1); 1 when not measured. */
  overdrawFactor?: number;
}

export interface DetailedImpact extends FrameImpact {
  inputs: ImpactInputs;
}

function isSlotActive(slot: Slot): boolean {
  if (slot.color.a <= 0) return false;
  if (!slot.bone.active) return false;
  return true;
}

function countActive(constraints: ReadonlyArray<{ active: boolean }>): number {
  let n = 0;
  for (const c of constraints) if (c.active) n++;
  return n;
}

/** Atlas page of a renderable attachment, for the draw-call estimate. */
function pageOf(att: unknown): string | null {
  const region = (att as { region?: { page?: { name?: string } } }).region;
  const name = region?.page?.name;
  return typeof name === "string" ? name : null;
}

export function measureFrameImpactDetailed(skeleton: Skeleton): DetailedImpact {
  let totalVertices = 0;
  let activeClippingMasks = 0;
  let activeNonNormalBlends = 0;
  let activeMeshCount = 0;
  let weightedMeshCount = 0;
  let deformedMeshCount = 0;
  let drawCallEst = 0;
  let prevPage: string | null = null;
  let prevBlend = -1;

  for (const slot of skeleton.drawOrder) {
    const att = slot.getAttachment();
    if (!att || !isSlotActive(slot)) continue;

    if (att instanceof ClippingAttachment) {
      activeClippingMasks++;
      continue;
    }
    if (slot.data.blendMode !== BlendMode.Normal) activeNonNormalBlends++;

    const page = pageOf(att);
    if (page != null) {
      const blend: number = slot.data.blendMode;
      if (drawCallEst === 0 || page !== prevPage || blend !== prevBlend) {
        drawCallEst++;
      }
      prevPage = page;
      prevBlend = blend;
    }

    if (!(att instanceof MeshAttachment)) continue;
    activeMeshCount++;
    totalVertices += att.worldVerticesLength / 2;
    if (att.bones && att.bones.length > 0) weightedMeshCount++;
    if (slot.deform.length > 0) deformedMeshCount++;
  }

  const ik = countActive(skeleton.ikConstraints);
  const transform = countActive(skeleton.transformConstraints);
  const path = countActive(skeleton.pathConstraints);
  const physics = countActive(skeleton.physicsConstraints);

  const ri = renderingImpactCost({
    activeNonNormalBlends,
    activeClippingMasks,
    totalVertices,
  });
  const ci = computationalImpactCost({
    constraints: { ik, transform, path, physics },
    totalVertices,
    activeMeshCount,
    weightedMeshCount,
    deformedMeshCount,
  });

  return {
    ri,
    ci,
    total: ri + ci,
    inputs: {
      vertices: totalVertices,
      nonNormalBlends: activeNonNormalBlends,
      clippingMasks: activeClippingMasks,
      meshes: activeMeshCount,
      weightedMeshes: weightedMeshCount,
      deformedMeshes: deformedMeshCount,
      ik,
      transform,
      path,
      physics,
      drawCallEst,
    },
  };
}

export function measureFrameImpact(skeleton: Skeleton): FrameImpact {
  const d = measureFrameImpactDetailed(skeleton);
  return { ri: d.ri, ci: d.ci, total: d.total };
}
