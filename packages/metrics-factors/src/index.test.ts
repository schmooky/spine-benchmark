import { describe, expect, it } from 'vitest';
import { PERFORMANCE_FACTORS } from './index';

describe('metrics-factors', () => {
  it('exposes expected top-level weights', () => {
    expect(PERFORMANCE_FACTORS.BONE_WEIGHT).toBeGreaterThan(0);
    expect(PERFORMANCE_FACTORS.MESH_WEIGHT).toBeGreaterThan(0);
    expect(PERFORMANCE_FACTORS.CLIPPING_WEIGHT).toBeGreaterThan(0);
    expect(PERFORMANCE_FACTORS.BLEND_MODE_WEIGHT).toBeGreaterThan(0);
    expect(PERFORMANCE_FACTORS.CONSTRAINT_WEIGHT).toBeGreaterThan(0);
  });

  it('has normalized constraint sub-weights', () => {
    const sum = PERFORMANCE_FACTORS.IK_WEIGHT +
      PERFORMANCE_FACTORS.TRANSFORM_WEIGHT +
      PERFORMANCE_FACTORS.PATH_WEIGHT +
      PERFORMANCE_FACTORS.PHYSICS_WEIGHT;

    expect(sum).toBeCloseTo(1, 10);
  });

  it('keeps ideal thresholds positive', () => {
    expect(PERFORMANCE_FACTORS.IDEAL_BONE_COUNT).toBeGreaterThan(0);
    expect(PERFORMANCE_FACTORS.IDEAL_MESH_COUNT).toBeGreaterThan(0);
    expect(PERFORMANCE_FACTORS.IDEAL_VERTEX_COUNT).toBeGreaterThan(0);
    expect(PERFORMANCE_FACTORS.IDEAL_CLIPPING_COUNT).toBeGreaterThan(0);
    expect(PERFORMANCE_FACTORS.IDEAL_BLEND_MODE_COUNT).toBeGreaterThan(0);
  });
});
