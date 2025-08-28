import { Spine } from "@esotericsoftware/spine-pixi-v8";
import { 
  analyzeSkeletonStructure,
  analyzeGlobalData,
  analyzeAnimations,
  calculateStatistics,
  sortAnalyses,
  aggregateResults
} from "./analysis/performanceAnalysis";

export interface PerformanceMetrics {
  computationImpact: number; // CI ∈ [0, ∞)
  renderingImpact: number;   // RI ∈ [0, ∞)
  totalImpact: number;       // CI + RI
  performanceScore: number;  // ∈ [0, 100]
}

export interface AnimationPerformanceAnalysis {
  name: string;
  duration: number;
  metrics: PerformanceMetrics;
  frameMetrics: {
    bones: { count: number; depths: number[] };
    constraints: {
      ikChains: number[];
      transformCount: number;
      pathBonesAffected: number[];
      pathSampleSteps: number[];
      physicsCount: number;
    };
    animation: {
      activeTracksMinusBase: number;
      appliedTimelines: number;
    };
    meshes: {
      vertexCount: number;
      skinnedWeights: number;
      deformTimelines: number;
    };
    clipping: {
      attachmentTris: number;
      polyTris: number;
      transitions: number;
    };
    rendering: {
      estimatedDrawCalls: number;
      renderedTriangles: number;
      nonNormalBlendSlots: number;
    };
  };
}

export interface SpinePerformanceAnalysisResult {
  skeletonName: string;
  totalAnimations: number;
  animations: AnimationPerformanceAnalysis[];
  globalMetrics: PerformanceMetrics;
  medianScore: number;
  bestAnimation: AnimationPerformanceAnalysis | null;
  worstAnimation: AnimationPerformanceAnalysis | null;
  stats: {
    animationsWithHighCI: number; // CI > 100
    animationsWithHighRI: number; // RI > 50
    animationsWithPoorScore: number; // score < 50
  };
}

/**
 * Main SpinePerformanceAnalyzer class that analyzes Spine instances according to spec
 */
export class SpinePerformanceAnalyzer {
  /**
   * Analyzes a Spine instance and returns performance metrics
   * @param spineInstance The Spine instance to analyze
   * @returns Complete performance analysis data
   */
  static analyze(spineInstance: Spine): SpinePerformanceAnalysisResult {
    // Analyze skeleton structure
    const skeletonData = analyzeSkeletonStructure(spineInstance);

    // Analyze global data
    const globalData = analyzeGlobalData(spineInstance);

    // Analyze each animation individually with per-frame metrics
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
  static exportJSON(analysisResult: SpinePerformanceAnalysisResult): object {
    return {
      skeleton: {
        name: analysisResult.skeletonName,
        totalAnimations: analysisResult.totalAnimations
      },
      performance: {
        globalMetrics: analysisResult.globalMetrics,
        medianScore: analysisResult.medianScore,
        bestAnimation: analysisResult.bestAnimation ? {
          name: analysisResult.bestAnimation.name,
          score: analysisResult.bestAnimation.metrics.performanceScore
        } : null,
        worstAnimation: analysisResult.worstAnimation ? {
          name: analysisResult.worstAnimation.name,
          score: analysisResult.worstAnimation.metrics.performanceScore
        } : null
      },
      statistics: analysisResult.stats,
      animations: analysisResult.animations.map(a => ({
        name: a.name,
        duration: a.duration,
        metrics: a.metrics,
        frameData: a.frameMetrics
      }))
    };
  }
}