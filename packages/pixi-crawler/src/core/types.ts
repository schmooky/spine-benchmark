import type { Container } from 'pixi.js';

/** Metadata we store per-node via WeakMap */
export interface NodeMeta {
    /** Unique cuid2 tag for this node in crawler's registry */
    uid: string;
    /** Human label: type + name or label */
    label: string;
    /** Node type classification */
    kind: NodeKind;
    /** Number of children at last scan */
    childCount: number;
    /** Whether this node is currently visible */
    visible: boolean;
    /** Whether this node has a mask applied */
    masked: boolean;
    /** Whether this node uses blend modes that break batching */
    blendBreak: boolean;
    /** Whether this node uses filters */
    hasFilters: boolean;
    /** Whether node has non-default render group / is isolated */
    isolated: boolean;
    /** Estimated draw calls this node contributes */
    drawCalls: number;
    /** Bounds width at last scan */
    boundsW: number;
    /** Bounds height at last scan */
    boundsH: number;
    /** World alpha at last scan */
    worldAlpha: number;
    /** Frame number when last scanned */
    lastScanFrame: number;
    /** Depth in the scene graph */
    depth: number;
    /** Issues detected for this node */
    issues: Issue[];
    /** Deep spine analysis (only present for kind === 'spine') */
    spineAnalysis?: SpineAnalysis;
    /** Mask analysis (only present when masked === true) */
    maskAnalysis?: MaskAnalysis;
    /** Spine budget metrics (only present for kind === 'spine') */
    spineBudget?: SpineBudget;
}

/** Deep analysis of a Spine object's draw call structure */
export interface SpineAnalysis {
    totalSlots: number;
    activeSlots: number;
    estimatedDrawCalls: number;
    blendModeTransitions: number;
    atlasPageSwitches: number;
    atlasPages: string[];
    slotBreakdown: SpineSlotInfo[];
    breaks: SpineBatchBreak[];
    /** Rendering Impact metrics */
    renderingImpact?: RenderingImpact;
    /** Computational Impact metrics */
    computationalImpact?: ComputationalImpact;
}

export interface SpineSlotInfo {
    name: string;
    blendMode: number;
    attachmentName: string | null;
    attachmentType: 'region' | 'mesh' | 'clipping' | 'none' | 'other';
    atlasPage: string | null;
    visible: boolean;
}

export interface SpineBatchBreak {
    afterSlot: string;
    beforeSlot: string;
    reason: 'blend_mode_change' | 'atlas_page_switch' | 'clipping_start' | 'clipping_end';
    detail: string;
}

/** Detailed mask analysis for a masked node */
export interface MaskAnalysis {
    /** What type of display object is used as the mask */
    maskType: 'graphics' | 'sprite' | 'unknown';
    /** Whether this mask is inside an already-masked ancestor */
    isNested: boolean;
    /** Label of the mask display object */
    maskNodeLabel: string;
    /** Estimated shape complexity (1=simple rect, higher=more draw instructions) */
    estimatedComplexity: number;
}

export type NodeKind =
    | 'container'
    | 'sprite'
    | 'graphics'
    | 'text'
    | 'bitmapText'
    | 'mesh'
    | 'spine'
    | 'particleContainer'
    | 'animatedSprite'
    | 'tilingSprite'
    | 'nineSlice'
    | 'htmlText'
    | 'unknown';

export interface Issue {
    severity: 'warn' | 'error' | 'info';
    code: IssueCode;
    message: string;
    frame: number;
}

export type IssueCode =
    | 'EXCESSIVE_CHILDREN'
    | 'DEEP_NESTING'
    | 'INVISIBLE_SUBTREE'
    | 'MASK_BREAK'
    | 'MASK_NESTED'
    | 'MASK_COMPLEX_SHAPE'
    | 'FILTER_BREAK'
    | 'BLEND_BREAK'
    | 'ZERO_ALPHA_VISIBLE'
    | 'OVERSIZED_TEXTURE'
    | 'SPINE_EXPENSIVE'
    | 'MANY_DRAW_CALLS'
    | 'EMPTY_CONTAINER'
    | 'OFF_SCREEN'
    | 'FREQUENT_REORDER'
    | 'SPINE_ATLAS_THRASH'
    | 'SPINE_BLEND_THRASH'
    | 'SPINE_MULTI_ATLAS'
    | 'SPINE_HIDDEN_UPDATING'
    | 'SPINE_HIGH_RI'
    | 'SPINE_HIGH_CI'
    | 'SPINE_HIGH_BUDGET';

/** Impact weight per issue code - higher = more GPU/CPU cost */
export const ISSUE_IMPACT: Record<IssueCode, number> = {
    SPINE_EXPENSIVE:    10,
    MASK_NESTED:         9,
    SPINE_HIGH_BUDGET:   9,
    SPINE_BLEND_THRASH:  8,
    SPINE_HIGH_RI:       8,
    SPINE_HIGH_CI:       7,
    SPINE_ATLAS_THRASH:  7,
    FILTER_BREAK:        7,
    MANY_DRAW_CALLS:     6,
    MASK_BREAK:          6,
    MASK_COMPLEX_SHAPE:  5,
    OVERSIZED_TEXTURE:   5,
    BLEND_BREAK:         4,
    EXCESSIVE_CHILDREN:  3,
    SPINE_MULTI_ATLAS:   3,
    FREQUENT_REORDER:    3,
    DEEP_NESTING:        2,
    INVISIBLE_SUBTREE:   2,
    ZERO_ALPHA_VISIBLE:  2,
    SPINE_HIDDEN_UPDATING: 4,
    OFF_SCREEN:          1,
    EMPTY_CONTAINER:     1,
};

/** Human-readable explanation + remediation for each issue */
export const ISSUE_EXPLAIN: Record<IssueCode, { what: string; fix: string }> = {
    SPINE_EXPENSIVE: {
        what: 'Spine uses too many draw calls. Each atlas page switch or blend mode change in the slot draw order forces a batch flush and new draw call.',
        fix:  'Repack atlas into fewer pages, reorder slots in Spine editor so same-atlas/same-blend slots are adjacent.',
    },
    SPINE_BLEND_THRASH: {
        what: 'Spine slots alternate between blend modes (Normal↔Additive) in draw order, each transition flushes the batch.',
        fix:  'Group all additive slots together at the end of the draw order in Spine editor. Avoid interleaving blend modes.',
    },
    SPINE_ATLAS_THRASH: {
        what: 'Spine draw order switches between different atlas pages. Each switch rebinds the GPU texture and flushes the batch.',
        fix:  'Pack all attachments onto one atlas page, or reorder slots so same-page slots are adjacent.',
    },
    SPINE_MULTI_ATLAS: {
        what: 'Spine references multiple atlas texture pages, increasing VRAM and the potential for texture switches.',
        fix:  'Consolidate into a single atlas page by reducing attachment sizes or using a larger atlas dimension.',
    },
    MASK_BREAK: {
        what: 'Mask causes a batch break: flush → write stencil → draw masked content → clear stencil (+2 draw calls).',
        fix:  'Minimize mask usage. For rectangular clips use container bounds or scissor rect. Consider pre-rendered mask textures.',
    },
    MASK_NESTED: {
        what: 'Mask inside an already-masked ancestor requires recursive stencil buffer operations - extremely expensive.',
        fix:  'Flatten the mask hierarchy. Pre-render inner masked content to a texture, or restructure the scene.',
    },
    MASK_COMPLEX_SHAPE: {
        what: 'The mask uses a complex Graphics shape with many draw instructions, increasing stencil fill cost.',
        fix:  'Simplify to a rectangle or rounded rect. For complex shapes, use a sprite mask with a pre-rendered alpha texture.',
    },
    FILTER_BREAK: {
        what: 'Filter allocates a temporary render texture, renders the subtree into it, applies the shader, then blits back.',
        fix:  'Use filters sparingly. Cache filtered results when static. Bake filter effects into textures at build time.',
    },
    BLEND_BREAK: {
        what: 'Non-normal blend mode (add/multiply/screen) forces a batch flush to change GPU blend state.',
        fix:  'Group same-blend-mode objects together. Use render groups to isolate blend regions.',
    },
    OVERSIZED_TEXTURE: {
        what: 'Texture exceeds size threshold - consumes excessive VRAM and causes slower sampling on mobile.',
        fix:  'Downscale, use mipmaps, split into smaller atlas pages, or load resolution-dependent variants.',
    },
    EXCESSIVE_CHILDREN: {
        what: 'Too many direct children cause slow iteration during render, sort, and event propagation.',
        fix:  'Use spatial partitioning, pool/recycle display objects, or flatten with render textures.',
    },
    DEEP_NESTING: {
        what: 'Deep nesting requires a long chain of matrix multiplications for world transform.',
        fix:  'Flatten the display hierarchy. Combine nested containers that serve no logical purpose.',
    },
    INVISIBLE_SUBTREE: {
        what: 'Invisible container with many hidden children still costs CPU for scene graph traversal.',
        fix:  'Remove from stage entirely or use object pooling to detach when hidden.',
    },
    ZERO_ALPHA_VISIBLE: {
        what: 'visible=true but effective alpha=0 - traversed but never rendered.',
        fix:  'Set visible=false instead of alpha=0 to skip traversal.',
    },
    MANY_DRAW_CALLS: {
        what: 'Node contributes a disproportionately high number of draw calls.',
        fix:  'Reduce visual complexity, combine into atlases, flatten with render textures.',
    },
    EMPTY_CONTAINER: {
        what: 'Container with no children and no visual purpose - minor traversal waste.',
        fix:  'Remove or defer creation until it has content.',
    },
    OFF_SCREEN: {
        what: 'Node is entirely outside the viewport but still processed by the renderer.',
        fix:  'Manually cull off-screen objects or use a culling plugin.',
    },
    FREQUENT_REORDER: {
        what: 'Children are reordered frequently, triggering re-sort and re-batch.',
        fix:  'Use zIndex with sortableChildren instead of manual reordering.',
    },
    SPINE_HIDDEN_UPDATING: {
        what: 'Invisible spine still has active animation tracks - the runtime updates bones, transforms and mix every frame for nothing.',
        fix:  'Call spine.state.clearTracks() or spine.state.setEmptyAnimation() when hiding. Alternatively set spine.autoUpdate=false while invisible.',
    },
    SPINE_HIGH_RI: {
        what: 'Spine has high Rendering Impact (RI) from blend modes, clipping masks, or high vertex count.',
        fix:  'Reduce blend mode changes, minimize clipping attachments, or optimize mesh complexity.',
    },
    SPINE_HIGH_CI: {
        what: 'Spine has high Computational Impact (CI) from physics, path constraints, IK, or weighted meshes.',
        fix:  'Reduce constraint complexity, disable physics when not needed, or simplify bone hierarchy.',
    },
    SPINE_HIGH_BUDGET: {
        what: 'Spine exceeds combined RI+CI budget threshold - expensive both for GPU and CPU.',
        fix:  'Optimize both rendering (RI) and computational (CI) aspects. Consider splitting into multiple simpler spines.',
    },
};

/** Census of all objects found during a scan */
export interface ObjectCensus {
    /** Node count by kind, sorted by count descending */
    byKind: { kind: NodeKind; count: number }[];
    /** Spine skeleton instances, sorted by count descending */
    spineSkeletons: { name: string; count: number }[];
    /** Unique texture sources with usage count, sorted by count descending */
    textureSources: { id: string; count: number; width: number; height: number }[];
    /** Totals */
    totalMasks: number;
    totalFilters: number;
    totalBlendBreaks: number;
}

/** A single frame's snapshot */
export interface FrameSnapshot {
    frame: number;
    time: number;
    dt: number;
    fps: number;
    nodeCount: number;
    visibleNodes: number;
    drawCalls: number;
    issueCount: number;
    heavyNodes: { label: string; drawCalls: number }[];
    /** Object census - only present on scan frames */
    census?: ObjectCensus;
    /** Aggregate spine budget across all visible spines */
    aggregateBudget?: AggregateBudget;
}

/** Recording of a session */
export interface Recording {
    startFrame: number;
    endFrame: number;
    startTime: number;
    endTime: number;
    frames: FrameSnapshot[];
    issues: { frame: number; issue: Issue; nodeLabel: string }[];
}

/** Crawler configuration - all thresholds are adjustable at runtime */
export interface CrawlerConfig {
    scanInterval: number;
    maxDepth: number;
    excessiveChildrenThreshold: number;
    deepNestingThreshold: number;
    oversizedTextureThreshold: number;
    /** Spine draw call count above which SPINE_EXPENSIVE fires. Default 5 */
    spineDrawCallThreshold: number;
    /** Graphics mask instruction count above which MASK_COMPLEX_SHAPE fires. Default 2 */
    maskComplexityThreshold: number;
    /** Min hidden children to flag INVISIBLE_SUBTREE. Default 5 */
    invisibleChildrenThreshold: number;
    /** Min impact level (1-10) for issues to appear in the overlay. Default 4 */
    overlayImpactThreshold: number;
    overlayEnabled: boolean;
    historySize: number;
    /** Capture frame thumbnails for remote panel hover previews. Default true */
    thumbnails: boolean;
    /** RI threshold above which SPINE_HIGH_RI fires. Default 15 (= 'high' level) */
    riThreshold: number;
    /** CI threshold above which SPINE_HIGH_CI fires. Default 15 (= 'high' level) */
    ciThreshold: number;
    /** Combined budget threshold above which SPINE_HIGH_BUDGET fires. Default 25 (= 'very-high' level) */
    budgetThreshold: number;
    /**
     * Impact level bracket boundaries [low, moderate, high, veryHigh].
     * Scores below [0] = minimal, [0]..[1] = low, [1]..[2] = moderate,
     * [2]..[3] = high, ≥[3] = very-high.
     *
     * Default [3, 8, 15, 25] matches metrics-reporting/scoreCalculator.
     * Raise these for high-end targets (e.g. desktop GPU [6, 16, 30, 50])
     * or lower for constrained devices (e.g. mobile [2, 5, 10, 18]).
     */
    impactBrackets: [number, number, number, number];
}

export const DEFAULT_CONFIG: CrawlerConfig = {
    scanInterval: 60,
    maxDepth: 64,
    excessiveChildrenThreshold: 100,
    deepNestingThreshold: 20,
    oversizedTextureThreshold: 2048,
    spineDrawCallThreshold: 5,
    maskComplexityThreshold: 2,
    invisibleChildrenThreshold: 5,
    overlayImpactThreshold: 4,
    overlayEnabled: true,
    historySize: 300,
    thumbnails: true,
    riThreshold: 15,
    ciThreshold: 15,
    budgetThreshold: 25,
    impactBrackets: [3, 8, 15, 25],
};

/**
 * Default impact brackets aligned with metrics-reporting/scoreCalculator:
 *   minimal: <3, low: <8, moderate: <15, high: <25, very-high: ≥25
 */
export const DEFAULT_IMPACT_BRACKETS: [number, number, number, number] = [3, 8, 15, 25];

/**
 * Classify impact level based on score and configurable brackets.
 * Brackets: [low, moderate, high, veryHigh].
 *
 * Use wider brackets for high-end targets (desktop GPU) to avoid
 * false-positive red warnings on content that performs fine.
 * Use tighter brackets for constrained targets (mobile, low-end).
 */
export function classifyImpactLevel(
    score: number,
    brackets: [number, number, number, number] = DEFAULT_IMPACT_BRACKETS,
): ImpactLevel {
    if (score >= brackets[3]) return 'very-high';
    if (score >= brackets[2]) return 'high';
    if (score >= brackets[1]) return 'moderate';
    if (score >= brackets[0]) return 'low';
    return 'minimal';
}

/** Ref to an actual pixi container, kept weakly */
export type WeakNodeRef = WeakRef<Container>;

// ══════════════════════════════════════════════════════════════
// Spine Budget Tracking Types
// ══════════════════════════════════════════════════════════════

/** Impact level classification for budget metrics */
export type ImpactLevel = 'minimal' | 'low' | 'moderate' | 'high' | 'very-high';

/** Rendering Impact - GPU cost from visual complexity */
export interface RenderingImpact {
    /** Blend mode changes (each costs ~3 units) */
    blendModes: number;
    /** Clipping masks (each costs ~5 units) */
    clippingMasks: number;
    /** Total vertices across all meshes (divided by 200) */
    vertices: number;
    /** Total RI score */
    total: number;
    /** Impact level classification */
    level: ImpactLevel;
}

/** Computational Impact - CPU cost from runtime calculations */
export interface ComputationalImpact {
    /** Physics constraints (each costs ~4 units) */
    physics: number;
    /** Path constraints (each costs ~2.5 units) */
    path: number;
    /** IK constraints (each costs ~2 units) */
    ik: number;
    /** Weighted meshes (each costs ~2 units) */
    weightedMeshes: number;
    /** Transform constraints (each costs ~1.5 units) */
    transform: number;
    /** Deformed meshes (each costs ~1.5 units) */
    deformedMeshes: number;
    /** Total CI score */
    total: number;
    /** Impact level classification */
    level: ImpactLevel;
}

/** Combined spine budget metrics */
export interface SpineBudget {
    /** Rendering impact metrics */
    ri: RenderingImpact;
    /** Computational impact metrics */
    ci: ComputationalImpact;
    /** Combined total budget (RI + CI) */
    total: number;
    /** Overall impact level */
    level: ImpactLevel;
}

/** Historical budget entry for a single spine */
export interface SpineBudgetHistory {
    /** Spine skeleton name */
    skeletonName: string;
    /** Ring buffer of recent budgets (newest last) */
    history: SpineBudget[];
    /** Maximum history size */
    maxSize: number;
}

/** Aggregate budget across all visible spines in a frame */
export interface AggregateBudget {
    /** Total RI across all visible spines */
    totalRI: number;
    /** Total CI across all visible spines */
    totalCI: number;
    /** Combined total budget */
    total: number;
    /** Number of visible spines contributing to budget */
    spineCount: number;
    /** Average RI per spine */
    avgRI: number;
    /** Average CI per spine */
    avgCI: number;
    /** Overall impact level */
    level: ImpactLevel;
}
