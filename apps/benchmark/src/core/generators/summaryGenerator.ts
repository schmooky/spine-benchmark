import type { Spine } from '@esotericsoftware/spine-pixi-v8';
import {
  buildImpactReportModel,
  type AnimationAnalysis,
  type ImpactReportModel,
  type ImpactSupplementalMetrics,
  type SpineAnalysisResult,
} from '../SpineAnalyzer';

interface LegacyBoneMetrics {
  totalBones: number;
  maxDepth: number;
  score?: number;
}

function createSyntheticAnalysisResult(
  spineInstance: Spine,
  boneMetrics: LegacyBoneMetrics,
  animationAnalyses: AnimationAnalysis[],
): SpineAnalysisResult {
  const sorted = [...animationAnalyses].sort((left, right) => right.overallScore - left.overallScore);
  return {
    skeletonName: spineInstance.skeleton.data.name || 'Unnamed',
    totalAnimations: spineInstance.skeleton.data.animations.length,
    totalSkins: spineInstance.skeleton.data.skins.length,
    skeleton: {
      metrics: {
        totalBones: boneMetrics.totalBones,
        maxDepth: boneMetrics.maxDepth,
        score: boneMetrics.score ?? 0,
      },
    } as SpineAnalysisResult['skeleton'],
    animations: animationAnalyses,
    globalMesh: {} as SpineAnalysisResult['globalMesh'],
    globalClipping: {} as SpineAnalysisResult['globalClipping'],
    globalBlendMode: {} as SpineAnalysisResult['globalBlendMode'],
    globalPhysics: {} as SpineAnalysisResult['globalPhysics'],
    medianScore: sorted.length > 0 ? sorted[Math.floor(sorted.length / 2)]!.overallScore : 0,
    bestAnimation: sorted[0] ?? null,
    worstAnimation: sorted[sorted.length - 1] ?? null,
    stats: {
      animationsWithPhysics: animationAnalyses.filter((a) => a.activeComponents.hasPhysics).length,
      animationsWithClipping: animationAnalyses.filter((a) => a.activeComponents.hasClipping).length,
      animationsWithBlendModes: animationAnalyses.filter((a) => a.activeComponents.hasBlendModes).length,
      animationsWithIK: animationAnalyses.filter((a) => a.activeComponents.hasIK).length,
      animationsWithTransform: animationAnalyses.filter((a) => a.activeComponents.hasTransform).length,
      animationsWithPath: animationAnalyses.filter((a) => a.activeComponents.hasPath).length,
      highVertexAnimations: animationAnalyses.filter((a) => a.meshMetrics.totalVertices > 500).length,
      poorPerformingAnimations: animationAnalyses.filter((a) => a.overallScore < 55).length,
    },
  };
}

/**
 * Creates a structured report model from benchmark analysis data.
 * This replaces the legacy HTML string generator.
 */
export function generateAnimationSummaryModel(
  spineInstance: Spine,
  boneMetrics: LegacyBoneMetrics,
  animationAnalyses: AnimationAnalysis[],
  _legacyMedianScore: number,
  supplemental?: ImpactSupplementalMetrics,
): ImpactReportModel {
  const result = createSyntheticAnalysisResult(spineInstance, boneMetrics, animationAnalyses);
  return buildImpactReportModel(result, { supplemental });
}
