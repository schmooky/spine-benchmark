import type { WaterfallEntry } from './waterfall.js';
import type { AggregateBudget, ObjectCensus } from './types.js';

export interface FrameTiming {
    scanMs: number;
    overlayMs: number;
    totalMs: number;
}

export interface RemoteIssue {
    code: string;
    severity: string;
    message: string;
    nodeLabel: string;
    impact: number;
}

/** Per-object diagnostic sent to the remote panel */
export interface RemoteProblemNode {
    /** Display label, e.g. "spine:BG_Spine" */
    label: string;
    /** Node kind */
    kind: string;
    /** Estimated draw calls this node contributes */
    drawCalls: number;
    /** Depth in scene graph */
    depth: number;
    /** Is it masked? */
    masked: boolean;
    /** Has filters? */
    filtered: boolean;
    /** Uses non-normal blend? */
    blendBreak: boolean;
    /** Bounds width */
    boundsW: number;
    /** Bounds height */
    boundsH: number;
    /** Rendering Impact score (spine only) */
    ri: number;
    /** Computational Impact score (spine only) */
    ci: number;
    /** Combined budget (spine only) */
    budgetTotal: number;
    /** Budget level string */
    budgetLevel: string;
    /** All issues on this node, sorted by impact */
    issues: { code: string; severity: string; message: string; impact: number }[];
    /** Spine-specific: blend transitions */
    blendTransitions: number;
    /** Spine-specific: atlas page switches */
    atlasPageSwitches: number;
    /** Spine-specific: atlas pages used */
    atlasPages: string[];
    /** Spine-specific: active slots / total slots */
    activeSlots: number;
    totalSlots: number;
}

export interface RemoteFrameData {
    frame: number;
    time: number;
    fps: number;
    dt: number;
    drawCalls: number;
    nodeCount: number;
    visibleNodes: number;
    issueCount: number;
    waterfall: WaterfallEntry[];
    issues: RemoteIssue[];
    timing?: FrameTiming;
    /** Aggregate spine budget for the frame */
    aggregateBudget?: AggregateBudget;
    /** Top problem nodes with full diagnostic info, sorted by impact score */
    problemNodes: RemoteProblemNode[];
    /** Object census (node kinds, spine instances, textures) */
    census?: ObjectCensus;
}

export class CrawlerBridge {
    private _channel: BroadcastChannel;

    constructor(channelName = 'pixi-crawler') {
        this._channel = new BroadcastChannel(channelName);
    }

    sendFrame(data: RemoteFrameData): void {
        this._channel.postMessage({ type: 'frame', data });
    }

    sendThumbnail(frame: number, dataUrl: string): void {
        this._channel.postMessage({ type: 'thumbnail', frame, dataUrl });
    }

    destroy(): void {
        this._channel.close();
    }
}
