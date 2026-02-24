import type { Animation, Spine } from "@esotericsoftware/spine-pixi-v8";
import {
  analyzeMeshesForAnimation,
  analyzeGlobalMeshes,
  MeshMetrics,
  GlobalMeshAnalysis,
  analyzeClippingForAnimation,
  analyzeGlobalClipping,
  ClippingMetrics,
  GlobalClippingAnalysis,
  analyzeBlendModesForAnimation,
  analyzeGlobalBlendModes,
  BlendModeMetrics,
  GlobalBlendModeAnalysis,
  analyzeSkeletonStructure,
  SkeletonAnalysis,
  analyzePhysicsForAnimation,
  analyzeGlobalPhysics,
  ConstraintMetrics,
  GlobalPhysicsAnalysis
} from "@spine-benchmark/metrics-analyzers";
import { calculateOverallScore } from "@spine-benchmark/metrics-scoring";
import { getActiveComponentsForAnimation } from "@spine-benchmark/metrics-sampling";
import type { ActiveComponents } from "@spine-benchmark/metrics-sampling";

export interface AnimationAnalysis {
  name: string;
  duration: number;
  overallScore: number;
  meshMetrics: MeshMetrics;
  clippingMetrics: ClippingMetrics;
  blendModeMetrics: BlendModeMetrics;
  constraintMetrics: ConstraintMetrics;
  activeComponents: ActiveComponents;
}

export interface AnalysisStatistics {
  animationsWithPhysics: number;
  animationsWithClipping: number;
  animationsWithBlendModes: number;
  animationsWithIK: number;
  animationsWithTransform: number;
  animationsWithPath: number;
  highVertexAnimations: number;
  poorPerformingAnimations: number;
}

export interface SpineAnalysisResult {
  skeletonName: string;
  totalAnimations: number;
  totalSkins: number;
  skeleton: SkeletonAnalysis;
  animations: AnimationAnalysis[];
  globalMesh: GlobalMeshAnalysis;
  globalClipping: GlobalClippingAnalysis;
  globalBlendMode: GlobalBlendModeAnalysis;
  globalPhysics: GlobalPhysicsAnalysis;
  medianScore: number;
  bestAnimation: AnimationAnalysis | null;
  worstAnimation: AnimationAnalysis | null;
  stats: AnalysisStatistics;
}

/**
 * Analyze skeleton structure (common for all animations)
 * @param spineInstance - The Spine instance to analyze
 * @returns SkeletonAnalysis - Analysis of the skeleton structure
 */
export function analyzeSkeleton(spineInstance: Spine): SkeletonAnalysis {
  return analyzeSkeletonStructure(spineInstance);
}

/**
 * Analyze global data across all animations
 * @param spineInstance - The Spine instance to analyze
 * @returns Object containing all global analyses
 */
export function analyzeGlobalData(spineInstance: Spine): {
  globalMesh: GlobalMeshAnalysis;
  globalClipping: GlobalClippingAnalysis;
  globalBlendMode: GlobalBlendModeAnalysis;
  globalPhysics: GlobalPhysicsAnalysis;
} {
  return {
    globalMesh: analyzeGlobalMeshes(spineInstance),
    globalClipping: analyzeGlobalClipping(spineInstance),
    globalBlendMode: analyzeGlobalBlendModes(spineInstance),
    globalPhysics: analyzeGlobalPhysics(spineInstance)
  };
}

/**
 * Analyze a single animation
 * @param spineInstance - The Spine instance to analyze
 * @param animation - The animation to analyze
 * @returns AnimationAnalysis - Analysis of the single animation
 */
export function analyzeSingleAnimation(
  spineInstance: Spine,
  animation: Animation
): AnimationAnalysis {
  // Get active components for this animation (frame-by-frame analysis)
  const activeComponents = getActiveComponentsForAnimation(spineInstance, animation);

  // Analyze meshes for this animation
  const meshMetrics = analyzeMeshesForAnimation(spineInstance, animation, activeComponents);

  // Analyze clipping for this animation
  const clippingMetrics = analyzeClippingForAnimation(spineInstance, animation, activeComponents);

  // Analyze blend modes for this animation
  const blendModeMetrics = analyzeBlendModesForAnimation(spineInstance, animation, activeComponents);

  // Analyze constraints for this animation
  const constraintMetrics = analyzePhysicsForAnimation(spineInstance, animation, activeComponents);

  // Calculate overall performance score for this animation
  const componentScores = {
    boneScore: analyzeSkeleton(spineInstance).metrics.score, // Bone score is same for all animations
    meshScore: meshMetrics.score,
    clippingScore: clippingMetrics.score,
    blendModeScore: blendModeMetrics.score,
    constraintScore: constraintMetrics.score
  };

  const overallScore = calculateOverallScore(componentScores);

  return {
    name: animation.name,
    duration: animation.duration,
    overallScore,
    meshMetrics,
    clippingMetrics,
    blendModeMetrics,
    constraintMetrics,
    activeComponents
  };
}

/**
 * Analyze all animations in the Spine instance
 * @param spineInstance - The Spine instance to analyze
 * @returns Array of AnimationAnalysis objects
 */
export function analyzeAnimations(spineInstance: Spine): AnimationAnalysis[] {
  const animations = spineInstance.skeleton.data.animations;
  const animationAnalyses: AnimationAnalysis[] = [];

  animations.forEach((animation) => {
    animationAnalyses.push(analyzeSingleAnimation(spineInstance, animation));
  });

  return animationAnalyses;
}

/**
 * Calculate statistics from animation analyses
 * @param animationAnalyses - Array of AnimationAnalysis objects
 * @returns Statistics object
 */
export function calculateStatistics(animationAnalyses: AnimationAnalysis[]): AnalysisStatistics {
  return {
    animationsWithPhysics: animationAnalyses.filter(a => a.activeComponents.hasPhysics).length,
    animationsWithClipping: animationAnalyses.filter(a => a.activeComponents.hasClipping).length,
    animationsWithBlendModes: animationAnalyses.filter(a => a.activeComponents.hasBlendModes).length,
    animationsWithIK: animationAnalyses.filter(a => a.activeComponents.hasIK).length,
    animationsWithTransform: animationAnalyses.filter(a => a.activeComponents.hasTransform).length,
    animationsWithPath: animationAnalyses.filter(a => a.activeComponents.hasPath).length,
    highVertexAnimations: animationAnalyses.filter(a => a.meshMetrics.totalVertices > 500).length,
    poorPerformingAnimations: animationAnalyses.filter(a => a.overallScore < 55).length
  };
}

/**
 * Sort animation analyses by score
 * @param animationAnalyses - Array of AnimationAnalysis objects
 * @returns Sorted array with best and worst animations
 */
export function sortAnalyses(animationAnalyses: AnimationAnalysis[]): {
  sorted: AnimationAnalysis[];
  best: AnimationAnalysis | null;
  worst: AnimationAnalysis | null;
  medianScore: number;
} {
  // Calculate median score
  const scores = animationAnalyses.map(a => a.overallScore);
  scores.sort((a, b) => a - b);
  const medianScore = scores.length > 0
    ? scores[Math.floor(scores.length / 2)]
    : 100;

  // Find best and worst performing animations
  const sortedAnalyses = [...animationAnalyses].sort((a, b) => b.overallScore - a.overallScore);
  const bestAnimation = sortedAnalyses.length > 0 ? sortedAnalyses[0] : null;
  const worstAnimation = sortedAnalyses.length > 0 ? sortedAnalyses[sortedAnalyses.length - 1] : null;

  return {
    sorted: sortedAnalyses,
    best: bestAnimation,
    worst: worstAnimation,
    medianScore
  };
}

/**
 * Aggregate all analysis results into a single SpineAnalysisResult
 * @param spineInstance - The Spine instance that was analyzed
 * @param skeletonData - Skeleton analysis data
 * @param globalData - Global analysis data
 * @param animationData - Animation analysis data
 * @param statistics - Calculated statistics
 * @param sortedData - Sorted animation data
 * @returns Complete SpineAnalysisResult
 */
export function aggregateResults(
  spineInstance: Spine,
  skeletonData: SkeletonAnalysis,
  globalData: {
    globalMesh: GlobalMeshAnalysis;
    globalClipping: GlobalClippingAnalysis;
    globalBlendMode: GlobalBlendModeAnalysis;
    globalPhysics: GlobalPhysicsAnalysis;
  },
  animationData: AnimationAnalysis[],
  statistics: AnalysisStatistics,
  sortedData: {
    sorted: AnimationAnalysis[];
    best: AnimationAnalysis | null;
    worst: AnimationAnalysis | null;
    medianScore: number;
  }
): SpineAnalysisResult {
  return {
    skeletonName: spineInstance.skeleton.data.name || 'Unnamed',
    totalAnimations: spineInstance.skeleton.data.animations.length,
    totalSkins: spineInstance.skeleton.data.skins.length,
    skeleton: skeletonData,
    animations: animationData,
    globalMesh: globalData.globalMesh,
    globalClipping: globalData.globalClipping,
    globalBlendMode: globalData.globalBlendMode,
    globalPhysics: globalData.globalPhysics,
    medianScore: sortedData.medianScore,
    bestAnimation: sortedData.best,
    worstAnimation: sortedData.worst,
    stats: statistics
  };
}
