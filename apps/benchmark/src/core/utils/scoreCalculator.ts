import {
  classifyImpactLevel,
  computationalImpactCost,
  type ImpactLevel,
  renderingImpactCost,
} from '@spine-benchmark/metrics-impact-formula';
import type { AnimationAnalysis } from '../SpineAnalyzer';

/**
 * Impact result used for rendering/computational impact display.
 *
 * The level + bracket math comes from `@spine-benchmark/metrics-impact-formula`,
 * the canonical scoring package shared with the offline pipeline and the
 * live runtime crawler. Only the color palette is owned here.
 */
export interface ImpactResult {
  level: ImpactLevel;
  cost: number;
  color: string;
}

const IMPACT_COLOR: Record<ImpactLevel, string> = {
  minimal: '#34D399',
  low: '#A3E635',
  moderate: '#FBBF24',
  high: '#FB923C',
  veryHigh: '#F87171',
};

/**
 * Converts a raw cost number into an impact level with color.
 */
export function getImpactFromCost(cost: number): ImpactResult {
  const level = classifyImpactLevel(cost);
  return { level, cost, color: IMPACT_COLOR[level] };
}

/**
 * Returns the CSS class name for an impact badge
 */
export function getImpactBadgeClass(level: string): string {
  switch (level) {
    case 'minimal':
      return 'impact-minimal';
    case 'low':
      return 'impact-low';
    case 'moderate':
      return 'impact-moderate';
    case 'high':
      return 'impact-high';
    case 'veryHigh':
      return 'impact-very-high';
    default:
      return 'impact-minimal';
  }
}

/**
 * Computes worst-case rendering impact across all animations.
 * Considers blend modes, clipping masks, and mesh vertices.
 */
export function worstRenderingImpact(animations: AnimationAnalysis[]): ImpactResult {
  return animations.reduce((worst, animation) => {
    const cost = renderingImpactCost({
      activeNonNormalBlends: animation.blendModeMetrics.activeNonNormalCount,
      activeClippingMasks: animation.clippingMetrics.activeMaskCount,
      totalVertices: animation.meshMetrics.totalVertices,
    });
    return cost > worst.cost ? getImpactFromCost(cost) : worst;
  }, getImpactFromCost(0));
}

/**
 * Computes worst-case computational impact across all animations.
 * Considers physics, IK, transform/path constraints, and mesh deformation.
 */
export function worstComputationalImpact(animations: AnimationAnalysis[]): ImpactResult {
  return animations.reduce((worst, animation) => {
    const cost = computationalImpactCost({
      constraints: {
        physics: animation.constraintMetrics.activePhysicsCount,
        path: animation.constraintMetrics.activePathCount,
        ik: animation.constraintMetrics.activeIkCount,
        transform: animation.constraintMetrics.activeTransformCount,
      },
      totalVertices: animation.meshMetrics.totalVertices,
      activeMeshCount: animation.meshMetrics.activeMeshCount ?? 0,
      weightedMeshCount: animation.meshMetrics.weightedMeshCount,
      deformedMeshCount: animation.meshMetrics.deformedMeshCount,
    });
    return cost > worst.cost ? getImpactFromCost(cost) : worst;
  }, getImpactFromCost(0));
}
