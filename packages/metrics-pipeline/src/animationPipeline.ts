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
import { getActiveComponentsForAnimation } from "@spine-benchmark/metrics-sampling";
import type { ActiveComponents } from "@spine-benchmark/metrics-sampling";

export interface AnimationAnalysis {
  name: string;
  duration: number;
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

  return {
    name: animation.name,
    duration: animation.duration,
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
    highVertexAnimations: animationAnalyses.filter(a => a.meshMetrics.totalVertices > 500).length
  };
}

/**
 * Aggregate all analysis results into a single SpineAnalysisResult
 * @param spineInstance - The Spine instance that was analyzed
 * @param skeletonData - Skeleton analysis data
 * @param globalData - Global analysis data
 * @param animationData - Animation analysis data
 * @param statistics - Calculated statistics
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
  statistics: AnalysisStatistics
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
    stats: statistics
  };
}
