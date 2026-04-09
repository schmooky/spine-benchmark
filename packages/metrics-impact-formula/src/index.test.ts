import { describe, it, expect } from 'vitest';
import {
  classifyImpactLevel,
  computationalImpactCost,
  DEFAULT_IMPACT_BRACKETS,
  impactFromCost,
  renderingImpactCost,
} from './index.js';

describe('classifyImpactLevel', () => {
  it('returns minimal below the first bracket', () => {
    expect(classifyImpactLevel(0)).toBe('minimal');
    expect(classifyImpactLevel(2.999)).toBe('minimal');
  });

  it('returns each level at and above its bracket boundary', () => {
    expect(classifyImpactLevel(3)).toBe('low');
    expect(classifyImpactLevel(7.999)).toBe('low');
    expect(classifyImpactLevel(8)).toBe('moderate');
    expect(classifyImpactLevel(14.999)).toBe('moderate');
    expect(classifyImpactLevel(15)).toBe('high');
    expect(classifyImpactLevel(24.999)).toBe('high');
    expect(classifyImpactLevel(25)).toBe('veryHigh');
    expect(classifyImpactLevel(1000)).toBe('veryHigh');
  });

  it('honours custom brackets', () => {
    const tight: [number, number, number, number] = [1, 2, 3, 4];
    expect(classifyImpactLevel(0.5, tight)).toBe('minimal');
    expect(classifyImpactLevel(1, tight)).toBe('low');
    expect(classifyImpactLevel(2, tight)).toBe('moderate');
    expect(classifyImpactLevel(3, tight)).toBe('high');
    expect(classifyImpactLevel(4, tight)).toBe('veryHigh');
  });

  it('exposes the canonical default brackets', () => {
    expect(DEFAULT_IMPACT_BRACKETS).toEqual([3, 8, 15, 25]);
  });
});

describe('impactFromCost', () => {
  it('packages level + cost together', () => {
    expect(impactFromCost(0)).toEqual({ level: 'minimal', cost: 0 });
    expect(impactFromCost(8)).toEqual({ level: 'moderate', cost: 8 });
    expect(impactFromCost(50)).toEqual({ level: 'veryHigh', cost: 50 });
  });
});

describe('renderingImpactCost', () => {
  it('weights blend, clipping, and vertices canonically', () => {
    // 2 blend × 3 + 1 clip × 5 + 400 verts / 200 = 6 + 5 + 2 = 13
    expect(
      renderingImpactCost({
        activeNonNormalBlends: 2,
        activeClippingMasks: 1,
        totalVertices: 400,
      }),
    ).toBeCloseTo(13);
  });

  it('returns zero when nothing is active', () => {
    expect(
      renderingImpactCost({
        activeNonNormalBlends: 0,
        activeClippingMasks: 0,
        totalVertices: 0,
      }),
    ).toBe(0);
  });
});

describe('computationalImpactCost', () => {
  it('matches the canonical weighted formula', () => {
    // constraints: 1 physics × 0.7 + 2 path × 0.55 + 3 ik × 0.35 + 4 transform × 0.2
    //            = 0.7 + 1.1 + 1.05 + 0.8 = 3.65
    // meshes: 2 active, 1000 verts -> avg = 500
    //   deformedW = 0.08 + min(0.5, 500/500) = 0.08 + 0.5 = 0.58
    //   weightedW = 0.1  + min(0.55, 500/450) = 0.1 + 0.55 = 0.65
    //   meshCost  = 1 × 0.58 + 1 × 0.65 + 1000/2000 = 0.58 + 0.65 + 0.5 = 1.73
    // total = 3.65 + 1.73 = 5.38
    expect(
      computationalImpactCost({
        constraints: { physics: 1, path: 2, ik: 3, transform: 4 },
        totalVertices: 1000,
        activeMeshCount: 2,
        weightedMeshCount: 1,
        deformedMeshCount: 1,
      }),
    ).toBeCloseTo(5.38);
  });

  it('clamps the mesh divisor so empty inputs do not divide by zero', () => {
    expect(
      computationalImpactCost({
        constraints: { physics: 0, path: 0, ik: 0, transform: 0 },
        totalVertices: 0,
        activeMeshCount: 0,
        weightedMeshCount: 0,
        deformedMeshCount: 0,
      }),
    ).toBe(0);
  });
});
