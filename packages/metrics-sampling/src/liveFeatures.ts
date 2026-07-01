/**
 * Live feature grading (thesis #4). Static skeleton parsing counts EVERY
 * attachment in the skin, over-reading a complex spine's real cost by ~150x
 * (e.g. 1268 blend slots statically vs ~24 active in any live pose). The only
 * valid grade walks the ANIMATED skeleton over its timeline and takes the
 * active counts - which is exactly what the runner records live. This is that,
 * as a reusable offline sampler over a warm-up pass.
 */
import {
  BlendMode,
  ClippingAttachment,
  MeshAttachment,
  Physics,
  type Skeleton,
  type Slot,
  type Spine,
} from "@esotericsoftware/spine-pixi-v8";
import type { ImpactFeatures } from "@spine-benchmark/metrics-impact-formula";

function isActive(slot: Slot): boolean {
  return slot.color.a > 0 && slot.bone.active;
}

function countActive(cs: ReadonlyArray<{ active: boolean }>): number {
  let n = 0;
  for (const c of cs) if (c.active) n++;
  return n;
}

/** Active-pose feature counts for the skeleton's CURRENT frame. */
export function extractPoseFeatures(skeleton: Skeleton): ImpactFeatures {
  let vertices = 0;
  let clippingMasks = 0;
  let nonNormalBlends = 0;
  let meshes = 0;
  let weightedMeshes = 0;
  let deformedMeshes = 0;
  let drawCallEst = 0;
  let prevPage: unknown = null;

  for (const slot of skeleton.drawOrder) {
    const att = slot.getAttachment();
    if (!att || !isActive(slot)) continue;
    if (att instanceof ClippingAttachment) {
      clippingMasks++;
      continue;
    }
    if (slot.data.blendMode !== BlendMode.Normal) nonNormalBlends++;
    const page = (att as { region?: { page?: unknown } }).region?.page ?? null;
    if (page !== prevPage) {
      drawCallEst++;
      prevPage = page;
    }
    if (!(att instanceof MeshAttachment)) continue;
    meshes++;
    vertices += att.worldVerticesLength / 2;
    if (att.bones && att.bones.length > 0) weightedMeshes++;
    if (slot.deform.length > 0) deformedMeshes++;
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
    coveredKpx: 0,
    overdrawFactor: 1,
  };
}

export interface TimelineGrade {
  /** worst-case (max) of each feature across the timeline - the grade to use. */
  peak: ImpactFeatures;
  /** time-averaged features. */
  mean: ImpactFeatures;
  samples: number;
}

const KEYS: (keyof ImpactFeatures)[] = [
  "vertices", "nonNormalBlends", "clippingMasks", "meshes", "weightedMeshes",
  "deformedMeshes", "ik", "transform", "path", "physics", "drawCallEst",
  "coveredKpx", "overdrawFactor",
];

/**
 * Play each of the spine's animations and sample the live features across the
 * timeline, returning the peak (worst-case pose) and mean. `sampleRate` is
 * samples/second (default 20). Restores the spine's prior animation state.
 */
export function gradeOverTimeline(spine: Spine, sampleRate = 20): TimelineGrade {
  const { state, skeleton } = spine;
  const step = 1 / sampleRate;
  const peak = { ...zero() };
  const sum = { ...zero() };
  let samples = 0;

  const anims = skeleton.data.animations;
  const list = anims.length ? anims : [{ name: "", duration: 0.5 }];
  for (const anim of list) {
    if (anim.name) state.setAnimation(0, anim.name, false);
    const dur = Math.max(step, anim.duration || 0.5);
    for (let t = 0; t <= dur + 1e-6; t += step) {
      state.update(t === 0 ? 0 : step);
      state.apply(skeleton);
      skeleton.update(step);
      skeleton.updateWorldTransform(Physics.update);
      const f = extractPoseFeatures(skeleton);
      for (const k of KEYS) {
        peak[k] = Math.max(peak[k], f[k]);
        sum[k] += f[k];
      }
      samples++;
    }
  }

  const mean = { ...zero() };
  if (samples > 0) for (const k of KEYS) mean[k] = sum[k] / samples;
  return { peak, mean, samples };
}

function zero(): ImpactFeatures {
  return {
    vertices: 0, nonNormalBlends: 0, clippingMasks: 0, meshes: 0, weightedMeshes: 0,
    deformedMeshes: 0, ik: 0, transform: 0, path: 0, physics: 0, drawCallEst: 0,
    coveredKpx: 0, overdrawFactor: 1,
  };
}
