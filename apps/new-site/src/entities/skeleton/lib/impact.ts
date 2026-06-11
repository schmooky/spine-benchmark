import {
  renderingImpactCost,
  computationalImpactCost,
} from "@spine-benchmark/metrics-impact-formula";
import {
  BlendMode,
  ClippingAttachment,
  MeshAttachment,
  MixBlend,
  MixDirection,
  Physics,
  type Skeleton,
  type Slot,
  type Spine,
} from "@esotericsoftware/spine-pixi-v8";

/**
 * Live per-frame impact measurement. Walks the skeleton's current pose and
 * feeds the active counts into the canonical RI/CI formulas from
 * @spine-benchmark/metrics-impact-formula - NO scoring constants live here
 * (the check-no-duplicate-impact-formulas hook guards this). Input
 * definitions mirror the pixi-crawler / heatmap: only currently visible
 * slots count.
 */

export interface FrameImpact {
  ri: number;
  ci: number;
  total: number;
}

/** Same "is this slot currently rendering?" predicate the crawler uses. */
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

const SAMPLE_FPS = 30;
const MAX_SAMPLES = 240;

/**
 * Worst-frame impact per animation: poses the skeleton through each
 * animation at SAMPLE_FPS (capped) and keeps the costliest frame. Attachment,
 * color, deform and draw-order timelines all land through Animation.apply,
 * so the numbers track what the animation can actually show. The live pose
 * is restored afterwards; runs synchronously between renders so nothing
 * flickers on stage.
 */
export function measureAnimationMaxImpacts(
  spine: Spine,
): Map<string, FrameImpact> {
  const skeleton = spine.skeleton;
  const out = new Map<string, FrameImpact>();

  const resetPose = () => {
    skeleton.setToSetupPose();
    // setToSetupPose keeps deform arrays when the attachment is unchanged -
    // clear them so one animation's deform can't leak into the next sample
    for (const slot of skeleton.slots) slot.deform.length = 0;
  };

  for (const anim of skeleton.data.animations) {
    const steps = Math.min(
      MAX_SAMPLES,
      Math.max(1, Math.ceil(anim.duration * SAMPLE_FPS)),
    );
    let max: FrameImpact = { ri: 0, ci: 0, total: -1 };
    for (let i = 0; i <= steps; i++) {
      const t = anim.duration === 0 ? 0 : (anim.duration * i) / steps;
      resetPose();
      anim.apply(skeleton, t, t, false, [], 1, MixBlend.setup, MixDirection.mixIn);
      const frame = measureFrameImpact(skeleton);
      if (frame.total > max.total) max = frame;
    }
    out.set(anim.name, max);
  }

  // restore the live pose driven by the AnimationState
  resetPose();
  spine.state.apply(skeleton);
  skeleton.updateWorldTransform(Physics.update);
  return out;
}
