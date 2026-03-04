import type { AnimationAnalysis } from '../SpineAnalyzer';

/**
 * Impact result used for rendering/computational impact display
 */
export interface ImpactResult {
  level: string;
  cost: number;
  color: string;
}

/**
 * Converts a raw cost number into an impact level with color
 */
export function getImpactFromCost(cost: number): ImpactResult {
  if (cost < 3) return { level: 'minimal', cost, color: '#34D399' };
  if (cost < 8) return { level: 'low', cost, color: '#A3E635' };
  if (cost < 15) return { level: 'moderate', cost, color: '#FBBF24' };
  if (cost < 25) return { level: 'high', cost, color: '#FB923C' };
  return { level: 'veryHigh', cost, color: '#F87171' };
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
    const cost =
      (animation.blendModeMetrics.activeNonNormalCount * 3) +
      (animation.clippingMetrics.activeMaskCount * 5) +
      (animation.meshMetrics.totalVertices / 200);
    return cost > worst.cost ? getImpactFromCost(cost) : worst;
  }, getImpactFromCost(0));
}

/**
 * Computes worst-case computational impact across all animations.
 * Considers physics, IK, transform/path constraints, and mesh deformation.
 */
export function worstComputationalImpact(animations: AnimationAnalysis[]): ImpactResult {
  return animations.reduce((worst, animation) => {
    const meshCount = Math.max(animation.meshMetrics.activeMeshCount ?? 0, 1);
    const averageVerticesPerMesh = animation.meshMetrics.totalVertices / meshCount;

    const constraintCost =
      (animation.constraintMetrics.activePhysicsCount * 0.7) +
      (animation.constraintMetrics.activePathCount * 0.55) +
      (animation.constraintMetrics.activeIkCount * 0.35) +
      (animation.constraintMetrics.activeTransformCount * 0.2);

    const deformedMeshWeight = 0.08 + Math.min(0.5, averageVerticesPerMesh / 500);
    const weightedMeshWeight = 0.1 + Math.min(0.55, averageVerticesPerMesh / 450);
    const meshComputationCost =
      (animation.meshMetrics.deformedMeshCount * deformedMeshWeight) +
      (animation.meshMetrics.weightedMeshCount * weightedMeshWeight) +
      (animation.meshMetrics.totalVertices / 2000);

    const cost = constraintCost + meshComputationCost;
    return cost > worst.cost ? getImpactFromCost(cost) : worst;
  }, getImpactFromCost(0));
}
