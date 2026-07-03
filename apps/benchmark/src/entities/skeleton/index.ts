export { useSkeletonStore } from "./model/store";
export type { SkeletonStatus, SkeletonMeta } from "./model/store";
export { SpineLoader } from "./lib/spine-loader";
export { MaterializeFilter } from "./lib/materialize-filter";
export {
  drawBones,
  makeMeshDraw,
  listMeshAttachments,
  type MeshEntry,
} from "./lib/overlays";
export {
  analyzeAnimations,
  type AnimationInfo,
  type BoneHeatRow,
} from "./lib/animation-analysis";
export {
  measureFrameImpact,
  measureFrameFeatures,
  measureAnimationMaxImpacts,
  measureAnimationCostCurves,
  type AnimationCostCurve,
  type AnimationCostSample,
  type FrameImpact,
} from "./lib/impact";
export { measureRenderCost, type RenderCost } from "./lib/measure-cost";
export {
  analyzeDrawCalls,
  type DrawCallAnalysis,
  type DrawBatch,
  type BreakReason,
} from "./lib/drawcalls";
// Live warm-up grading (thesis #4): grade a spine from its ANIMATED pose over
// the timeline (peak/mean), not from static skin counts which over-read ~150x.
export { gradeOverTimeline, extractPoseFeatures, type TimelineGrade } from "@spine-benchmark/metrics-sampling";
