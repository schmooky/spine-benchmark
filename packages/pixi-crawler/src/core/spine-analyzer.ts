/**
 * Deep Spine analysis - inspects skeleton draw order at runtime
 * to compute actual draw call fragmentation from blend mode transitions,
 * atlas page switches, and clipping boundaries.
 *
 * RI/CI formulas are aligned with @spine-benchmark/metrics-reporting
 * and @spine-benchmark/metrics-scoring (impactReportModel / scoreCalculator).
 */

import type { Container } from 'pixi.js';
import type {
    SpineAnalysis,
    SpineSlotInfo,
    SpineBatchBreak,
    RenderingImpact,
    ComputationalImpact,
    ImpactLevel,
} from './types.js';
import { classifyImpactLevel } from './types.js';

// ── Duck-typed Spine runtime interfaces ─────────────────────
// Avoids hard dependency on @esotericsoftware/spine-core.

interface SpineSlot {
    data: {
        name: string;
        blendMode: number; // BlendMode enum: 0=Normal,1=Additive,2=Multiply,3=Screen
        visible: boolean;
    };
    color: { a: number };
    attachment: SpineAttachment | null;
    /** Deform values applied to the slot's attachment. Non-empty when actively deformed. */
    deform?: number[];
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
    /** Present on MeshAttachment — triangle index array */
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
// RI formula (matches metrics-reporting/impactReportModel.ts)
//
//   RI = (activeNonNormalBlendModes × 3)
//      + (activeMaskCount × 5)
//      + (totalVertices / 200)
//
// Impact thresholds: <3 minimal, <8 low, <15 moderate, <25 high, ≥25 very-high
// ═════════════════════════════════════════════════════════════

function calculateRI(
    blendModeTransitions: number,
    clippingMasks: number,
    totalVertices: number,
    brackets?: [number, number, number, number],
): RenderingImpact {
    const total = (blendModeTransitions * 3) + (clippingMasks * 5) + (totalVertices / 200);

    return {
        blendModes: blendModeTransitions,
        clippingMasks,
        vertices: totalVertices,
        total,
        level: classifyImpactLevel(total, brackets),
    };
}

// ═════════════════════════════════════════════════════════════
// CI formula (matches metrics-reporting/impactReportModel.ts)
//
//   constraintCost = (physics × 0.7) + (path × 0.55)
//                  + (ik × 0.35) + (transform × 0.2)
//
//   avgVerts = totalVertices / activeMeshCount  (0 if no meshes)
//
//   deformedMeshWeight = 0.08 + min(0.5, avgVerts / 500)
//   weightedMeshWeight = 0.1  + min(0.55, avgVerts / 450)
//
//   meshCost = (deformedMeshCount × deformedMeshWeight)
//            + (weightedMeshCount × weightedMeshWeight)
//            + (totalVertices / 2000)
//
//   CI = constraintCost + meshCost
//
// Impact thresholds: <3 minimal, <8 low, <15 moderate, <25 high, ≥25 very-high
// ═════════════════════════════════════════════════════════════

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

function analyzeConstraints(skeleton: SpineLike['skeleton']): ConstraintCounts {
    if (!skeleton) {
        return { ik: 0, transform: 0, path: 0, physics: 0 };
    }

    return {
        ik: skeleton.ikConstraints?.length ?? 0,
        transform: skeleton.transformConstraints?.length ?? 0,
        path: skeleton.pathConstraints?.length ?? 0,
        physics: skeleton.physicsConstraints?.length ?? 0,
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
        if (!slot.data.visible || slot.color.a <= 0) continue;

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

function calculateCI(
    skeleton: SpineLike['skeleton'],
    drawOrder: SpineSlot[],
    brackets?: [number, number, number, number],
): ComputationalImpact {
    const c = analyzeConstraints(skeleton);
    const m = analyzeMeshes(drawOrder);

    // Constraint cost (canonical weights from metrics-reporting)
    const constraintCost =
        (c.physics * 0.7) +
        (c.path * 0.55) +
        (c.ik * 0.35) +
        (c.transform * 0.2);

    // Mesh computation cost (vertex-count-scaled weights from metrics-reporting)
    const avgVerts = m.activeMeshCount > 0 ? m.totalVertices / m.activeMeshCount : 0;
    const deformedMeshWeight = 0.08 + Math.min(0.5, avgVerts / 500);
    const weightedMeshWeight = 0.1 + Math.min(0.55, avgVerts / 450);

    const meshCost =
        (m.deformedMeshCount * deformedMeshWeight) +
        (m.weightedMeshCount * weightedMeshWeight) +
        (m.totalVertices / 2000);

    const total = constraintCost + meshCost;

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

    // Also accumulate RI mesh data during the draw-order walk
    let totalVertices = 0;
    let clippingMasks = 0;

    for (const slot of drawOrder) {
        const slotData = slot.data;
        const attachment = slot.attachment;
        const visible = slotData.visible && slot.color.a > 0;

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

    // Calculate RI using real vertex counts accumulated above
    const renderingImpact = calculateRI(blendTransitions, clippingMasks, totalVertices, brackets);

    // Calculate CI by reading constraints + mesh properties from skeleton/drawOrder
    const computationalImpact = calculateCI(skeleton, drawOrder, brackets);

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
