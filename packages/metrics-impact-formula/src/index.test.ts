import { describe, it, expect } from 'vitest';
import {
  avgBoneInfluencesForMesh,
  classifyImpactLevel,
  computationalImpactCost,
  constraintBoneCounts,
  countMixingDepth,
  DEFAULT_IMPACT_BRACKETS,
  ikMixScale,
  impactFromCost,
  isConstraintActive,
  isPhysicsConstraintContributing,
  pathMixScale,
  renderingImpactCost,
  transformMixScale,
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
    expect(classifyImpactLevel(25)).toBe('very-high');
    expect(classifyImpactLevel(1000)).toBe('very-high');
  });

  it('honours custom brackets', () => {
    const tight: [number, number, number, number] = [1, 2, 3, 4];
    expect(classifyImpactLevel(0.5, tight)).toBe('minimal');
    expect(classifyImpactLevel(1, tight)).toBe('low');
    expect(classifyImpactLevel(2, tight)).toBe('moderate');
    expect(classifyImpactLevel(3, tight)).toBe('high');
    expect(classifyImpactLevel(4, tight)).toBe('very-high');
  });

  it('exposes the canonical default brackets', () => {
    expect(DEFAULT_IMPACT_BRACKETS).toEqual([3, 8, 15, 25]);
  });
});

describe('impactFromCost', () => {
  it('packages level + cost together', () => {
    expect(impactFromCost(0)).toEqual({ level: 'minimal', cost: 0 });
    expect(impactFromCost(8)).toEqual({ level: 'moderate', cost: 8 });
    expect(impactFromCost(50)).toEqual({ level: 'very-high', cost: 50 });
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

  it('uses per-bone constraint weights when constraintBones is provided', () => {
    // 1 physics (per-constraint: 0.7), 4 ikBones, 6 pathBones, 2 transformBones
    // constraintCost = 1*0.7 + 6*0.275 + 4*0.175 + 2*0.10
    //                = 0.7 + 1.65 + 0.7 + 0.2 = 3.25
    expect(
      computationalImpactCost({
        constraints: { physics: 1, path: 2, ik: 2, transform: 1 },
        constraintBones: { ik: 4, path: 6, transform: 2 },
        totalVertices: 0,
        activeMeshCount: 0,
        weightedMeshCount: 0,
        deformedMeshCount: 0,
      }),
    ).toBeCloseTo(3.25);
  });

  it('matches basic-path constraint cost for standard 2-bone, mix=1 chains', () => {
    // Calibration check: enhanced constraintBones with the canonical
    // baseline (2 bones per chain, mix=1) should reproduce the basic
    // formula exactly, so DEFAULT_IMPACT_BRACKETS keep the same meaning.
    const enhanced = computationalImpactCost({
      constraints: { physics: 1, path: 2, ik: 3, transform: 4 },
      constraintBones: { ik: 6, path: 4, transform: 8 }, // each chain has 2 bones
      totalVertices: 0,
      activeMeshCount: 0,
      weightedMeshCount: 0,
      deformedMeshCount: 0,
    });
    const basic = computationalImpactCost({
      constraints: { physics: 1, path: 2, ik: 3, transform: 4 },
      totalVertices: 0,
      activeMeshCount: 0,
      weightedMeshCount: 0,
      deformedMeshCount: 0,
    });
    expect(enhanced).toBeCloseTo(basic, 6);
  });

  it('uses per-mesh details with bone influence scaling when meshDetails is provided', () => {
    // boneInfluences is normalized to a baseline of 2.
    // mesh1: 200 verts, weighted (3 influences), deformed
    //   deformed: 0.08 + min(0.5, 200/500) = 0.48
    //   weighted: (0.1 + min(0.55, 200/450)) * (3/2) = 0.5444 * 1.5 = 0.8167
    // mesh2: 100 verts, weighted (2 influences), not deformed
    //   weighted: (0.1 + min(0.55, 100/450)) * (2/2) = 0.3222 * 1 = 0.3222
    // base vertex cost: 300 / 2000 = 0.15
    // total mesh cost = 0.48 + 0.8167 + 0.3222 + 0.15 = 1.7689
    expect(
      computationalImpactCost({
        constraints: { physics: 0, path: 0, ik: 0, transform: 0 },
        totalVertices: 300,
        activeMeshCount: 2,
        weightedMeshCount: 2,
        deformedMeshCount: 1,
        meshDetails: [
          { vertices: 200, weighted: true, deformed: true, boneInfluences: 3 },
          { vertices: 100, weighted: true, deformed: false, boneInfluences: 2 },
        ],
      }),
    ).toBeCloseTo(1.7689, 3);
  });

  it('adds mixing cost when mixingDepth is provided', () => {
    // mixCost = 3 * 0.15 = 0.45
    expect(
      computationalImpactCost({
        constraints: { physics: 0, path: 0, ik: 0, transform: 0 },
        totalVertices: 0,
        activeMeshCount: 0,
        weightedMeshCount: 0,
        deformedMeshCount: 0,
        mixingDepth: 3,
      }),
    ).toBeCloseTo(0.45);
  });

  it('falls back to basic path when enhanced inputs are absent', () => {
    // Same as the first test - verifies backwards compatibility
    const basic = computationalImpactCost({
      constraints: { physics: 1, path: 2, ik: 3, transform: 4 },
      totalVertices: 1000,
      activeMeshCount: 2,
      weightedMeshCount: 1,
      deformedMeshCount: 1,
    });
    expect(basic).toBeCloseTo(5.38);
  });
});

describe('isConstraintActive', () => {
  it('treats absent active flag as active', () => {
    expect(isConstraintActive({})).toBe(true);
    expect(isConstraintActive({ active: true })).toBe(true);
    expect(isConstraintActive({ active: false })).toBe(false);
  });
});

describe('mix scale helpers', () => {
  it('ikMixScale returns abs(mix), defaulting to 1', () => {
    expect(ikMixScale({})).toBe(1);
    expect(ikMixScale({ mix: 0.5 })).toBe(0.5);
    expect(ikMixScale({ mix: -0.3 })).toBeCloseTo(0.3);
    expect(ikMixScale({ mix: 0 })).toBe(0);
  });

  it('transformMixScale returns max abs across all six axes, falling back to 1', () => {
    expect(transformMixScale({})).toBe(1);
    expect(transformMixScale({ mixRotate: 0.4, mixX: 0.7, mixY: 0.2 })).toBeCloseTo(0.7);
    expect(transformMixScale({ mixScaleX: -0.9 })).toBeCloseTo(0.9);
    // All zero mix axes fall back to 1 (could not distinguish "all 0" from "no fields")
    expect(transformMixScale({ mixRotate: 0, mixX: 0, mixY: 0 })).toBe(1);
  });

  it('pathMixScale returns max abs across rotate/x/y, falling back to 1', () => {
    expect(pathMixScale({})).toBe(1);
    expect(pathMixScale({ mixRotate: 0.5, mixX: 0.8, mixY: 0.1 })).toBeCloseTo(0.8);
    expect(pathMixScale({ mixRotate: -0.6 })).toBeCloseTo(0.6);
  });
});

describe('isPhysicsConstraintContributing', () => {
  it('treats active && mix !== 0 as contributing', () => {
    expect(isPhysicsConstraintContributing({})).toBe(true);
    expect(isPhysicsConstraintContributing({ active: true, mix: 1 })).toBe(true);
    expect(isPhysicsConstraintContributing({ active: false })).toBe(false);
    expect(isPhysicsConstraintContributing({ mix: 0 })).toBe(false);
    expect(isPhysicsConstraintContributing({ active: true, mix: 0 })).toBe(false);
  });
});

describe('constraintBoneCounts', () => {
  it('sums bones * mixScale per type, skipping inactive constraints', () => {
    const counts = constraintBoneCounts({
      ikConstraints: [
        { active: true, mix: 0.5, bones: [{}, {}, {}] }, // 3 * 0.5 = 1.5
        { active: false, mix: 1, bones: [{}, {}] },      // skipped
        { mix: 1, bones: [{}] },                         // 1 * 1 = 1
      ],
      transformConstraints: [
        { mixRotate: 0.7, bones: [{}, {}] },              // 2 * 0.7 = 1.4
      ],
      pathConstraints: [
        { mixX: 0.5, bones: [{}, {}, {}, {}] },           // 4 * 0.5 = 2
      ],
    });
    expect(counts.ik).toBeCloseTo(2.5);
    expect(counts.transform).toBeCloseTo(1.4);
    expect(counts.path).toBeCloseTo(2);
  });

  it('returns zeros for empty/missing arrays', () => {
    expect(constraintBoneCounts({})).toEqual({ ik: 0, transform: 0, path: 0 });
  });
});

describe('avgBoneInfluencesForMesh', () => {
  it('returns 1 for empty bones array (non-weighted neutral)', () => {
    expect(avgBoneInfluencesForMesh([])).toBe(1);
  });

  it('parses [n, idx, idx, ..., n, idx, ...] layout and averages', () => {
    // 1 vertex with 2 bone influences -> avg 2
    expect(avgBoneInfluencesForMesh([2, 0, 1])).toBe(2);
    // 2 vertices: first has 2 influences, second has 3 -> avg 2.5
    expect(avgBoneInfluencesForMesh([2, 0, 1, 3, 0, 1, 2])).toBeCloseTo(2.5);
  });
});

describe('countMixingDepth', () => {
  it('returns 0 for missing or empty state', () => {
    expect(countMixingDepth(null)).toBe(0);
    expect(countMixingDepth(undefined)).toBe(0);
    expect(countMixingDepth({})).toBe(0);
    expect(countMixingDepth({ tracks: [] })).toBe(0);
  });

  it('counts each track entry plus its mixingFrom chain', () => {
    // Single track, no crossfade: 1
    expect(countMixingDepth({ tracks: [{ mixingFrom: null }] })).toBe(1);
    // One crossfade A->B: current + mixingFrom = 2
    expect(countMixingDepth({ tracks: [{ mixingFrom: { mixingFrom: null } }] })).toBe(2);
    // Two tracks, second is layered crossfade
    expect(countMixingDepth({
      tracks: [
        { mixingFrom: null },
        { mixingFrom: { mixingFrom: { mixingFrom: null } } },
      ],
    })).toBe(4);
    // Null/undefined tracks are skipped
    expect(countMixingDepth({ tracks: [null, undefined, { mixingFrom: null }] })).toBe(1);
  });
});
