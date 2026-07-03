import {
  poseImpact,
  type ImpactFeatures,
  type WalkableSkeleton,
} from "@spine-benchmark/metrics-impact-formula";
import type { Skeleton } from "@esotericsoftware/spine-pixi-v8";

/**
 * Live RI/CI + feature capture of one skeleton's current pose. All counting
 * goes through the CANONICAL pose walker in
 * @spine-benchmark/metrics-impact-formula - these captured features TRAIN the
 * fitted cost model, so they must be byte-identical to what the workbench
 * extracts at prediction time (ADR 0002). A local re-implementation here once
 * dropped every region/sequence vertex from the training set while the
 * workbench counted them - systematic train/inference skew.
 */

export interface FrameImpact {
  ri: number;
  ci: number;
  total: number;
}

/**
 * Raw formula inputs for ONE instance, captured alongside the scores so
 * fleet analysis can regress real frame cost against the features and
 * re-fit the RI/CI weights instead of trusting them. This IS the canonical
 * feature vector - the columns of the fit.
 */
export type ImpactInputs = ImpactFeatures;

export interface DetailedImpact extends FrameImpact {
  inputs: ImpactInputs;
}

export function measureFrameImpactDetailed(skeleton: Skeleton): DetailedImpact {
  const r = poseImpact(skeleton as unknown as WalkableSkeleton);
  return { ri: r.ri, ci: r.ci, total: r.total, inputs: r.features };
}

export function measureFrameImpact(skeleton: Skeleton): FrameImpact {
  const d = measureFrameImpactDetailed(skeleton);
  return { ri: d.ri, ci: d.ci, total: d.total };
}
