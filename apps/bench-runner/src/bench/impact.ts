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

export function measureFrameImpact(skeleton: Skeleton): FrameImpact {
  let totalVertices = 0;
  let activeClippingMasks = 0;
  let activeNonNormalBlends = 0;
  let activeMeshCount = 0;
  let weightedMeshCount = 0;
  let deformedMeshCount = 0;

  for (const slot of skeleton.drawOrder) {
    const att = slot.getAttachment();
    if (!att || !isSlotActive(slot)) continue;

    if (att instanceof ClippingAttachment) {
      activeClippingMasks++;
      continue;
    }
    if (slot.data.blendMode !== BlendMode.Normal) activeNonNormalBlends++;
    if (!(att instanceof MeshAttachment)) continue;

    activeMeshCount++;
    totalVertices += att.worldVerticesLength / 2;
    if (att.bones && att.bones.length > 0) weightedMeshCount++;
    if (slot.deform.length > 0) deformedMeshCount++;
  }

  const ri = renderingImpactCost({
    activeNonNormalBlends,
    activeClippingMasks,
    totalVertices,
  });
  const ci = computationalImpactCost({
    constraints: {
      ik: countActive(skeleton.ikConstraints),
      transform: countActive(skeleton.transformConstraints),
      path: countActive(skeleton.pathConstraints),
      physics: countActive(skeleton.physicsConstraints),
    },
    totalVertices,
    activeMeshCount,
    weightedMeshCount,
    deformedMeshCount,
  });

  return { ri, ci, total: ri + ci };
}
