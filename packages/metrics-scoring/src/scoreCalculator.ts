import {
  classifyImpactLevel,
  computationalImpactCost,
  type ImpactLevel,
  renderingImpactCost,
} from '@spine-benchmark/metrics-impact-formula';

interface AnimationAnalysisLike {
  blendModeMetrics: { activeNonNormalCount: number };
  clippingMetrics: { activeMaskCount: number };
  meshMetrics: {
    activeMeshCount?: number;
    totalVertices: number;
    deformedMeshCount: number;
    weightedMeshCount: number;
    meshDetails?: ReadonlyArray<{ vertices: number; weighted: boolean; deformed: boolean; boneInfluences: number }>;
  };
  constraintMetrics: {
    activePhysicsCount: number;
    activeIkCount: number;
    activeTransformCount: number;
    activePathCount: number;
    constraintBones?: { ik: number; path: number; transform: number };
  };
}

/**
 * Helper function to calculate maximum depth of a tree structure
 * @param nodes Tree nodes
 * @returns Maximum depth of the tree
 */
export function calculateMaxDepth(nodes: any[]): number {
  if (!nodes || nodes.length === 0) return 0;

  return 1 + Math.max(...nodes.map(node =>
    node.children ? calculateMaxDepth(node.children) : 0
  ));
}

/**
 * Impact result used for rendering/computational impact display
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
  'very-high': '#F87171',
};

/**
 * Converts a raw cost number into an impact level with color.
 * Level + brackets come from `@spine-benchmark/metrics-impact-formula`;
 * the color palette is the only piece this package owns.
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
    case 'minimal': return 'impact-minimal';
    case 'low': return 'impact-low';
    case 'moderate': return 'impact-moderate';
    case 'high': return 'impact-high';
    case 'very-high': return 'impact-very-high';
    default: return 'impact-minimal';
  }
}

/**
 * Computes worst-case rendering impact across all animations.
 * Considers blend modes, clipping masks, and mesh vertices.
 */
export function worstRenderingImpact(animations: AnimationAnalysisLike[]): ImpactResult {
  return animations.reduce((worst, a) => {
    const cost = renderingImpactCost({
      activeNonNormalBlends: a.blendModeMetrics.activeNonNormalCount,
      activeClippingMasks: a.clippingMetrics.activeMaskCount,
      totalVertices: a.meshMetrics.totalVertices,
    });
    return cost > worst.cost ? getImpactFromCost(cost) : worst;
  }, getImpactFromCost(0));
}

/**
 * Computes worst-case computational impact across all animations.
 * Considers physics, IK, transform/path constraints, and mesh deformation.
 */
export function worstComputationalImpact(animations: AnimationAnalysisLike[]): ImpactResult {
  return animations.reduce((worst, a) => {
    const cost = computationalImpactCost({
      constraints: {
        physics: a.constraintMetrics.activePhysicsCount,
        path: a.constraintMetrics.activePathCount,
        ik: a.constraintMetrics.activeIkCount,
        transform: a.constraintMetrics.activeTransformCount,
      },
      constraintBones: a.constraintMetrics.constraintBones,
      totalVertices: a.meshMetrics.totalVertices,
      activeMeshCount: a.meshMetrics.activeMeshCount ?? 0,
      weightedMeshCount: a.meshMetrics.weightedMeshCount,
      deformedMeshCount: a.meshMetrics.deformedMeshCount,
      meshDetails: a.meshMetrics.meshDetails,
    });
    return cost > worst.cost ? getImpactFromCost(cost) : worst;
  }, getImpactFromCost(0));
}
