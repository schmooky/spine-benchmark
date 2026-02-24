import { describe, expect, it } from 'vitest';
import {
  calculateBlendModeScore,
  calculateBoneScore,
  calculateClippingScore,
  calculateConstraintScore,
  calculateMaxDepth,
  calculateMeshScore,
  calculateOverallScore,
  getImpactBadgeClass,
  getImpactFromCost,
  getScoreColor,
  getScoreInterpretation,
  getScoreRating,
  worstComputationalImpact,
  worstRenderingImpact
} from './index';

describe('metrics-scoring', () => {
  it('calculates mesh score for ideal values and supports activeMeshCount fallback', () => {
    const score = calculateMeshScore({
      activeMeshCount: 15,
      totalVertices: 300,
      deformedMeshCount: 0,
      weightedMeshCount: 0
    });

    expect(score).toBeCloseTo(75, 6);
  });

  it('returns 100 for empty mesh metrics and clamps to 0 for huge penalties', () => {
    expect(calculateMeshScore({})).toBe(100);

    const veryLow = calculateMeshScore({
      totalMeshCount: 100000,
      totalVertices: 1000000,
      deformedMeshCount: 10000,
      weightedMeshCount: 10000
    });

    expect(veryLow).toBe(0);
  });

  it('calculates clipping and blend-mode scores', () => {
    expect(calculateClippingScore(0, 0, 0)).toBe(100);
    expect(calculateClippingScore(4, 100, 2)).toBeLessThan(100);

    expect(calculateBlendModeScore(0, 0)).toBe(100);
    expect(calculateBlendModeScore(6, 2)).toBeLessThan(100);
  });

  it('calculates bone and constraint scores', () => {
    expect(calculateBoneScore(0, 0)).toBe(100);
    expect(calculateBoneScore(200, 10)).toBeGreaterThanOrEqual(0);

    const constraint = calculateConstraintScore(10, 10, 10, 10);
    expect(constraint).toBeCloseTo(95, 6);
  });

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

  it('calculates overall score with floor', () => {
    const high = calculateOverallScore({
      boneScore: 100,
      meshScore: 100,
      clippingScore: 100,
      blendModeScore: 100,
      constraintScore: 100
    });
    expect(high).toBe(100);

    const floored = calculateOverallScore({
      boneScore: 0,
      meshScore: 0,
      clippingScore: 0,
      blendModeScore: 0,
      constraintScore: 0
    });
    expect(floored).toBe(40);
  });

  it('maps score helpers to expected labels and colors', () => {
    expect(getScoreColor(90)).toBe('#4caf50');
    expect(getScoreColor(75)).toBe('#8bc34a');
    expect(getScoreColor(60)).toBe('#ffb300');
    expect(getScoreColor(45)).toBe('#f57c00');
    expect(getScoreColor(10)).toBe('#e53935');

    expect(getScoreRating(90)).toBe('excellent');
    expect(getScoreRating(75)).toBe('good');
    expect(getScoreRating(60)).toBe('moderate');
    expect(getScoreRating(45)).toBe('poor');
    expect(getScoreRating(10)).toBe('veryPoor');

    expect(getScoreInterpretation(90)).toContain('Excellent');
    expect(getScoreInterpretation(75)).toContain('Good');
    expect(getScoreInterpretation(60)).toContain('Moderate');
    expect(getScoreInterpretation(45)).toContain('Poor');
    expect(getScoreInterpretation(10)).toContain('Very poor');
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
    expect(['minimal', 'low', 'moderate', 'high', 'veryHigh']).toContain(renderImpact.level);
    expect(['minimal', 'low', 'moderate', 'high', 'veryHigh']).toContain(cpuImpact.level);
  });
});
