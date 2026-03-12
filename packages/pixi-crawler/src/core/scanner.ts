import {
    Container,
    Sprite,
    Graphics,
    Text,
    Mesh,
    AnimatedSprite,
    TilingSprite,
    NineSliceSprite,
    HTMLText,
    BitmapText,
    ParticleContainer,
} from 'pixi.js';
/** Lightweight unique-id generator - no external deps needed. */
let _idCounter = 0;
const _prefix = Math.random().toString(36).slice(2, 8);
function createNodeId(): string {
    return `cr_${_prefix}_${(++_idCounter).toString(36)}`;
}
import type {
    NodeMeta,
    NodeKind,
    Issue,
    IssueCode,
    CrawlerConfig,
    FrameSnapshot,
    SpineAnalysis,
    MaskAnalysis,
    ObjectCensus,
    SpineBudget,
    AggregateBudget,
} from './types.js';
import { ISSUE_IMPACT, classifyImpactLevel } from './types.js';
import { isSpine, analyzeSpine } from './spine-analyzer.js';
import type { SpineLike } from './spine-analyzer.js';
import { SpineBudgetTracker } from './spine-budget-tracker.js';

// ── Type guard helpers for duck-typing into PixiJS internals ──
// Centralised here so breakage from PixiJS internal changes surfaces in one place.

/** Safely read graphics context instructions (PixiJS v8 internal). */
function getGraphicsInstructionCount(node: Container): number {
    const ctx = (node as unknown as { _context?: { instructions?: unknown[] } })._context;
    return ctx?.instructions?.length ?? 0;
}

/** Check whether a node is an isolated render group (PixiJS v8). */
function hasRenderGroup(node: Container): boolean {
    return !!(node as unknown as { isRenderGroup?: boolean }).isRenderGroup;
}

/** Read skeleton data name from a Spine-like node. */
function getSkeletonName(node: Container): string {
    return (node as unknown as SpineLike).skeleton?.data?.name ?? 'unknown';
}

/** Get active animation track count from a Spine-like node. */
function getActiveTrackCount(node: Container): number {
    const spine = node as unknown as SpineLike;
    const tracks = spine.state?.tracks;
    if (!tracks) return 0;
    return tracks.filter(t => t != null).length;
}

/** Read texture source UID, returning a stable string key. */
function getTextureSourceKey(src: unknown): string {
    return String((src as { uid?: number }).uid ?? 'tex');
}

/**
 * The Scanner traverses the PixiJS scene graph and collects metadata.
 * Uses WeakMap/WeakSet for zero-leak node tracking.
 */
export class Scanner {
    readonly meta = new WeakMap<Container, NodeMeta>();
    readonly seen = new WeakSet<Container>();
    readonly budgetTracker = new SpineBudgetTracker(60);

    private _nodes: WeakRef<Container>[] = [];
    private _frameIssues: { issue: Issue; nodeLabel: string }[] = [];
    private _problemNodes: { node: Container; meta: NodeMeta }[] = [];

    private _frame = 0;
    private _nodeCount = 0;
    private _visibleCount = 0;
    private _totalDrawCalls = 0;

    // ── Census accumulators (reset each scan) ──
    private _kindCounts = new Map<NodeKind, number>();
    private _spineCounts = new Map<string, number>();
    private _textureCounts = new Map<string, number>();
    private _textureSizes = new Map<string, { width: number; height: number }>();
    private _totalMasks = 0;
    private _totalFilters = 0;
    private _totalBlendBreaks = 0;

    // ── Budget tracking (reset each scan) ──
    private _visibleSpineBudgets: { skeletonName: string; budget: SpineBudget }[] = [];

    get frame(): number { return this._frame; }
    get nodeCount(): number { return this._nodeCount; }
    get visibleCount(): number { return this._visibleCount; }
    get totalDrawCalls(): number { return this._totalDrawCalls; }
    get frameIssues(): { issue: Issue; nodeLabel: string }[] { return this._frameIssues; }
    get problemNodes(): { node: Container; meta: NodeMeta }[] { return this._problemNodes; }

    get liveNodes(): Container[] {
        const result: Container[] = [];
        for (const ref of this._nodes) {
            const node = ref.deref();
            if (node) result.push(node);
        }
        return result;
    }

    /** Perform a full scan of the scene graph */
    scan(root: Container, config: CrawlerConfig): FrameSnapshot {
        this._frame++;
        this._nodeCount = 0;
        this._visibleCount = 0;
        this._totalDrawCalls = 0;
        this._frameIssues = [];
        this._problemNodes = [];
        this._nodes = [];

        // Reset census
        this._kindCounts.clear();
        this._spineCounts.clear();
        this._textureCounts.clear();
        this._textureSizes.clear();
        this._totalMasks = 0;
        this._totalFilters = 0;
        this._totalBlendBreaks = 0;

        // Reset budget tracking
        this._visibleSpineBudgets = [];

        this._traverse(root, 0, config, false);

        // Sort issues by impact (highest first)
        this._frameIssues.sort(
            (a, b) => ISSUE_IMPACT[b.issue.code] - ISSUE_IMPACT[a.issue.code],
        );

        // Build heavy nodes list
        const heavyNodes: { label: string; drawCalls: number }[] = [];
        for (const ref of this._nodes) {
            const node = ref.deref();
            if (!node) continue;
            const m = this.meta.get(node);
            if (m && m.drawCalls > 1) {
                heavyNodes.push({ label: m.label, drawCalls: m.drawCalls });
            }
        }
        heavyNodes.sort((a, b) => b.drawCalls - a.drawCalls);

        // Build census
        const census = this._buildCensus();

        // Calculate aggregate budget
        const aggregateBudget = this.budgetTracker.calculateAggregate(this._visibleSpineBudgets, config.impactBrackets);

        return {
            frame: this._frame,
            time: performance.now(),
            dt: 0,
            fps: 0,
            nodeCount: this._nodeCount,
            visibleNodes: this._visibleCount,
            drawCalls: this._totalDrawCalls,
            issueCount: this._frameIssues.length,
            heavyNodes: heavyNodes.slice(0, 10),
            census,
            aggregateBudget,
        };
    }

    // ── Traversal ───────────────────────────────────────────────────

    private _traverse(
        node: Container,
        depth: number,
        config: CrawlerConfig,
        parentMasked: boolean,
    ): void {
        if (depth > config.maxDepth) return;

        this._nodeCount++;
        this._nodes.push(new WeakRef(node));

        const kind = classifyNode(node);
        const issues: Issue[] = [];
        const childCount = node.children?.length ?? 0;

        // Census: count by kind
        this._kindCounts.set(kind, (this._kindCounts.get(kind) ?? 0) + 1);

        // Visibility
        const visible = node.visible && getWorldAlpha(node) > 0;
        if (visible) this._visibleCount++;

        // ── Mask analysis ──
        const masked = node.mask != null;
        let maskAnalysis: MaskAnalysis | undefined;

        if (masked) {
            this._totalMasks++;
            const maskNode = node.mask as Container;

            let maskType: MaskAnalysis['maskType'] = 'unknown';
            if (maskNode instanceof Graphics) maskType = 'graphics';
            else if (maskNode instanceof Sprite) maskType = 'sprite';

            const isNested = parentMasked;

            // Estimate graphics mask complexity via internal instructions
            let estimatedComplexity = 1;
            if (maskNode instanceof Graphics) {
                estimatedComplexity = Math.max(1, getGraphicsInstructionCount(maskNode));
            }

            maskAnalysis = {
                maskType,
                isNested,
                maskNodeLabel: maskNode.label || maskNode.constructor.name || 'mask',
                estimatedComplexity,
            };
        }

        // ── Blend mode ──
        const blendBreak =
            'blendMode' in node &&
            (node as Container).blendMode !== 'normal' &&
            (node as Container).blendMode !== undefined;
        if (blendBreak) this._totalBlendBreaks++;

        // ── Filters ──
        const hasFilters =
            node.filters != null &&
            (Array.isArray(node.filters) ? node.filters.length > 0 : true);
        if (hasFilters) this._totalFilters++;

        // ── Render group isolation ──
        const isolated = hasRenderGroup(node);

        // ── Draw calls + spine analysis ──
        let drawCalls = 0;
        let spineAnalysis: SpineAnalysis | undefined;

        if (visible) {
            if (
                kind === 'sprite' ||
                kind === 'animatedSprite' ||
                kind === 'tilingSprite' ||
                kind === 'nineSlice'
            ) {
                drawCalls = 1;
            } else if (kind === 'graphics') {
                drawCalls = 1;
            } else if (kind === 'text' || kind === 'bitmapText' || kind === 'htmlText') {
                drawCalls = 1;
            } else if (kind === 'mesh') {
                drawCalls = 1;
            } else if (kind === 'spine' && isSpine(node)) {
                spineAnalysis = analyzeSpine(node, config.impactBrackets);
                drawCalls = spineAnalysis.estimatedDrawCalls;
            } else if (kind === 'particleContainer') {
                drawCalls = 1;
            }
            if (masked) drawCalls += 2;
            if (hasFilters) drawCalls += 1;
            if (blendBreak) drawCalls += 1;
        }

        this._totalDrawCalls += drawCalls;

        // ── Census: spine skeleton names ──
        if (kind === 'spine' && isSpine(node)) {
            const skelName = getSkeletonName(node);
            this._spineCounts.set(skelName, (this._spineCounts.get(skelName) ?? 0) + 1);
        }

        // ── Census: texture sources ──
        if (kind === 'sprite' || kind === 'tilingSprite' || kind === 'animatedSprite' || kind === 'nineSlice') {
            const spr = node as Sprite;
            const src = spr.texture?.source;
            if (src) {
                const key = getTextureSourceKey(src);
                this._textureCounts.set(key, (this._textureCounts.get(key) ?? 0) + 1);
                if (!this._textureSizes.has(key)) {
                    this._textureSizes.set(key, { width: src.width, height: src.height });
                }
            }
        }

        // ── Bounds ──
        let boundsW = 0;
        let boundsH = 0;
        try {
            const b = node.getBounds();
            boundsW = b.width;
            boundsH = b.height;
        } catch {
            // some nodes throw
        }

        // ═══════════════════════════════════════════════════════
        // Issue detection
        //   visible → rendering/batching issues
        //   !visible → waste-detection issues only
        // ═══════════════════════════════════════════════════════

        if (visible) {
            // ── Spine (high impact) ──
            if (kind === 'spine' && spineAnalysis) {
                if (drawCalls > config.spineDrawCallThreshold) {
                    issues.push(
                        this._issue('error', 'SPINE_EXPENSIVE',
                            `${drawCalls}dc from ${spineAnalysis.activeSlots} active slots (threshold ${config.spineDrawCallThreshold})`),
                    );
                }
                if (spineAnalysis.blendModeTransitions > 0) {
                    issues.push(
                        this._issue('warn', 'SPINE_BLEND_THRASH',
                            `${spineAnalysis.blendModeTransitions} blend transitions in draw order`),
                    );
                }
                if (spineAnalysis.atlasPageSwitches > 0) {
                    issues.push(
                        this._issue('warn', 'SPINE_ATLAS_THRASH',
                            `${spineAnalysis.atlasPageSwitches} atlas page switches`),
                    );
                }
                if (spineAnalysis.atlasPages.length > 1) {
                    issues.push(
                        this._issue('info', 'SPINE_MULTI_ATLAS',
                            `${spineAnalysis.atlasPages.length} atlas pages: ${spineAnalysis.atlasPages.join(', ')}`),
                    );
                }

                // ── Budget-based issues ──
                if (spineAnalysis.renderingImpact && spineAnalysis.computationalImpact) {
                    const ri = spineAnalysis.renderingImpact.total;
                    const ci = spineAnalysis.computationalImpact.total;
                    const total = ri + ci;

                    if (ri >= config.riThreshold) {
                        issues.push(
                            this._issue('warn', 'SPINE_HIGH_RI',
                                `RI ${ri.toFixed(1)} exceeds threshold ${config.riThreshold} (blend:${spineAnalysis.renderingImpact.blendModes}, clip:${spineAnalysis.renderingImpact.clippingMasks}, verts:${spineAnalysis.renderingImpact.vertices})`),
                        );
                    }
                    if (ci >= config.ciThreshold) {
                        issues.push(
                            this._issue('warn', 'SPINE_HIGH_CI',
                                `CI ${ci.toFixed(1)} exceeds threshold ${config.ciThreshold} (ik:${spineAnalysis.computationalImpact.ik}, path:${spineAnalysis.computationalImpact.path}, physics:${spineAnalysis.computationalImpact.physics})`),
                        );
                    }
                    if (total >= config.budgetThreshold) {
                        issues.push(
                            this._issue('error', 'SPINE_HIGH_BUDGET',
                                `Total budget ${total.toFixed(1)} exceeds threshold ${config.budgetThreshold} (RI:${ri.toFixed(1)} + CI:${ci.toFixed(1)})`),
                        );
                    }
                }
            }

            // ── Masks ──
            if (masked && maskAnalysis) {
                if (maskAnalysis.isNested) {
                    issues.push(
                        this._issue('error', 'MASK_NESTED',
                            `Nested ${maskAnalysis.maskType} mask inside already-masked ancestor - recursive stencil ops`),
                    );
                }
                if (maskAnalysis.maskType === 'graphics' && maskAnalysis.estimatedComplexity > config.maskComplexityThreshold) {
                    issues.push(
                        this._issue('warn', 'MASK_COMPLEX_SHAPE',
                            `Complex ${maskAnalysis.maskType} mask (${maskAnalysis.estimatedComplexity} instructions, threshold ${config.maskComplexityThreshold})`),
                    );
                }
                issues.push(
                    this._issue(
                        maskAnalysis.isNested ? 'warn' : 'info',
                        'MASK_BREAK',
                        `${maskAnalysis.maskType} mask "${maskAnalysis.maskNodeLabel}" (+2dc)`,
                    ),
                );
            }

            // ── Filters / blend ──
            if (hasFilters) {
                issues.push(
                    this._issue('info', 'FILTER_BREAK',
                        'Filter causes batch break and render texture allocation'),
                );
            }
            if (blendBreak) {
                issues.push(
                    this._issue('info', 'BLEND_BREAK',
                        'Non-normal blend mode breaks batching'),
                );
            }

            // ── Oversized textures ──
            if (kind === 'sprite' || kind === 'tilingSprite') {
                const spr = node as Sprite;
                if (spr.texture) {
                    const tw = spr.texture.width;
                    const th = spr.texture.height;
                    if (tw > config.oversizedTextureThreshold || th > config.oversizedTextureThreshold) {
                        issues.push(
                            this._issue('warn', 'OVERSIZED_TEXTURE',
                                `Texture ${tw}x${th} exceeds ${config.oversizedTextureThreshold}px`),
                        );
                    }
                }
            }

            // ── Structural ──
            if (childCount > config.excessiveChildrenThreshold) {
                issues.push(
                    this._issue('warn', 'EXCESSIVE_CHILDREN',
                        `${childCount} children (threshold ${config.excessiveChildrenThreshold})`),
                );
            }
            if (depth > config.deepNestingThreshold) {
                issues.push(
                    this._issue('warn', 'DEEP_NESTING',
                        `Depth ${depth} (threshold ${config.deepNestingThreshold})`),
                );
            }
        } else {
            // ── Invisible but still updating - wasted CPU ──

            // Spine with active animation tracks while hidden
            if (kind === 'spine' && isSpine(node)) {
                const activeTracks = getActiveTrackCount(node);
                if (activeTracks > 0) {
                    issues.push(
                        this._issue('warn', 'SPINE_HIDDEN_UPDATING',
                            `Invisible spine with ${activeTracks} active animation tracks - wasting CPU`),
                    );
                }
            }

            // Invisible subtree waste
            if (childCount > 0) {
                let hasVisibleChild = false;
                for (const c of node.children) {
                    if (c.visible) { hasVisibleChild = true; break; }
                }
                if (!hasVisibleChild && childCount > config.invisibleChildrenThreshold) {
                    issues.push(
                        this._issue('info', 'INVISIBLE_SUBTREE',
                            `Invisible container with ${childCount} hidden children (threshold ${config.invisibleChildrenThreshold})`),
                    );
                }
            }

            // visible=true but alpha chain produces 0
            if (node.visible && getWorldAlpha(node) === 0) {
                issues.push(
                    this._issue('info', 'ZERO_ALPHA_VISIBLE',
                        'visible=true but worldAlpha=0 - wasted traversal'),
                );
            }
        }

        // ── Always: empty container is waste either way ──
        if (childCount === 0 && kind === 'container' && !masked && !hasFilters) {
            issues.push(
                this._issue('info', 'EMPTY_CONTAINER',
                    'Empty container with no visual purpose'),
            );
        }

        // Sort this node's issues by impact
        issues.sort((a, b) => ISSUE_IMPACT[b.code] - ISSUE_IMPACT[a.code]);

        // ── Build label ──
        const name = node.label || '';
        const label = name
            ? `${kind}:${name}`
            : `${kind}#${this._getOrCreateMeta(node).uid}`;

        // ── Calculate spine budget if available, and track for aggregation ──
        let spineBudget: SpineBudget | undefined;
        if (kind === 'spine' && spineAnalysis?.renderingImpact && spineAnalysis?.computationalImpact) {
            const budgetTotal = spineAnalysis.renderingImpact.total + spineAnalysis.computationalImpact.total;
            spineBudget = {
                ri: spineAnalysis.renderingImpact,
                ci: spineAnalysis.computationalImpact,
                total: budgetTotal,
                level: classifyImpactLevel(budgetTotal, config.impactBrackets),
            };

            if (visible) {
                const skelName = getSkeletonName(node);
                this.budgetTracker.recordBudget(skelName, spineBudget);
                this._visibleSpineBudgets.push({ skeletonName: skelName, budget: spineBudget });
            }
        }

        // ── Store meta ──
        const meta: NodeMeta = {
            uid: this._getOrCreateMeta(node).uid,
            label,
            kind,
            childCount,
            visible,
            masked,
            blendBreak,
            hasFilters,
            isolated,
            drawCalls,
            boundsW,
            boundsH,
            worldAlpha: getWorldAlpha(node),
            lastScanFrame: this._frame,
            depth,
            issues,
            spineAnalysis,
            maskAnalysis,
            spineBudget,
        };
        this.meta.set(node, meta);

        if (issues.length > 0) {
            this._problemNodes.push({ node, meta });
        }
        for (const iss of issues) {
            this._frameIssues.push({ issue: iss, nodeLabel: label });
        }

        // ── Recurse children (propagate mask context) ──
        if (node.children) {
            for (const child of node.children) {
                this._traverse(
                    child as Container,
                    depth + 1,
                    config,
                    masked || parentMasked,
                );
            }
        }
    }

    // ── Census builder ──────────────────────────────────────────

    private _buildCensus(): ObjectCensus {
        const byKind: ObjectCensus['byKind'] = [];
        for (const [kind, count] of this._kindCounts) {
            byKind.push({ kind, count });
        }
        byKind.sort((a, b) => b.count - a.count);

        const spineSkeletons: ObjectCensus['spineSkeletons'] = [];
        for (const [name, count] of this._spineCounts) {
            spineSkeletons.push({ name, count });
        }
        spineSkeletons.sort((a, b) => b.count - a.count);

        const textureSources: ObjectCensus['textureSources'] = [];
        for (const [id, count] of this._textureCounts) {
            const size = this._textureSizes.get(id) ?? { width: 0, height: 0 };
            textureSources.push({ id, count, width: size.width, height: size.height });
        }
        textureSources.sort((a, b) => b.count - a.count);

        return {
            byKind,
            spineSkeletons,
            textureSources,
            totalMasks: this._totalMasks,
            totalFilters: this._totalFilters,
            totalBlendBreaks: this._totalBlendBreaks,
        };
    }

    // ── Helpers ──────────────────────────────────────────────────

    private _getOrCreateMeta(node: Container): { uid: string } {
        let m = this.meta.get(node);
        if (!m) {
            m = {
                uid: createNodeId(),
                label: '',
                kind: 'unknown',
                childCount: 0,
                visible: false,
                masked: false,
                blendBreak: false,
                hasFilters: false,
                isolated: false,
                drawCalls: 0,
                boundsW: 0,
                boundsH: 0,
                worldAlpha: 0,
                lastScanFrame: 0,
                depth: 0,
                issues: [],
            };
            this.meta.set(node, m);
        }
        return m;
    }

    private _issue(severity: Issue['severity'], code: IssueCode, message: string): Issue {
        return { severity, code, message, frame: this._frame };
    }

}

/** PixiJS v8 has no worldAlpha - walk the parent chain. */
function getWorldAlpha(node: Container): number {
    let alpha = node.alpha;
    let p = node.parent;
    while (p) {
        alpha *= p.alpha;
        p = p.parent;
    }
    return alpha;
}

function classifyNode(node: Container): NodeKind {
    const ctor = node.constructor as unknown as { name?: string };
    const ctorName = ctor?.name ?? '';
    if (ctorName === 'Spine' || ctorName.includes('Spine')) return 'spine';
    if (node instanceof ParticleContainer) return 'particleContainer';
    if (node instanceof AnimatedSprite) return 'animatedSprite';
    if (node instanceof TilingSprite) return 'tilingSprite';
    if (node instanceof NineSliceSprite) return 'nineSlice';
    if (node instanceof BitmapText) return 'bitmapText';
    if (node instanceof HTMLText) return 'htmlText';
    if (node instanceof Text) return 'text';
    if (node instanceof Sprite) return 'sprite';
    if (node instanceof Graphics) return 'graphics';
    if (node instanceof Mesh) return 'mesh';
    if (node.constructor === Container || ctorName === 'Container') return 'container';
    return 'unknown';
}
