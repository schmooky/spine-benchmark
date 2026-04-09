/**
 * Deep Spine analysis - inspects skeleton draw order at runtime
 * to compute actual draw call fragmentation from blend mode transitions,
 * atlas page switches, and clipping boundaries.
 *
 * RI/CI numbers come from `@spine-benchmark/metrics-impact-formula`, the
 * single source of truth shared with the offline benchmark. This file MUST
 * NOT contain any hardcoded scoring constants  -  if you find yourself reaching
 * for a magic number, add it to the leaf package instead so the live
 * crawler readings stay 1:1 with the offline analysis.
 */

import type { Container } from 'pixi.js';
import {
    classifyImpactLevel,
    computationalImpactCost as sharedComputationalImpactCost,
    renderingImpactCost as sharedRenderingImpactCost,
    type ImpactLevel,
} from '@spine-benchmark/metrics-impact-formula';
import type {
    SpineAnalysis,
    SpineSlotInfo,
    SpineBatchBreak,
    RenderingImpact,
    ComputationalImpact,
} from './types.js';

// ── Duck-typed Spine runtime interfaces ─────────────────────
// Avoids hard dependency on @esotericsoftware/spine-core.

interface SpineSlot {
    data: {
        name: string;
        blendMode: number; // BlendMode enum: 0=Normal,1=Additive,2=Multiply,3=Screen
    };
    color: { a: number };
    attachment: SpineAttachment | null;
    /** Owning bone. `bone.active === false` means the slot is currently hidden. */
    bone?: { active?: boolean };
    /** Deform values applied to the slot's attachment. Non-empty when actively deformed. */
    deform?: number[];
}

/**
 * Canonical "is this slot currently rendering?" predicate. Aligned with the
 * benchmark heatmap (`apps/benchmark/src/hooks/useAnimationHeatmap.ts`) so
 * that feeding the same skeleton into the crawler and the heatmap at the
 * same instant produces identical RI/CI inputs (and therefore identical
 * scores via the shared formula package).
 *
 * Earlier versions read `slot.data.visible`, which does not exist on the
 * real `spine-core` `SlotData` shape  -  the read returned `undefined` and
 * the crawler treated every slot as invisible against live Spine instances,
 * silently zeroing out RI / CI in production.
 */
function isSlotActive(slot: SpineSlot): boolean {
    if ((slot.color?.a ?? 1) <= 0) return false;
    if (slot.bone && slot.bone.active === false) return false;
    return true;
}

interface SpineAttachment {
    name: string;
    region?: SpineRegion | null;
    type?: number;
    /** Present on ClippingAttachment */
    endSlot?: unknown;
    /** worldVerticesLength / 2 = vertex count. Present on VertexAttachment (Region, Mesh). */
    worldVerticesLength?: number;
    /** Bone indices for weighted meshes. null = unweighted. */
    bones?: number[] | null;
    /** Present on MeshAttachment - triangle index array */
    triangles?: number[];
}

interface SpineRegion {
    page?: SpineAtlasPage;
    name?: string;
}

interface SpineAtlasPage {
    name: string;
    width: number;
    height: number;
}

/** Duck-typed Spine runtime shape - avoids hard dep on @esotericsoftware/spine-core. */
export interface SpineLike {
    skeleton?: {
        slots: SpineSlot[];
        drawOrder: SpineSlot[];
        data?: {
            name?: string;
        };
        ikConstraints?: unknown[];
        transformConstraints?: unknown[];
        pathConstraints?: unknown[];
        physicsConstraints?: unknown[];
    };
    state?: {
        tracks?: (unknown | null)[];
    };
}

// ═════════════════════════════════════════════════════════════
// Adapters: walk a live skeleton/draw order, hand the resulting counts
// to the shared formula. No constants live here.
// ═════════════════════════════════════════════════════════════

function buildRenderingImpact(
    activeNonNormalBlends: number,
    clippingMasks: number,
    totalVertices: number,
    brackets?: [number, number, number, number],
): RenderingImpact {
    const total = sharedRenderingImpactCost({
        activeNonNormalBlends,
        activeClippingMasks: clippingMasks,
        totalVertices,
    });

    return {
        // `blendModes` semantics: count of CURRENTLY VISIBLE slots whose
        // blend mode is non-normal  -  same definition the heatmap uses.
        // Earlier versions stored draw-call-side `blendModeTransitions` here,
        // which produced different numbers from the offline benchmark even
        // though the formula constants matched.
        blendModes: activeNonNormalBlends,
        clippingMasks,
        vertices: totalVertices,
        total,
        level: classifyImpactLevel(total, brackets),
    };
}

interface MeshStats {
    totalVertices: number;
    activeMeshCount: number;
    weightedMeshCount: number;
    deformedMeshCount: number;
}

interface ConstraintCounts {
    ik: number;
    transform: number;
    path: number;
    physics: number;
}

/**
 * Spine `Constraint.active` defaults to `true` and may be toggled by the
 * runtime (e.g. inactive skin slots, mix-out of constraint controllers).
 * The benchmark heatmap counts active constraints only  -  the crawler must
 * do the same or it will overshoot CI on skeletons with deactivated
 * constraints, breaking parity with the offline benchmark.
 */
function isConstraintActive(constraint: unknown): boolean {
    if (!constraint || typeof constraint !== 'object') return false;
    const candidate = constraint as { active?: boolean };
    if (typeof candidate.active === 'boolean') return candidate.active;
    return true;
}

function countActive(list: unknown[] | undefined): number {
    if (!list) return 0;
    let n = 0;
    for (const c of list) if (isConstraintActive(c)) n++;
    return n;
}

function analyzeConstraints(skeleton: SpineLike['skeleton']): ConstraintCounts {
    if (!skeleton) {
        return { ik: 0, transform: 0, path: 0, physics: 0 };
    }

    return {
        ik: countActive(skeleton.ikConstraints),
        transform: countActive(skeleton.transformConstraints),
        path: countActive(skeleton.pathConstraints),
        physics: countActive(skeleton.physicsConstraints),
    };
}

/**
 * Analyze meshes by reading real vertex counts from attachments
 * and checking bones/deform arrays for weighted/deformed status.
 */
function analyzeMeshes(drawOrder: SpineSlot[]): MeshStats {
    let totalVertices = 0;
    let activeMeshCount = 0;
    let weightedMeshCount = 0;
    let deformedMeshCount = 0;

    for (const slot of drawOrder) {
        const att = slot.attachment;
        if (!att) continue;
        if (!isSlotActive(slot)) continue;

        // Is it a mesh? Check for triangles array (MeshAttachment)
        const isMesh = att.triangles != null;
        if (!isMesh) continue;

        activeMeshCount++;

        // Read real vertex count: worldVerticesLength is in floats (x,y pairs),
        // so divide by 2 for vertex count
        const vertCount = (att.worldVerticesLength ?? 0) / 2;
        totalVertices += vertCount;

        // Weighted mesh: has bone indices
        if (att.bones != null && att.bones.length > 0) {
            weightedMeshCount++;
        }

        // Deformed mesh: slot.deform has non-zero-length array when actively deformed
        if (slot.deform != null && slot.deform.length > 0) {
            deformedMeshCount++;
        }
    }

    return { totalVertices, activeMeshCount, weightedMeshCount, deformedMeshCount };
}

function buildComputationalImpact(
    skeleton: SpineLike['skeleton'],
    drawOrder: SpineSlot[],
    brackets?: [number, number, number, number],
): ComputationalImpact {
    const c = analyzeConstraints(skeleton);
    const m = analyzeMeshes(drawOrder);

    const total = sharedComputationalImpactCost({
        constraints: {
            physics: c.physics,
            path: c.path,
            ik: c.ik,
            transform: c.transform,
        },
        totalVertices: m.totalVertices,
        activeMeshCount: m.activeMeshCount,
        weightedMeshCount: m.weightedMeshCount,
        deformedMeshCount: m.deformedMeshCount,
    });

    return {
        physics: c.physics,
        path: c.path,
        ik: c.ik,
        weightedMeshes: m.weightedMeshCount,
        transform: c.transform,
        deformedMeshes: m.deformedMeshCount,
        total,
        level: classifyImpactLevel(total, brackets),
    };
}

// ═════════════════════════════════════════════════════════════
// Public API
// ═════════════════════════════════════════════════════════════

/**
 * Check if a pixi node is a Spine instance.
 * We do duck-typing since the Spine class might not be imported.
 */
export function isSpine(node: Container): node is Container & SpineLike {
    const s = node as unknown as SpineLike;
    return (
        s.skeleton != null &&
        Array.isArray(s.skeleton.slots) &&
        Array.isArray(s.skeleton.drawOrder)
    );
}

/**
 * Perform deep analysis of a Spine's draw order to find DC fragmentation,
 * then compute RI and CI using the canonical metrics-reporting formulas.
 *
 * @param brackets Optional impact level brackets [low, moderate, high, veryHigh].
 *                 Defaults to metrics-reporting values [3, 8, 15, 25].
 */
export function analyzeSpine(
    node: Container,
    brackets?: [number, number, number, number],
): SpineAnalysis {
    const spine = node as unknown as SpineLike;
    const skeleton = spine.skeleton!;
    const drawOrder = skeleton.drawOrder;

    const slotBreakdown: SpineSlotInfo[] = [];
    const breaks: SpineBatchBreak[] = [];
    const atlasPageSet = new Set<string>();

    let prevBlend = -1;
    let prevPage: string | null = null;
    let prevSlotName = '';
    let activeSlots = 0;
    let drawCalls = 0;
    let blendTransitions = 0;
    let pageSwitches = 0;
    let inClipping = false;

    // RI inputs accumulated during the draw-order walk. Definitions match
    // the heatmap: only currently visible slots count, blend mode is read
    // off `slot.data.blendMode`, vertex totals come from real attachment
    // worldVerticesLength.
    let totalVertices = 0;
    let clippingMasks = 0;
    let activeNonNormalBlends = 0;

    for (const slot of drawOrder) {
        const slotData = slot.data;
        const attachment = slot.attachment;
        const visible = isSlotActive(slot);

        // Classify attachment
        let attachmentType: SpineSlotInfo['attachmentType'] = 'none';
        let atlasPage: string | null = null;
        let attachmentName: string | null = null;

        if (attachment) {
            attachmentName = attachment.name;

            if (attachment.endSlot !== undefined) {
                // ClippingAttachment
                attachmentType = 'clipping';
                if (visible) clippingMasks++;
            } else if (attachment.region?.page) {
                // Region or Mesh with texture
                const isMesh = attachment.triangles != null;
                attachmentType = isMesh ? 'mesh' : 'region';
                const page = attachment.region.page;
                atlasPage = page.name;
                atlasPageSet.add(atlasPage);

                // Accumulate real vertex count for RI
                if (visible) {
                    const verts = (attachment.worldVerticesLength ?? 0) / 2;
                    totalVertices += verts;
                }
            } else {
                attachmentType = 'other';
            }
        }

        slotBreakdown.push({
            name: slotData.name,
            blendMode: slotData.blendMode,
            attachmentName,
            attachmentType,
            atlasPage,
            visible,
        });

        if (!visible || !attachment) continue;

        // RI input: count slots whose blend mode is non-normal. The crawler
        // also tracks `blendTransitions` separately for draw-call counting,
        // but the formula expects active-non-normal counts (heatmap parity).
        if (slotData.blendMode !== 0 && attachmentType !== 'clipping') {
            activeNonNormalBlends++;
        }

        // Clipping handling
        if (attachmentType === 'clipping') {
            if (!inClipping) {
                inClipping = true;
                drawCalls++; // clipping start = stencil draw call
                breaks.push({
                    afterSlot: prevSlotName,
                    beforeSlot: slotData.name,
                    reason: 'clipping_start',
                    detail: `Clipping begins at ${slotData.name}`,
                });
            }
            continue;
        }

        // For renderable attachments
        activeSlots++;

        const currentBlend = slotData.blendMode;
        const currentPage = atlasPage;

        // First renderable slot always costs 1 DC
        if (drawCalls === 0) {
            drawCalls = 1;
            prevBlend = currentBlend;
            prevPage = currentPage;
            prevSlotName = slotData.name;
            continue;
        }

        // Check for batch breaks
        let broke = false;

        // Blend mode transition
        if (currentBlend !== prevBlend) {
            blendTransitions++;
            drawCalls++;
            broke = true;
            breaks.push({
                afterSlot: prevSlotName,
                beforeSlot: slotData.name,
                reason: 'blend_mode_change',
                detail: `${blendName(prevBlend)} -> ${blendName(currentBlend)}`,
            });
        }

        // Atlas page switch (only matters if blend didn't already break)
        if (
            !broke &&
            currentPage !== null &&
            prevPage !== null &&
            currentPage !== prevPage
        ) {
            pageSwitches++;
            drawCalls++;
            broke = true;
            breaks.push({
                afterSlot: prevSlotName,
                beforeSlot: slotData.name,
                reason: 'atlas_page_switch',
                detail: `${prevPage} -> ${currentPage}`,
            });
        }

        prevBlend = currentBlend;
        prevPage = currentPage;
        prevSlotName = slotData.name;
    }

    // RI uses real per-slot counts accumulated during the draw-order walk
    // above (active non-normal blend slots, active clipping masks, sum of
    // visible mesh vertices)  -  same definition the heatmap uses.
    const renderingImpact = buildRenderingImpact(activeNonNormalBlends, clippingMasks, totalVertices, brackets);

    // CI reads constraints + mesh properties from skeleton/drawOrder and
    // delegates the math to the shared formula package.
    const computationalImpact = buildComputationalImpact(skeleton, drawOrder, brackets);

    return {
        totalSlots: drawOrder.length,
        activeSlots,
        estimatedDrawCalls: drawCalls,
        blendModeTransitions: blendTransitions,
        atlasPageSwitches: pageSwitches,
        atlasPages: [...atlasPageSet],
        slotBreakdown,
        breaks,
        renderingImpact,
        computationalImpact,
    };
}

function blendName(mode: number): string {
    switch (mode) {
        case 0: return 'normal';
        case 1: return 'additive';
        case 2: return 'multiply';
        case 3: return 'screen';
        default: return `unknown(${mode})`;
    }
}
