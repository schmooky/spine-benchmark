import {
  estimatePoseCoverage,
  extractPoseFeatures,
  poseImpact,
  type ImpactFeatures,
  type PoseCoverage,
  type WalkableSkeleton,
} from "@spine-benchmark/metrics-impact-formula";
import {
  MixBlend,
  MixDirection,
  Physics,
  type Skeleton,
  type Spine,
} from "@esotericsoftware/spine-pixi-v8";

/**
 * Live per-frame impact measurement. All counting goes through the CANONICAL
 * pose walker in @spine-benchmark/metrics-impact-formula (extractPoseFeatures/
 * poseImpact) - the same implementation the bench-runner trainer, the offline
 * sampler and the CLI use, so the features the fitted model was TRAINED on are
 * byte-identical to the ones it is applied to here. Never re-implement the
 * walk locally; that is exactly how the region-vertex and drawCallEst drift
 * bugs happened.
 */

export interface FrameImpact {
  ri: number;
  ci: number;
  total: number;
}

export function measureFrameImpact(skeleton: Skeleton): FrameImpact {
  const r = poseImpact(skeleton as unknown as WalkableSkeleton);
  return { ri: r.ri, ci: r.ci, total: r.total };
}

/**
 * The canonical per-instance feature vector for the fitted ms cost model.
 * Coverage/overdraw default to 0/1 here; pass a measured/estimated
 * {@link PoseCoverage} to fill the fill-cost term.
 */
export function measureFrameFeatures(
  skeleton: Skeleton,
  coverage?: PoseCoverage,
): ImpactFeatures {
  return extractPoseFeatures(skeleton as unknown as WalkableSkeleton, coverage);
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

const CURVE_FPS = 15;
const CURVE_MAX_SAMPLES = 120;

export interface AnimationCostSample {
  /** timeline position, seconds. */
  t: number;
  gpuMs: number;
  cpuMs: number;
  totalMs: number;
}

export interface AnimationCostCurve {
  /** predicted ms across the timeline (endpoint inclusive). */
  samples: AnimationCostSample[];
  /** the costliest sampled moment. */
  peak: AnimationCostSample;
  avgGpuMs: number;
  avgCpuMs: number;
}

/**
 * ms(t) for every animation on the SELECTED device: pose the skeleton through
 * each timeline, extract the canonical features + geometric coverage per pose
 * (world transforms updated so coverage tracks the real silhouette), and run
 * the caller's predictor (the fitted per-family model). `coverageScale` maps
 * skeleton-local px onto the target device's screen - the stated "rendered at
 * N% of screen height" assumption. The live pose is restored afterwards.
 */
export function measureAnimationCostCurves(
  spine: Spine,
  predict: (features: ImpactFeatures) => { gpuMs: number; cpuMs: number },
  coverageScale: number,
): Map<string, AnimationCostCurve> {
  const skeleton = spine.skeleton;
  const out = new Map<string, AnimationCostCurve>();

  const resetPose = () => {
    skeleton.setToSetupPose();
    for (const slot of skeleton.slots) slot.deform.length = 0;
  };

  for (const anim of skeleton.data.animations) {
    const steps = Math.min(
      CURVE_MAX_SAMPLES,
      Math.max(1, Math.ceil(anim.duration * CURVE_FPS)),
    );
    const samples: AnimationCostSample[] = [];
    let peak: AnimationCostSample = { t: 0, gpuMs: 0, cpuMs: 0, totalMs: -1 };
    let sumGpu = 0;
    let sumCpu = 0;
    for (let i = 0; i <= steps; i++) {
      const t = anim.duration === 0 ? 0 : (anim.duration * i) / steps;
      resetPose();
      anim.apply(skeleton, t, t, false, [], 1, MixBlend.setup, MixDirection.mixIn);
      skeleton.updateWorldTransform(Physics.update);
      const walkable = skeleton as unknown as WalkableSkeleton;
      const features = extractPoseFeatures(
        walkable,
        estimatePoseCoverage(walkable, { scale: coverageScale, gridSize: 32 }),
      );
      const { gpuMs, cpuMs } = predict(features);
      const sample: AnimationCostSample = { t, gpuMs, cpuMs, totalMs: gpuMs + cpuMs };
      samples.push(sample);
      sumGpu += gpuMs;
      sumCpu += cpuMs;
      if (sample.totalMs > peak.totalMs) peak = sample;
    }
    out.set(anim.name, {
      samples,
      peak,
      avgGpuMs: sumGpu / samples.length,
      avgCpuMs: sumCpu / samples.length,
    });
  }

  resetPose();
  spine.state.apply(skeleton);
  skeleton.updateWorldTransform(Physics.update);
  return out;
}
