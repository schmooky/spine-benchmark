/**
 * Live feature grading (thesis #4). Static skeleton parsing counts EVERY
 * attachment in the skin, over-reading a complex spine's real cost by ~150x
 * (e.g. 1268 blend slots statically vs ~24 active in any live pose). The only
 * valid grade walks the ANIMATED skeleton over its timeline and takes the
 * active counts - which is exactly what the runner records live. This is that,
 * as a reusable offline sampler.
 *
 * The counting itself lives in the CANONICAL walker
 * (@spine-benchmark/metrics-impact-formula extractPoseFeatures) - shared with
 * the workbench, the bench-runner trainer and the CLI, so grades here are
 * byte-identical to what the fitted model trains on and predicts from.
 */
import {
  Physics,
  type Skeleton,
  type Spine,
  type TrackEntry,
} from "@esotericsoftware/spine-pixi-v8";
import {
  extractPoseFeatures as walkPose,
  FEATURE_KEYS,
  type ImpactFeatures,
  type WalkableSkeleton,
} from "@spine-benchmark/metrics-impact-formula";

/** Active-pose feature counts for the skeleton's CURRENT frame. */
export function extractPoseFeatures(skeleton: Skeleton): ImpactFeatures {
  return walkPose(skeleton as unknown as WalkableSkeleton);
}

export interface TimelineGrade {
  /** worst-case (max) of each feature across the timeline - the grade to use. */
  peak: ImpactFeatures;
  /** time-averaged features. */
  mean: ImpactFeatures;
  samples: number;
}

/**
 * Pose each of the spine's animations across its timeline (endpoint
 * INCLUSIVE - the final keyframe is a real pose an animator keyed) and sample
 * the live features, returning the peak (worst-case pose) and mean.
 * `sampleRate` is samples/second (default 20).
 *
 * The pose is reset to setup (deform cleared) between animations so one
 * animation's attachment swaps/deforms can't inflate the next one's counts,
 * and the caller's track-0 entry (animation, time, loop) is restored on exit.
 */
export function gradeOverTimeline(spine: Spine, sampleRate = 20): TimelineGrade {
  const { state, skeleton } = spine;
  const step = 1 / sampleRate;
  const peak = { ...zero() };
  const sum = { ...zero() };
  let samples = 0;

  // snapshot the caller's track 0 so the "nothing animates" contract of the
  // surrounding app survives this pass
  const prev: TrackEntry | null = state.getCurrent(0);
  const prevAnim = prev?.animation?.name ?? null;
  const prevTime = prev?.trackTime ?? 0;
  const prevLoop = prev?.loop ?? false;

  const resetPose = () => {
    skeleton.setToSetupPose();
    // setToSetupPose keeps deform arrays when the attachment is unchanged
    for (const slot of skeleton.slots) slot.deform.length = 0;
  };

  const anims = skeleton.data.animations;
  const list = anims.length ? anims : [{ name: "", duration: 0.5 }];
  for (const anim of list) {
    resetPose();
    if (anim.name) state.setAnimation(0, anim.name, false);
    const dur = Math.max(step, anim.duration || 0.5);
    const steps = Math.max(1, Math.round(dur / step));
    for (let i = 0; i <= steps; i++) {
      state.update(i === 0 ? 0 : step);
      state.apply(skeleton);
      skeleton.update(step);
      skeleton.updateWorldTransform(Physics.update);
      const f = extractPoseFeatures(skeleton);
      for (const k of FEATURE_KEYS) {
        peak[k] = Math.max(peak[k], f[k]);
        sum[k] += f[k];
      }
      samples++;
    }
  }

  // restore the caller's state: setup pose, then the prior track entry
  resetPose();
  if (prevAnim) {
    const entry = state.setAnimation(0, prevAnim, prevLoop);
    entry.trackTime = prevTime;
  } else {
    state.setEmptyAnimation(0, 0);
  }
  state.apply(skeleton);
  skeleton.updateWorldTransform(Physics.update);

  const mean = { ...zero() };
  if (samples > 0) for (const k of FEATURE_KEYS) mean[k] = sum[k] / samples;
  return { peak, mean, samples };
}

function zero(): ImpactFeatures {
  return {
    vertices: 0, nonNormalBlends: 0, clippingMasks: 0, meshes: 0, weightedMeshes: 0,
    deformedMeshes: 0, ik: 0, transform: 0, path: 0, physics: 0, drawCallEst: 0,
    coveredKpx: 0, overdrawFactor: 1,
  };
}
