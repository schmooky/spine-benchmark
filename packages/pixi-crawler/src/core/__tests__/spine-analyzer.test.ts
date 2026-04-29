/**
 * Unit tests for spine-analyzer.ts - RI/CI formulas, draw-call counting,
 * and classifyImpactLevel.
 *
 * We test through the public API (`analyzeSpine`, `isSpine`, `classifyImpactLevel`)
 * using mock Spine objects that match the duck-typed `SpineLike` interface.
 */
import { describe, it, expect } from 'vitest';
import {
    computationalImpactCost,
    renderingImpactCost,
} from '@spine-benchmark/metrics-impact-formula';
import { isSpine, analyzeSpine } from '../spine-analyzer.js';
import { classifyImpactLevel, DEFAULT_IMPACT_BRACKETS } from '../types.js';
import type { Container } from 'pixi.js';

// ────────────────────────────────────────────────────────────────
// Helpers to build mock Spine objects
// ────────────────────────────────────────────────────────────────

interface MockSlot {
    data: { name: string; blendMode: number };
    color: { a: number };
    bone: { active: boolean };
    attachment: MockAttachment | null;
    deform?: number[];
}

interface MockAttachment {
    name: string;
    region?: { page?: { name: string; width: number; height: number }; name?: string } | null;
    endSlot?: unknown;
    worldVerticesLength?: number;
    bones?: number[] | null;
    triangles?: number[];
}

function makeSlot(
    name: string,
    blendMode: number,
    attachment: MockAttachment | null,
    opts?: { invisible?: boolean; alpha?: number; deform?: number[] },
): MockSlot {
    return {
        data: { name, blendMode },
        color: { a: opts?.alpha ?? 1 },
        // Visibility is now driven by `bone.active` (matches the live spine
        // runtime + the benchmark heatmap), not the non-existent
        // `slot.data.visible` field the analyzer used to read.
        bone: { active: opts?.invisible ? false : true },
        attachment,
        deform: opts?.deform,
    };
}

function makeRegionAttachment(
    name: string,
    atlasPage: string,
    worldVerticesLength = 8, // 4 verts × 2 floats
): MockAttachment {
    return {
        name,
        region: { page: { name: atlasPage, width: 512, height: 512 }, name },
        worldVerticesLength,
    };
}

function makeMeshAttachment(
    name: string,
    atlasPage: string,
    worldVerticesLength: number,
    opts?: { bones?: number[] | null; triangles?: number[] },
): MockAttachment {
    return {
        name,
        region: { page: { name: atlasPage, width: 512, height: 512 }, name },
        worldVerticesLength,
        triangles: opts?.triangles ?? [0, 1, 2], // presence of triangles = mesh
        bones: opts?.bones ?? null,
    };
}

function makeClippingAttachment(name: string): MockAttachment {
    return { name, endSlot: {} };
}

function makeConstraints(count: number, active = true, bonesPerConstraint = 2) {
    return Array.from({ length: count }, () => ({
        active,
        bones: Array.from({ length: bonesPerConstraint }, () => ({})),
        mix: 1,
        mixRotate: 1,
        mixX: 1,
        mixY: 1,
        mixScaleX: 1,
        mixScaleY: 1,
        mixShearY: 1,
    }));
}

function makeSkeleton(
    drawOrder: MockSlot[],
    constraints?: {
        ik?: number;
        transform?: number;
        path?: number;
        physics?: number;
    },
) {
    return {
        slots: drawOrder,
        drawOrder,
        data: { name: 'test-skeleton' },
        ikConstraints: makeConstraints(constraints?.ik ?? 0),
        transformConstraints: makeConstraints(constraints?.transform ?? 0),
        pathConstraints: makeConstraints(constraints?.path ?? 0),
        physicsConstraints: makeConstraints(constraints?.physics ?? 0),
    };
}

/** Create a mock Container that looks like a Spine object to `isSpine()`. */
function mockSpineNode(
    drawOrder: MockSlot[],
    constraints?: Parameters<typeof makeSkeleton>[1],
    state?: { tracks?: (unknown | null)[] },
): Container {
    const skeleton = makeSkeleton(drawOrder, constraints);
    return { skeleton, state: state ?? { tracks: [] } } as unknown as Container;
}

// ────────────────────────────────────────────────────────────────
// classifyImpactLevel
// ────────────────────────────────────────────────────────────────

describe('classifyImpactLevel', () => {
    it('returns "minimal" for scores below the first bracket', () => {
        expect(classifyImpactLevel(0)).toBe('minimal');
        expect(classifyImpactLevel(2.9)).toBe('minimal');
    });

    it('returns "low" for scores at or above first bracket', () => {
        expect(classifyImpactLevel(3)).toBe('low');
        expect(classifyImpactLevel(7.9)).toBe('low');
    });

    it('returns "moderate" for scores at or above second bracket', () => {
        expect(classifyImpactLevel(8)).toBe('moderate');
        expect(classifyImpactLevel(14.9)).toBe('moderate');
    });

    it('returns "high" for scores at or above third bracket', () => {
        expect(classifyImpactLevel(15)).toBe('high');
        expect(classifyImpactLevel(24.9)).toBe('high');
    });

    it('returns "very-high" for scores at or above the fourth bracket', () => {
        expect(classifyImpactLevel(25)).toBe('very-high');
        expect(classifyImpactLevel(100)).toBe('very-high');
    });

    it('accepts custom brackets', () => {
        const custom: [number, number, number, number] = [10, 20, 30, 40];
        expect(classifyImpactLevel(5, custom)).toBe('minimal');
        expect(classifyImpactLevel(10, custom)).toBe('low');
        expect(classifyImpactLevel(20, custom)).toBe('moderate');
        expect(classifyImpactLevel(30, custom)).toBe('high');
        expect(classifyImpactLevel(40, custom)).toBe('very-high');
    });

    it('uses DEFAULT_IMPACT_BRACKETS [3, 8, 15, 25] by default', () => {
        expect(DEFAULT_IMPACT_BRACKETS).toEqual([3, 8, 15, 25]);
    });
});

// ────────────────────────────────────────────────────────────────
// isSpine
// ────────────────────────────────────────────────────────────────

describe('isSpine', () => {
    it('returns true for objects with skeleton.slots and skeleton.drawOrder arrays', () => {
        const node = mockSpineNode([]);
        expect(isSpine(node)).toBe(true);
    });

    it('returns false for plain Container', () => {
        expect(isSpine({} as Container)).toBe(false);
    });

    it('returns false when skeleton exists but slots is missing', () => {
        const node = { skeleton: { drawOrder: [] } } as unknown as Container;
        expect(isSpine(node)).toBe(false);
    });
});

// ────────────────────────────────────────────────────────────────
// analyzeSpine - RI formula
// ────────────────────────────────────────────────────────────────

describe('analyzeSpine - Rendering Impact', () => {
    it('computes RI = 0 for a skeleton with one region slot and no blend/clip', () => {
        const slots = [
            makeSlot('slot0', 0, makeRegionAttachment('img', 'page1', 8)),
        ];
        const node = mockSpineNode(slots);
        const result = analyzeSpine(node);

        // RI = (0 blendTransitions × 3) + (0 clips × 5) + (4 verts / 200) = 0.02
        expect(result.renderingImpact).toBeDefined();
        expect(result.renderingImpact!.blendModes).toBe(0);
        expect(result.renderingImpact!.clippingMasks).toBe(0);
        expect(result.renderingImpact!.vertices).toBe(4); // 8 / 2
        expect(result.renderingImpact!.total).toBeCloseTo(0.02, 4);
        expect(result.renderingImpact!.level).toBe('minimal');
    });

    it('feeds active non-normal blend slot count (NOT transitions) into RI', () => {
        // Three slots: normal, additive, normal. Two blend transitions
        // for draw-call counting purposes, but ONE active non-normal slot
        // for the RI formula. Heatmap parity demands the latter.
        const slots = [
            makeSlot('slot0', 0, makeRegionAttachment('a', 'page1', 8)),
            makeSlot('slot1', 1, makeRegionAttachment('b', 'page1', 8)),
            makeSlot('slot2', 0, makeRegionAttachment('c', 'page1', 8)),
        ];
        const node = mockSpineNode(slots);
        const result = analyzeSpine(node);

        expect(result.blendModeTransitions).toBe(2);
        // Active non-normal slots = 1 (only slot1).
        expect(result.renderingImpact!.blendModes).toBe(1);
        // RI = (1 * 3) + (0 * 5) + (12 / 200) = 3.06
        expect(result.renderingImpact!.total).toBeCloseTo(3.06, 2);
    });

    it('counts clipping masks and includes their vertex cost', () => {
        const slots = [
            makeSlot('clip', 0, makeClippingAttachment('clipper')),
            makeSlot('slot0', 0, makeRegionAttachment('a', 'page1', 400)),
        ];
        const node = mockSpineNode(slots);
        const result = analyzeSpine(node);

        expect(result.renderingImpact!.clippingMasks).toBe(1);
        // No active non-normal blend slot (both are blend=0=normal).
        // RI = (0 * 3) + (1 * 5) + (200 / 200) = 6
        expect(result.renderingImpact!.blendModes).toBe(0);
        expect(result.renderingImpact!.total).toBeCloseTo(6, 2);
    });

    it('counts atlas page switches', () => {
        const slots = [
            makeSlot('slot0', 0, makeRegionAttachment('a', 'page1', 8)),
            makeSlot('slot1', 0, makeRegionAttachment('b', 'page2', 8)),
        ];
        const node = mockSpineNode(slots);
        const result = analyzeSpine(node);

        expect(result.atlasPageSwitches).toBe(1);
        expect(result.estimatedDrawCalls).toBe(2); // initial + page switch
    });
});

// ────────────────────────────────────────────────────────────────
// analyzeSpine - CI formula
// ────────────────────────────────────────────────────────────────

describe('analyzeSpine - Computational Impact', () => {
    it('computes CI = 0 for a skeleton with no constraints and no meshes', () => {
        const slots = [
            makeSlot('slot0', 0, makeRegionAttachment('img', 'page1', 8)),
        ];
        const node = mockSpineNode(slots);
        const result = analyzeSpine(node);

        // No meshes (regions don't have triangles), no constraints -> CI vertex only from RI walk
        expect(result.computationalImpact).toBeDefined();
        expect(result.computationalImpact!.total).toBeCloseTo(0, 4);
        expect(result.computationalImpact!.level).toBe('minimal');
    });

    it('computes constraint cost with per-bone canonical weights', () => {
        const slots = [
            makeSlot('slot0', 0, makeRegionAttachment('img', 'page1', 8)),
        ];
        // 2 IK, 1 transform, 1 path, 1 physics (each constraint has 2 bones, mix=1)
        const node = mockSpineNode(slots, { ik: 2, transform: 1, path: 1, physics: 1 });
        const result = analyzeSpine(node);

        // constraintBones: ik=4, path=2, transform=2
        // Per-bone weights are calibrated so that 2-bone chains at mix=1
        // reproduce the basic per-constraint formula exactly:
        //   (1 * 0.7) + (2 * 0.275) + (4 * 0.175) + (2 * 0.10)
        // = (1 * 0.7) + (1 * 0.55)  + (2 * 0.35)  + (1 * 0.20) = 2.15
        const expected = (1 * 0.7) + (1 * 0.55) + (2 * 0.35) + (1 * 0.20);
        expect(result.computationalImpact!.total).toBeCloseTo(expected, 4);
        expect(result.computationalImpact!.ikBones).toBeCloseTo(4);
        expect(result.computationalImpact!.pathBones).toBeCloseTo(2);
        expect(result.computationalImpact!.transformBones).toBeCloseTo(2);
    });

    it('computes per-mesh capped cost with bone influence scaling', () => {
        // 2 meshes: one weighted+deformed (200 verts, avg 2 bone influences), one plain (100 verts)
        // bones=[2, 0, 1] -> spine-core format: 1 vertex with 2 bone influences -> avg = 2
        const slots = [
            makeSlot('mesh1', 0,
                makeMeshAttachment('m1', 'page1', 400, { bones: [2, 0, 1] }),
                { deform: [1, 2, 3] },
            ),
            makeSlot('mesh2', 0,
                makeMeshAttachment('m2', 'page1', 200),
            ),
        ];
        const node = mockSpineNode(slots);
        const result = analyzeSpine(node);

        // Per-mesh cost (enhanced path via meshDetails). The weighted
        // multiplier is normalized to a baseline of 2 influences/vertex,
        // so a 2-influence mesh reproduces the basic-path weighted weight.
        // mesh1 (200 verts, deformed + weighted, boneInfluences=2):
        //   deformed: 0.08 + min(0.5, 200/500) = 0.48
        //   weighted: (0.1 + min(0.55, 200/450)) * (2/2) = 0.5444 * 1 = 0.5444
        // mesh2 (100 verts, plain): no per-mesh cost
        // base vertex cost: 300/2000 = 0.15
        const deformedCost = 0.08 + Math.min(0.5, 200 / 500);
        const weightedCost = (0.1 + Math.min(0.55, 200 / 450)) * (2 / 2);
        const meshCost = deformedCost + weightedCost + 300 / 2000;

        expect(result.computationalImpact!.deformedMeshes).toBe(1);
        expect(result.computationalImpact!.weightedMeshes).toBe(1);
        expect(result.computationalImpact!.avgBoneInfluences).toBeCloseTo(2);
        expect(result.computationalImpact!.activeMeshes).toBe(2);
        expect(result.computationalImpact!.total).toBeCloseTo(meshCost, 4);
    });

    it('physics constraints contribute the highest constraint weight', () => {
        const slots = [makeSlot('slot0', 0, makeRegionAttachment('a', 'page1', 8))];
        const withPhysics = mockSpineNode(slots, { physics: 3 });
        const result = analyzeSpine(withPhysics);

        expect(result.computationalImpact!.physics).toBe(3);
        // Single source of truth: physicsCost = 3 * 0.7 = 2.1 (formula owned
        // by @spine-benchmark/metrics-impact-formula).
        expect(result.computationalImpact!.total).toBeCloseTo(2.1, 4);
    });

    it('skips inactive constraints (heatmap parity)', () => {
        // Build a skeleton with two physics constraints, only one active.
        const slots = [makeSlot('slot0', 0, makeRegionAttachment('a', 'page1', 8))];
        const node = mockSpineNode(slots);
        const skeleton = (node as any).skeleton;
        skeleton.physicsConstraints = [
            { active: true, mix: 1 },
            { active: false, mix: 1 },
        ];

        const result = analyzeSpine(node);
        expect(result.computationalImpact!.physics).toBe(1);
        expect(result.computationalImpact!.total).toBeCloseTo(0.7, 4);
    });

    it('scales constraint cost by mix and bone count', () => {
        const slots = [makeSlot('slot0', 0, makeRegionAttachment('a', 'page1', 8))];
        const node = mockSpineNode(slots);
        const skeleton = (node as any).skeleton;
        // IK with 3 bones and mix=0.5 -> ikBones = 3 * 0.5 = 1.5
        skeleton.ikConstraints = [{ active: true, mix: 0.5, bones: [{}, {}, {}] }];
        // Physics with mix=0 -> skipped entirely
        skeleton.physicsConstraints = [{ active: true, mix: 0 }];
        skeleton.transformConstraints = [];
        skeleton.pathConstraints = [];

        const result = analyzeSpine(node);
        expect(result.computationalImpact!.ik).toBe(1);
        expect(result.computationalImpact!.ikBones).toBeCloseTo(1.5);
        expect(result.computationalImpact!.physics).toBe(0); // skipped due to mix=0
        // constraintCost = 0 (physics) + 0 (path) + 1.5*0.175 (ik) + 0 (transform) = 0.2625
        expect(result.computationalImpact!.total).toBeCloseTo(0.2625, 4);
    });
});

// ────────────────────────────────────────────────────────────────
// analyzeSpine - draw call estimation
// ────────────────────────────────────────────────────────────────

describe('analyzeSpine - draw call estimation', () => {
    it('returns 0 draw calls for empty skeleton', () => {
        const node = mockSpineNode([]);
        const result = analyzeSpine(node);
        expect(result.estimatedDrawCalls).toBe(0);
    });

    it('returns 1 draw call for a single renderable slot', () => {
        const slots = [
            makeSlot('slot0', 0, makeRegionAttachment('img', 'page1')),
        ];
        const node = mockSpineNode(slots);
        const result = analyzeSpine(node);
        expect(result.estimatedDrawCalls).toBe(1);
    });

    it('batches slots with same blend mode and atlas page', () => {
        const slots = [
            makeSlot('slot0', 0, makeRegionAttachment('a', 'page1')),
            makeSlot('slot1', 0, makeRegionAttachment('b', 'page1')),
            makeSlot('slot2', 0, makeRegionAttachment('c', 'page1')),
        ];
        const node = mockSpineNode(slots);
        const result = analyzeSpine(node);
        expect(result.estimatedDrawCalls).toBe(1); // all batched
    });

    it('breaks batch on blend mode change', () => {
        const slots = [
            makeSlot('slot0', 0, makeRegionAttachment('a', 'page1')),
            makeSlot('slot1', 1, makeRegionAttachment('b', 'page1')), // additive
        ];
        const node = mockSpineNode(slots);
        const result = analyzeSpine(node);
        expect(result.estimatedDrawCalls).toBe(2);
        expect(result.breaks.length).toBe(1);
        expect(result.breaks[0].reason).toBe('blend_mode_change');
    });

    it('breaks batch on atlas page switch', () => {
        const slots = [
            makeSlot('slot0', 0, makeRegionAttachment('a', 'page1')),
            makeSlot('slot1', 0, makeRegionAttachment('b', 'page2')),
        ];
        const node = mockSpineNode(slots);
        const result = analyzeSpine(node);
        expect(result.estimatedDrawCalls).toBe(2);
        expect(result.breaks[0].reason).toBe('atlas_page_switch');
    });

    it('adds draw call for clipping start', () => {
        const slots = [
            makeSlot('clip', 0, makeClippingAttachment('clipper')),
            makeSlot('slot0', 0, makeRegionAttachment('a', 'page1')),
        ];
        const node = mockSpineNode(slots);
        const result = analyzeSpine(node);
        // clipping start = 1 DC, then slot0 = 1 DC
        expect(result.estimatedDrawCalls).toBe(2);
    });

    it('skips invisible slots', () => {
        const slots = [
            makeSlot('slot0', 0, makeRegionAttachment('a', 'page1')),
            makeSlot('hidden', 0, makeRegionAttachment('b', 'page2'), { invisible: true }),
            makeSlot('slot1', 0, makeRegionAttachment('c', 'page1')),
        ];
        const node = mockSpineNode(slots);
        const result = analyzeSpine(node);
        // hidden slot skipped, slot0 and slot1 are same page -> 1 DC
        expect(result.estimatedDrawCalls).toBe(1);
        expect(result.activeSlots).toBe(2);
    });

    it('skips zero-alpha slots', () => {
        const slots = [
            makeSlot('slot0', 0, makeRegionAttachment('a', 'page1')),
            makeSlot('faded', 0, makeRegionAttachment('b', 'page2'), { alpha: 0 }),
        ];
        const node = mockSpineNode(slots);
        const result = analyzeSpine(node);
        expect(result.estimatedDrawCalls).toBe(1);
        expect(result.activeSlots).toBe(1);
    });
});

// ────────────────────────────────────────────────────────────────
// analyzeSpine - slot breakdown
// ────────────────────────────────────────────────────────────────

describe('analyzeSpine - slot breakdown', () => {
    it('classifies attachment types correctly', () => {
        const slots = [
            makeSlot('region', 0, makeRegionAttachment('r', 'page1')),
            makeSlot('mesh', 0, makeMeshAttachment('m', 'page1', 100)),
            makeSlot('clip', 0, makeClippingAttachment('c')),
            makeSlot('empty', 0, null),
        ];
        const node = mockSpineNode(slots);
        const result = analyzeSpine(node);

        expect(result.slotBreakdown[0].attachmentType).toBe('region');
        expect(result.slotBreakdown[1].attachmentType).toBe('mesh');
        expect(result.slotBreakdown[2].attachmentType).toBe('clipping');
        expect(result.slotBreakdown[3].attachmentType).toBe('none');
    });

    it('tracks atlas pages used', () => {
        const slots = [
            makeSlot('s1', 0, makeRegionAttachment('a', 'atlas-page-1')),
            makeSlot('s2', 0, makeRegionAttachment('b', 'atlas-page-2')),
            makeSlot('s3', 0, makeRegionAttachment('c', 'atlas-page-1')),
        ];
        const node = mockSpineNode(slots);
        const result = analyzeSpine(node);

        expect(result.atlasPages).toEqual(
            expect.arrayContaining(['atlas-page-1', 'atlas-page-2']),
        );
        expect(result.atlasPages.length).toBe(2);
    });
});

// ────────────────────────────────────────────────────────────────
// Integration: RI+CI level propagation with custom brackets
// ────────────────────────────────────────────────────────────────

// ────────────────────────────────────────────────────────────────
// Heatmap parity: feeding the same skeleton into the crawler must produce
// the EXACT same RI/CI numbers a heatmap caller would compute by running
// the leaf-package formula on equivalent inputs.
// ────────────────────────────────────────────────────────────────

describe('analyzeSpine - heatmap parity', () => {
    it('crawler RI/CI equals leaf-formula output for identical inputs', () => {
        // Build a non-trivial skeleton: 4 visible slots (1 additive, 1 with
        // a clipping mask, 2 region+mesh), 1 physics + 1 ik constraint.
        // bones=[2, 0, 1] -> 1 vertex with 2 bone influences -> avg = 2
        const slots = [
            makeSlot('region', 0, makeRegionAttachment('r', 'page1', 8)),
            makeSlot('additive', 1, makeRegionAttachment('a', 'page1', 8)),
            makeSlot('clip', 0, makeClippingAttachment('clipper')),
            makeSlot('mesh', 0, makeMeshAttachment('m', 'page1', 200, { bones: [2, 0, 1] }), {
                deform: [1, 2],
            }),
        ];
        const node = mockSpineNode(slots, { physics: 1, ik: 1 });
        const result = analyzeSpine(node);

        // Independently compute what the heatmap would emit for the same
        // observation: 1 active non-normal blend, 1 clipping mask, vertices
        // = 4 (region) + 4 (additive) + 100 (mesh) = 108.
        const expectedRI = renderingImpactCost({
            activeNonNormalBlends: 1,
            activeClippingMasks: 1,
            totalVertices: 108,
        });

        // Enhanced CI: per-bone constraint weights, per-mesh details, no mixing
        // Each constraint has 2 bones (from makeConstraints default), mix=1
        // constraintBones: ik=2, path=0, transform=0
        const expectedCI = computationalImpactCost({
            constraints: { physics: 1, path: 0, ik: 1, transform: 0 },
            constraintBones: { ik: 2, path: 0, transform: 0 },
            totalVertices: 100, // only the mesh contributes to mesh stats
            activeMeshCount: 1,
            weightedMeshCount: 1,
            deformedMeshCount: 1,
            meshDetails: [
                { vertices: 100, weighted: true, deformed: true, boneInfluences: 2 },
            ],
            mixingDepth: 0,
        });

        expect(result.renderingImpact!.total).toBeCloseTo(expectedRI, 6);
        expect(result.computationalImpact!.total).toBeCloseTo(expectedCI, 6);
    });

    it('includes mixing depth from animation state tracks', () => {
        const slots = [
            makeSlot('slot0', 0, makeRegionAttachment('a', 'page1', 8)),
        ];
        // Simulate a layered crossfade: track 0 is mixing from a previous
        // animation that was itself still mixing from an earlier one - a
        // 2-entry mixingFrom chain past the head track entry.
        const track0 = { mixingFrom: { mixingFrom: { mixingFrom: null } } };
        const state = { tracks: [track0] };
        const node = mockSpineNode(slots, {}, state);
        const result = analyzeSpine(node);

        // mixingDepth counts only the mixingFrom chain (extras beyond the
        // baseline single-track playback): 2 mixingFrom entries -> 2.
        expect(result.computationalImpact!.mixingDepth).toBe(2);
    });
});

describe('analyzeSpine - custom brackets propagation', () => {
    it('uses provided brackets for RI and CI classification', () => {
        // Two visible additive (non-normal) slots so the RI is high enough
        // to cross multiple brackets.
        const slots = [
            makeSlot('s0', 1, makeRegionAttachment('a', 'page1', 8)),
            makeSlot('s1', 1, makeRegionAttachment('b', 'page1', 8)),
        ];
        const node = mockSpineNode(slots);

        // RI = (2 active non-normal * 3) + 0 + 8/200 = 6.04
        // Default brackets [3,8,15,25]: 6.04 -> "low".
        const defaultResult = analyzeSpine(node);
        expect(defaultResult.renderingImpact!.level).toBe('low');

        // Tight brackets [1,2,3,4]: 6.04 -> "very-high".
        const tightResult = analyzeSpine(node, [1, 2, 3, 4]);
        expect(tightResult.renderingImpact!.level).toBe('very-high');
    });
});
