import { describe, expect, it } from 'vitest';
import {
  calculateMaxDepth,
  getImpactBadgeClass,
  getImpactFromCost,
  worstComputationalImpact,
  worstRenderingImpact
} from './index';

describe('metrics-scoring', () => {
  it('calculates tree max depth', () => {
    const tree = [
      {
        children: [
          { children: [] },
          {
            children: [
              {
                children: []
              }
            ]
          }
        ]
      }
    ];

    expect(calculateMaxDepth([])).toBe(0);
    expect(calculateMaxDepth(tree)).toBe(3);
  });

  it('maps impact helpers and badge classes', () => {
    expect(getImpactFromCost(0).level).toBe('minimal');
    expect(getImpactFromCost(3).level).toBe('low');
    expect(getImpactFromCost(8).level).toBe('moderate');
    expect(getImpactFromCost(15).level).toBe('high');
    expect(getImpactFromCost(25).level).toBe('veryHigh');

    expect(getImpactBadgeClass('minimal')).toBe('impact-minimal');
    expect(getImpactBadgeClass('low')).toBe('impact-low');
    expect(getImpactBadgeClass('moderate')).toBe('impact-moderate');
    expect(getImpactBadgeClass('high')).toBe('impact-high');
    expect(getImpactBadgeClass('veryHigh')).toBe('impact-very-high');
    expect(getImpactBadgeClass('unknown')).toBe('impact-minimal');
  });

  it('computes worst-case rendering and computational impact', () => {
    const animations = [
      {
        blendModeMetrics: { activeNonNormalCount: 0 },
        clippingMetrics: { activeMaskCount: 0 },
        meshMetrics: { totalVertices: 100, deformedMeshCount: 0, weightedMeshCount: 0 },
        constraintMetrics: {
          activePhysicsCount: 0,
          activeIkCount: 0,
          activeTransformCount: 0,
          activePathCount: 0
        }
      },
      {
        blendModeMetrics: { activeNonNormalCount: 2 },
        clippingMetrics: { activeMaskCount: 2 },
        meshMetrics: { totalVertices: 1000, deformedMeshCount: 3, weightedMeshCount: 2 },
        constraintMetrics: {
          activePhysicsCount: 2,
          activeIkCount: 1,
          activeTransformCount: 1,
          activePathCount: 2
        }
      }
    ];

    const renderImpact = worstRenderingImpact(animations);
    const cpuImpact = worstComputationalImpact(animations);

    expect(renderImpact.cost).toBeGreaterThan(0);
    expect(cpuImpact.cost).toBeGreaterThan(0);
    expect(cpuImpact.cost).toBeCloseTo(6.59, 2);
    expect(cpuImpact.level).toBe('low');
    expect(['minimal', 'low', 'moderate', 'high', 'veryHigh']).toContain(renderImpact.level);
    expect(['minimal', 'low', 'moderate', 'high', 'veryHigh']).toContain(cpuImpact.level);
  });
});
