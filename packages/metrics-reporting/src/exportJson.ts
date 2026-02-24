import type { SpineAnalysisResult } from '@spine-benchmark/metrics-pipeline';

/**
 * Converts a Spine analysis result into a stable JSON-serializable payload.
 */
export function exportAnalysisJson(analysisResult: SpineAnalysisResult): object {
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
    animations: analysisResult.animations.map((animation) => ({
      name: animation.name,
      duration: animation.duration,
      score: animation.overallScore,
      metrics: {
        mesh: {
          count: animation.meshMetrics.activeMeshCount,
          vertices: animation.meshMetrics.totalVertices,
          deformed: animation.meshMetrics.deformedMeshCount,
          weighted: animation.meshMetrics.weightedMeshCount,
          score: animation.meshMetrics.score
        },
        clipping: {
          masks: animation.clippingMetrics.activeMaskCount,
          vertices: animation.clippingMetrics.totalVertices,
          complex: animation.clippingMetrics.complexMasks,
          score: animation.clippingMetrics.score
        },
        blendMode: {
          nonNormal: animation.blendModeMetrics.activeNonNormalCount,
          additive: animation.blendModeMetrics.activeAdditiveCount,
          multiply: animation.blendModeMetrics.activeMultiplyCount,
          score: animation.blendModeMetrics.score
        },
        constraints: {
          physics: animation.constraintMetrics.activePhysicsCount,
          ik: animation.constraintMetrics.activeIkCount,
          transform: animation.constraintMetrics.activeTransformCount,
          path: animation.constraintMetrics.activePathCount,
          total: animation.constraintMetrics.totalActiveConstraints,
          score: animation.constraintMetrics.score
        }
      }
    }))
  };
}
