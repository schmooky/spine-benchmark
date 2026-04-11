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

function makeConstraints(count: number, active = true) {
    return Array.from({ length: count }, () => ({ active }));
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
): Container {
    const skeleton = makeSkeleton(drawOrder, constraints);
    return { skeleton } as unknown as Container;
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

    it('computes constraint cost with canonical weights', () => {
        const slots = [
            makeSlot('slot0', 0, makeRegionAttachment('img', 'page1', 8)),
        ];
        // 2 IK, 1 transform, 1 path, 1 physics
        const node = mockSpineNode(slots, { ik: 2, transform: 1, path: 1, physics: 1 });
        const result = analyzeSpine(node);

        // constraintCost = (1 × 0.7) + (1 × 0.55) + (2 × 0.35) + (1 × 0.2) = 2.15
        const expected = (1 * 0.7) + (1 * 0.55) + (2 * 0.35) + (1 * 0.2);
        expect(result.computationalImpact!.total).toBeCloseTo(expected, 4);
    });

    it('computes mesh cost with vertex-scaled weights', () => {
        // 2 meshes: one weighted+deformed (200 verts), one plain mesh (100 verts)
        const slots = [
            makeSlot('mesh1', 0,
                makeMeshAttachment('m1', 'page1', 400, { bones: [0, 1, 2] }),
                { deform: [1, 2, 3] },
            ),
            makeSlot('mesh2', 0,
                makeMeshAttachment('m2', 'page1', 200),
            ),
        ];
        const node = mockSpineNode(slots);
        const result = analyzeSpine(node);

        const totalVerts = 200 + 100; // 400/2 + 200/2
        const avgVerts = totalVerts / 2; // 2 active meshes
        const deformedWeight = 0.08 + Math.min(0.5, avgVerts / 500);
        const weightedWeight = 0.1 + Math.min(0.55, avgVerts / 450);

        // mesh1 is both weighted and deformed
        const meshCost =
            (1 * deformedWeight) +  // 1 deformed mesh
            (1 * weightedWeight) +  // 1 weighted mesh
            (totalVerts / 2000);

        expect(result.computationalImpact!.deformedMeshes).toBe(1);
        expect(result.computationalImpact!.weightedMeshes).toBe(1);
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
        skeleton.physicsConstraints = [{ active: true }, { active: false }];

        const result = analyzeSpine(node);
        expect(result.computationalImpact!.physics).toBe(1);
        expect(result.computationalImpact!.total).toBeCloseTo(0.7, 4);
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
        const slots = [
            makeSlot('region', 0, makeRegionAttachment('r', 'page1', 8)),
            makeSlot('additive', 1, makeRegionAttachment('a', 'page1', 8)),
            makeSlot('clip', 0, makeClippingAttachment('clipper')),
            makeSlot('mesh', 0, makeMeshAttachment('m', 'page1', 200, { bones: [0, 1] }), {
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
        const expectedCI = computationalImpactCost({
            constraints: { physics: 1, path: 0, ik: 1, transform: 0 },
            totalVertices: 100, // only the mesh contributes to mesh stats
            activeMeshCount: 1,
            weightedMeshCount: 1,
            deformedMeshCount: 1,
        });

        expect(result.renderingImpact!.total).toBeCloseTo(expectedRI, 6);
        expect(result.computationalImpact!.total).toBeCloseTo(expectedCI, 6);
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
