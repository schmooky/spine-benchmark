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
      totalAnimations: analysisResult.totalAnimations,
      totalSkins: analysisResult.totalSkins
    },
    statistics: analysisResult.stats,
    animations: analysisResult.animations.map((animation) => ({
      name: animation.name,
      duration: animation.duration,
      metrics: {
        mesh: {
          count: animation.meshMetrics.activeMeshCount,
          vertices: animation.meshMetrics.totalVertices,
          deformed: animation.meshMetrics.deformedMeshCount,
          weighted: animation.meshMetrics.weightedMeshCount
        },
        clipping: {
          masks: animation.clippingMetrics.activeMaskCount,
          vertices: animation.clippingMetrics.totalVertices,
          complex: animation.clippingMetrics.complexMasks
        },
        blendMode: {
          nonNormal: animation.blendModeMetrics.activeNonNormalCount,
          additive: animation.blendModeMetrics.activeAdditiveCount,
          multiply: animation.blendModeMetrics.activeMultiplyCount
        },
        constraints: {
          physics: animation.constraintMetrics.activePhysicsCount,
          ik: animation.constraintMetrics.activeIkCount,
          transform: animation.constraintMetrics.activeTransformCount,
          path: animation.constraintMetrics.activePathCount,
          total: animation.constraintMetrics.totalActiveConstraints
        }
      }
    }))
  };
}
