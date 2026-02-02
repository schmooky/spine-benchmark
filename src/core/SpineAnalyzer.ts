import { Spine } from "@esotericsoftware/spine-pixi-v8";
import { MeshMetrics, GlobalMeshAnalysis } from "./analyzers/meshAnalyzer";
import { ClippingMetrics, GlobalClippingAnalysis } from "./analyzers/clippingAnalyzer";
import { BlendModeMetrics, GlobalBlendModeAnalysis } from "./analyzers/blendModeAnalyzer";
import { ConstraintMetrics, GlobalPhysicsAnalysis } from "./analyzers/physicsAnalyzer";
import { SkeletonAnalysis } from "./analyzers/skeletonAnalyzer";
import {
  analyzeSkeleton,
  analyzeGlobalData,
  analyzeAnimations,
  calculateStatistics,
  sortAnalyses,
  aggregateResults,
} from "./analysis/animationAnalysis";
import type { ActiveComponents } from "./analysis/animationAnalysis";

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
 * Main SpineAnalyzer class that analyzes Spine instances and returns comprehensive data
 */
export class SpineAnalyzer {
  /**
   * Analyzes a Spine instance and returns a comprehensive data object
   * @param spineInstance The Spine instance to analyze
   * @returns Complete analysis data
   */
  static analyze(spineInstance: Spine): SpineAnalysisResult {
    // Analyze skeleton structure (common for all animations)
    const skeletonData = analyzeSkeleton(spineInstance);

    // Analyze global data
    const globalData = analyzeGlobalData(spineInstance);

    // Analyze each animation individually
    const animationData = analyzeAnimations(spineInstance);

    // Calculate statistics
    const statistics = calculateStatistics(animationData);

    // Sort animations and calculate median score
    const sortedData = sortAnalyses(animationData);

    // Aggregate all results
    return aggregateResults(
      spineInstance,
      skeletonData,
      globalData,
      animationData,
      statistics,
      sortedData
    );
  }

  /**
   * Exports analysis data as JSON
   * @param analysisResult The analysis result to export
   * @returns JSON-serializable analysis data
   */
  static exportJSON(analysisResult: SpineAnalysisResult): object {
    return {
      skeleton: {
        name: analysisResult.skeletonName,
        bones: analysisResult.skeleton.metrics.totalBones,
        maxDepth: analysisResult.skeleton.metrics.maxDepth,
        score: analysisResult.skeleton.metrics.score,
        totalAnimations: analysisResult.totalAnimations,
        totalSkins: analysisResult.totalSkins
      },
      performance: {
        medianScore: analysisResult.medianScore,
        bestAnimation: analysisResult.bestAnimation ? {
          name: analysisResult.bestAnimation.name,
          score: analysisResult.bestAnimation.overallScore
        } : null,
        worstAnimation: analysisResult.worstAnimation ? {
          name: analysisResult.worstAnimation.name,
          score: analysisResult.worstAnimation.overallScore
        } : null
      },
      statistics: analysisResult.stats,
      animations: analysisResult.animations.map(a => ({
        name: a.name,
        duration: a.duration,
        score: a.overallScore,
        metrics: {
          mesh: {
            count: a.meshMetrics.activeMeshCount,
            vertices: a.meshMetrics.totalVertices,
            deformed: a.meshMetrics.deformedMeshCount,
            weighted: a.meshMetrics.weightedMeshCount,
            score: a.meshMetrics.score
          },
          clipping: {
            masks: a.clippingMetrics.activeMaskCount,
            vertices: a.clippingMetrics.totalVertices,
            complex: a.clippingMetrics.complexMasks,
            score: a.clippingMetrics.score
          },
          blendMode: {
            nonNormal: a.blendModeMetrics.activeNonNormalCount,
            additive: a.blendModeMetrics.activeAdditiveCount,
            multiply: a.blendModeMetrics.activeMultiplyCount,
            score: a.blendModeMetrics.score
          },
          constraints: {
            physics: a.constraintMetrics.activePhysicsCount,
            ik: a.constraintMetrics.activeIkCount,
            transform: a.constraintMetrics.activeTransformCount,
            path: a.constraintMetrics.activePathCount,
            total: a.constraintMetrics.totalActiveConstraints,
            score: a.constraintMetrics.score
          }
        }
      }))
    };
  }
}