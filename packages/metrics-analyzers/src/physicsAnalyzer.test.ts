/**
 * Parity tests: `analyzeGlobalPhysics` / `analyzePhysicsForAnimation`
 * must produce the same `constraintBones` semantics as the canonical
 * `activeConstraintStats` helper from `metrics-impact-formula` - i.e.
 * raw bone counts of *contributing* (active && mix > 0) constraints,
 * NOT mix-scaled. Spine-ts runs the full constraint solve at any
 * non-zero `mix`, so per-bone CPU cost is independent of `mix`
 * magnitude. Earlier versions multiplied by `mixScale`, which caused
 * the offline reporter to undercount CI for partial-mix constraints
 * and diverge from the live crawler / heatmap / CLI.
 */
import { describe, expect, it } from 'vitest';
import {
  activeConstraintStats,
  computationalImpactCost,
} from '@spine-benchmark/metrics-impact-formula';
import type { Spine, Animation } from '@esotericsoftware/spine-pixi-v8';
import type { ActiveComponents } from '@spine-benchmark/metrics-sampling';
import { analyzeGlobalPhysics, analyzePhysicsForAnimation } from './physicsAnalyzer.js';

// ─── Mock builders ─────────────────────────────────────────────────

function makeBone(name: string) {
  return { data: { name } };
}

interface IkOpts { active?: boolean }
function makeIk(name: string, boneCount: number, mix: number, opts: IkOpts = {}) {
  const bones = Array.from({ length: boneCount }, (_, i) => makeBone(`${name}_b${i}`));
  const active = opts.active ?? true;
  return {
    data: { name, mix },
    target: makeBone(`${name}_target`),
    bones,
    mix,
    softness: 0,
    bendDirection: 1,
    compress: false,
    stretch: false,
    active,
    isActive() { return active; },
  };
}

interface TransformMix {
  mixRotate?: number; mixX?: number; mixY?: number;
  mixScaleX?: number; mixScaleY?: number; mixShearY?: number;
}
function makeTransform(name: string, boneCount: number, mix: TransformMix, active = true) {
  const bones = Array.from({ length: boneCount }, (_, i) => makeBone(`${name}_b${i}`));
  return {
    data: { name, local: false, relative: false, ...mix },
    target: makeBone(`${name}_target`),
    bones,
    mixRotate: mix.mixRotate ?? 0,
    mixX: mix.mixX ?? 0,
    mixY: mix.mixY ?? 0,
    mixScaleX: mix.mixScaleX ?? 0,
    mixScaleY: mix.mixScaleY ?? 0,
    mixShearY: mix.mixShearY ?? 0,
    active,
    isActive() { return active; },
  };
}

interface PathMix { mixRotate?: number; mixX?: number; mixY?: number }
function makePath(name: string, boneCount: number, mix: PathMix, active = true) {
  const bones = Array.from({ length: boneCount }, (_, i) => makeBone(`${name}_b${i}`));
  return {
    data: { name, positionMode: 0, spacingMode: 0, rotateMode: 0, offsetRotation: 0 },
    target: makeBone(`${name}_target`),
    bones,
    mixRotate: mix.mixRotate ?? 0,
    mixX: mix.mixX ?? 0,
    mixY: mix.mixY ?? 0,
    position: 0,
    spacing: 0,
    world: null,
    segments: null,
    lengths: null,
    active,
    isActive() { return active; },
  };
}

function makePhysics(name: string, mix: number, active = true) {
  return {
    data: { name, x: 0, y: 0, rotate: 0, scaleX: 0, shearX: 0, strength: 100, damping: 1 },
    bone: makeBone(`${name}_bone`),
    inertia: 0,
    strength: 100,
    damping: 1,
    massInverse: 1,
    wind: 0,
    gravity: 0,
    mix,
    active,
    isActive() { return active; },
  };
}

function makeSpine(skeleton: Record<string, unknown>): Spine {
  return { skeleton } as unknown as Spine;
}

// ─── analyzeGlobalPhysics: parity with activeConstraintStats ─────

describe('analyzeGlobalPhysics - constraint bone parity with formula', () => {
  it('produces raw bone counts (not mix-scaled) matching activeConstraintStats', () => {
    // 3-bone IK at mix=0.5 must contribute 3 bones (NOT 1.5):
    // spine-ts runs the full IK solve at any mix > 0, so per-bone
    // CPU cost is mix-independent.
    // 4-bone path with all axes = 0 must contribute 0 bones.
    // 2-bone transform with mixRotate=0.7 must contribute 2 bones.
    // Physics with mix=0 is integrated but does not apply.
    const skeleton = {
      ikConstraints: [
        makeIk('ik1', 3, 0.5),
      ],
      transformConstraints: [
        makeTransform('t1', 2, { mixRotate: 0.7 }),
        makeTransform('t2_zero', 1, { mixRotate: 0, mixX: 0, mixY: 0 }),
      ],
      pathConstraints: [
        makePath('p1_zero', 4, { mixRotate: 0, mixX: 0, mixY: 0 }),
      ],
      physicsConstraints: [
        makePhysics('phy1', 1),
        makePhysics('phy2_zero', 0),
        makePhysics('phy3_inactive', 1, false),
      ],
    };

    const result = analyzeGlobalPhysics(makeSpine(skeleton));
    const stats = activeConstraintStats(
      skeleton as Parameters<typeof activeConstraintStats>[0],
    );

    // The whole point: analyzer's constraintBones must equal the
    // canonical helper's bones, both for individual axes and totals.
    expect(result.metrics.constraintBones).toEqual(stats.bones);

    // Regression: a 3-bone IK at mix=0.5 yields ikBones=3, not 1.5.
    expect(result.metrics.constraintBones.ik).toBe(3);
    expect(result.metrics.constraintBones.transform).toBe(2);
    expect(result.metrics.constraintBones.path).toBe(0);

    // physicsActiveAll counts active physics regardless of mix.
    expect(result.metrics.activePhysicsAllCount).toBe(stats.physicsActiveAll);
    expect(result.metrics.activePhysicsAllCount).toBe(2);
    expect(result.metrics.activePhysicsCount).toBe(1);
  });

  it('feeds the formula identical inputs as activeConstraintStats does', () => {
    // Build a non-trivial mix of partial-mix and zero-mix constraints
    // and verify that running the formula on the analyzer's outputs
    // yields the exact same CI as running it on the canonical helper.
    const skeleton = {
      ikConstraints: [
        makeIk('ik1', 4, 1),
        makeIk('ik2_partial', 2, 0.3),
      ],
      transformConstraints: [
        makeTransform('t1', 3, { mixRotate: 0.5, mixX: 0.5 }),
      ],
      pathConstraints: [
        makePath('p1', 5, { mixX: 0.4 }),
      ],
      physicsConstraints: [
        makePhysics('phy1', 1),
        makePhysics('phy_zero', 0),
      ],
    };

    const result = analyzeGlobalPhysics(makeSpine(skeleton));
    const stats = activeConstraintStats(
      skeleton as Parameters<typeof activeConstraintStats>[0],
    );

    const ciFromAnalyzer = computationalImpactCost({
      constraints: {
        physics: result.metrics.activePhysicsCount,
        path: result.metrics.activePathCount,
        ik: result.metrics.activeIkCount,
        transform: result.metrics.activeTransformCount,
      },
      physicsActiveAll: result.metrics.activePhysicsAllCount,
      constraintBones: result.metrics.constraintBones,
      totalVertices: 0,
      activeMeshCount: 0,
      weightedMeshCount: 0,
      deformedMeshCount: 0,
    });
    const ciFromStats = computationalImpactCost({
      constraints: stats.active,
      physicsActiveAll: stats.physicsActiveAll,
      constraintBones: stats.bones,
      totalVertices: 0,
      activeMeshCount: 0,
      weightedMeshCount: 0,
      deformedMeshCount: 0,
    });
    expect(ciFromAnalyzer).toBeCloseTo(ciFromStats, 6);
  });

  it('excludes mix=0 constraints from active counts (parity with activeConstraintStats)', () => {
    // A constraint with `active=true` but every mix axis explicitly
    // zero produces no skeleton output and is excluded by the live
    // crawler / heatmap / CLI via `activeConstraintStats`. The
    // offline path used to filter only by `c.isActive()`, leaving
    // such constraints in the active counts and diverging from live.
    const skeleton = {
      ikConstraints: [
        makeIk('ik_real', 2, 1),
        makeIk('ik_zero_mix', 3, 0),
      ],
      transformConstraints: [
        makeTransform('t_real', 2, { mixRotate: 0.5 }),
        makeTransform('t_all_zero', 1, {
          mixRotate: 0, mixX: 0, mixY: 0,
          mixScaleX: 0, mixScaleY: 0, mixShearY: 0,
        }),
      ],
      pathConstraints: [
        makePath('p_real', 4, { mixX: 0.4 }),
        makePath('p_all_zero', 2, { mixRotate: 0, mixX: 0, mixY: 0 }),
      ],
      physicsConstraints: [],
    };
    const result = analyzeGlobalPhysics(makeSpine(skeleton));
    const stats = activeConstraintStats(
      skeleton as Parameters<typeof activeConstraintStats>[0],
    );

    expect(result.metrics.activeIkCount).toBe(stats.active.ik);
    expect(result.metrics.activeTransformCount).toBe(stats.active.transform);
    expect(result.metrics.activePathCount).toBe(stats.active.path);

    // Concrete numbers: only the non-zero-mix instance of each type
    // counts as active.
    expect(result.metrics.activeIkCount).toBe(1);
    expect(result.metrics.activeTransformCount).toBe(1);
    expect(result.metrics.activePathCount).toBe(1);

    // totalActiveConstraints sums the canonical active counts.
    expect(result.metrics.totalActiveConstraints).toBe(3);
  });

  it('charges partial-mix IK the same CI as full-mix IK (regression)', () => {
    // Pre-fix behaviour: ikBones = boneCount * mixScale, so the
    // partialMix skeleton produced ikBones = 1.5 and the formula
    // returned 1.5 * 0.175 = 0.2625 instead of 3 * 0.175 = 0.525.
    const fullMix = {
      ikConstraints: [makeIk('ik', 3, 1)],
      transformConstraints: [],
      pathConstraints: [],
      physicsConstraints: [],
    };
    const halfMix = {
      ikConstraints: [makeIk('ik', 3, 0.5)],
      transformConstraints: [],
      pathConstraints: [],
      physicsConstraints: [],
    };

    const fullResult = analyzeGlobalPhysics(makeSpine(fullMix));
    const halfResult = analyzeGlobalPhysics(makeSpine(halfMix));

    expect(fullResult.metrics.constraintBones.ik).toBe(3);
    expect(halfResult.metrics.constraintBones.ik).toBe(3);
  });
});

// ─── analyzePhysicsForAnimation: same parity ─────────────────────

function makeActiveComponents(active: {
  ik?: string[]; transform?: string[]; path?: string[]; physics?: string[];
}): ActiveComponents {
  return {
    slots: new Set(),
    meshes: new Set(),
    bones: new Set(),
    hasClipping: false,
    hasBlendModes: false,
    hasPhysics: (active.physics?.length ?? 0) > 0,
    hasIK: (active.ik?.length ?? 0) > 0,
    hasTransform: (active.transform?.length ?? 0) > 0,
    hasPath: (active.path?.length ?? 0) > 0,
    activeConstraints: {
      ik: new Set(active.ik ?? []),
      transform: new Set(active.transform ?? []),
      path: new Set(active.path ?? []),
      physics: new Set(active.physics ?? []),
    },
  };
}

describe('analyzePhysicsForAnimation - constraint bone parity with formula', () => {
  it('produces raw bone counts (not mix-scaled) for partial-mix constraints', () => {
    const skeleton = {
      ikConstraints: [makeIk('ik1', 3, 0.5)],
      transformConstraints: [makeTransform('t1', 2, { mixRotate: 0.7 })],
      pathConstraints: [makePath('p1_zero', 4, { mixRotate: 0, mixX: 0, mixY: 0 })],
      physicsConstraints: [
        makePhysics('phy1', 1),
        makePhysics('phy_zero', 0),
      ],
    };
    const active = makeActiveComponents({
      ik: ['ik1'],
      transform: ['t1'],
      path: ['p1_zero'],
      physics: ['phy1', 'phy_zero'],
    });
    const animation = { name: 'parity-test' } as unknown as Animation;

    const metrics = analyzePhysicsForAnimation(makeSpine(skeleton), animation, active);

    // Regression: 3-bone IK at mix=0.5 -> 3 raw bones, not 1.5.
    expect(metrics.constraintBones.ik).toBe(3);
    expect(metrics.constraintBones.transform).toBe(2);
    // All-zero path is excluded entirely.
    expect(metrics.constraintBones.path).toBe(0);
    // Physics: only contributing (mix > 0) counts toward apply work,
    // but integration runs for both active physics constraints.
    expect(metrics.activePhysicsCount).toBe(1);
    expect(metrics.activePhysicsAllCount).toBe(2);
  });

  it('skips constraints with active=false even when the timeline mentions them', () => {
    const skeleton = {
      ikConstraints: [makeIk('ik1', 3, 1, { active: false })],
      transformConstraints: [],
      pathConstraints: [],
      physicsConstraints: [],
    };
    const active = makeActiveComponents({ ik: ['ik1'] });
    const animation = { name: 'inactive-test' } as unknown as Animation;

    const metrics = analyzePhysicsForAnimation(makeSpine(skeleton), animation, active);

    expect(metrics.constraintBones.ik).toBe(0);
  });
});
