import type { GpuCostConfig } from "./core/gpu-cost";
import type { WorkloadCostConfig } from "./core/workload-cost";
import type { AudioFrameMetrics } from "./features/audio";
import type { LoafSnapshot } from "./features/browser/browser-observers";
import type { SpineFrameMetrics } from "./features/spine";
import type { TelemetryConfig } from "./features/telemetry";

/** One `RenderPipe.execute()` call on the per-frame timeline (only when `pipeProfile` is on). */
export interface PipeExecuteCall {
  index: number;
  pipeId: string;
  action?: string;
  ms: number;
  drawCalls: number; // delta drawCalls during this call
}

/**
 * All metrics captured for a single rendered frame - the unit stored in the ring
 * buffer and the row both the HUD and telemetry aggregate over.
 *
 * @remarks
 * Mandatory blocks (`phases`, `counters`, `textures`, `browser`) are always
 * present; optional blocks appear only when their config flag is on (e.g.
 * `renderSplit` <- `deepRenderSplit`, `filter` <- `filterProfile`, `spine`,
 * `gpuMs`). `postPixiMs` is patched on the FOLLOWING flush, so the most recent
 * frame carries `postPixiMs: 0` until then - aggregators strip that last frame.
 */
export interface FrameRecord {
  frameIdx: number;
  rafDeltaMs: number;
  frameDropped: boolean;

  measuredCpuMs: number;
  unaccountedMs: number;

  rafStartMs: number;
  prePixiMs: number;
  postPixiMs: number;
  /** Duration of this cycle's Ticker.shared tick (separate-ticker mode, if
   *  Ticker.shared is active). Splits postPixi into Ticker.shared work (Spine +
   *  other listeners) and 'composite + vsync idle' = postPixiMs - sharedTickerMs.
   *  undefined under the shared ticker or when Ticker.shared is idle. */
  sharedTickerMs?: number;

  phases: {
    tickListenersMs: number;
    prerenderMs: number;
    renderStartMs: number;
    renderMs: number;
    renderEndMs: number;
    postrenderMs: number;
    gcMs: number;
  };

  renderSplit?: {
    buildInstructionsMs: number;
    updateRenderablesMs: number;
    batchUploadMs: number;
    transformsMs: number;
    executeInstructionsMs: number;
    renderOtherMs: number;
  };

  counters: {
    drawCalls: number;
    rebuilds: number;
    instructions: number;
    renderGroupsRebuilt: number;
    stateChanges: number;
    shaderCompiles: number;
    bufferUploads: number;
    bufferBytesUploaded: number;
    batchBreaks: number;
    /** sum of `childrenRenderablesToUpdate.index` across render groups - the number of
     *  `updateRenderable()` calls in the frame (incremental path: containers with
     *  `didViewUpdate`). Device-invariant TWIN of `renderSplit.updateRenderablesMs`
     *  (which is TIME, device-dependent). 0 on rebuild frames (work there is in
     *  `_buildInstructions`, caught by `instructions`/`rebuilds`). CPU axis of workloadCost. */
    renderablesUpdated: number;
    /** sum of index/vertex count over all draw calls of the frame (drawElements `count`,
     *  drawArrays `count`, xinstanceCount for instanced). A proxy for vertex-shader +
     *  primitive-assembly load. GPU axis of gpuCost (vertices). */
    verticesDrawn: number;
    /** Number of stencil masks (clip-rect/shape) applied in the frame (pushMaskBegin
     *  in StencilMaskPipe.execute). An extra GPU geometry pass + stencil test. Alpha
     *  masks are NOT included here - they are filter-routed (in filter.passes). GPU axis. */
    stencilMaskPasses: number;
    /** Number of real framebuffer switches in the frame (RenderTargetSystem.bind with
     *  an identity change = internal didChange) OUTSIDE filter push/pop. Root +
     *  cacheAsTexture + render-group cache. Filter/alpha-mask/adv-blend RT bands are
     *  EXCLUDED (gated by filter-depth) - they are already in filter.passes, else double-
     *  count. GPU axis of gpuCost (renderTargets). On TBDR - tile store/load. */
    renderTargetSwitches: number;
  };

  perPipe?: Record<
    string,
    {
      ms: number;
      drawCalls: number;
      invocations: number;
    }
  >;

  pipeExecuteCalls?: PipeExecuteCall[];

  filter?: {
    pushMs: number;
    popMs: number;
    applyMs: number;
    passes: number;
  };

  textures: {
    uploadsThisFrame: number;
    realGpuUploadsThisFrame: number;
    unloadsThisFrame: number;
    bytesUploadedThisFrame: number;
    activeGpuCount: number;
  };

  browser: {
    longTasksMsThisFrame: number;
    longTasksCount: number;
    jsHeapMb?: number;
  };

  /** FNV-1a hash of the render-instruction stream. Computed ONLY when
   *  `sceneHashTracking: true` - a tree walk + per-char hash is too costly
   *  for the hot 120fps path, and normally nobody reads the value. */
  sceneHash?: string;

  asyncMs?: number;

  spine?: SpineFrameMetrics;
  loaf?: LoafSnapshot;
  audio?: AudioFrameMetrics;

  gpuMs?: number;
  gpuDisjoint?: boolean;
}

/**
 * Construction options for {@link Crawler} - every field is optional and gates
 * one submodule or instrumentation axis.
 *
 * @remarks
 * Defaults: `deepRenderSplit`, `filterProfile`, `enableGpuTiming`,
 * `textureTracking`, `workloadCost`, `gpuCost` are ON; `pipeProfile` is OFF (its
 * per-instruction wrapping is the heaviest overhead). `hud` and `telemetry` are
 * off unless set. See the package README for the full flag table.
 */
export interface CrawlerConfig {
  bufferSize?: number;
  targetFrameMs?: number;
  enableLongTaskObserver?: boolean;
  enableHeapSnapshot?: boolean;

  pipeProfile?: boolean;
  deepRenderSplit?: boolean;
  filterProfile?: boolean;
  textureTracking?: boolean;
  asyncTracking?: boolean;
  enableGpuTiming?: boolean;
  /** Compute the FNV hash of the instruction stream every frame (`FrameRecord.sceneHash`).
   *  Default off - a walk of the whole render-group tree + per-char hash at 120fps
   *  is too costly, and the normal consumers do not read the value. */
  sceneHashTracking?: boolean;

  spineProfile?: {
    enabled: boolean;
    perInstance?: boolean;
    disablePipeProbes?: boolean;
    autoRegister?: boolean;
  };
  audioProfile?: { enabled: boolean };
  /** Runtime function-level self-time via the W3C JS Self-Profiling API
   *  (`window.Profiler`). REQUIRES `Document-Policy: js-profiling` response
   *  header + a Chromium browser; degrades to no-op otherwise. Reveals what
   *  hides inside derived buckets (e.g. Spine `computeWorldVertices` inside
   *  `transforms`) without per-call instrumentation overhead. */
  selfProfile?: {
    enabled: boolean;
    sampleIntervalMs?: number;
    windowMs?: number;
    topK?: number;
  };
  /** Process-level memory via `performance.measureUserAgentSpecificMemory()`
   *  (JS heap + DOM + workers + shared, by type). REQUIRES cross-origin isolation
   *  (COOP `same-origin` + COEP `require-corp` headers); degrades to no-op
   *  otherwise. Async + slow -> polled on `intervalMs` (default 10s), never per-frame. */
  memoryProfile?: { enabled: boolean; intervalMs?: number };
  /** Open device- and game-independent workload measure in fixed units
   *  (`cost = sum weight*counter`, no saturation). Derived, zero cost.
   *  Default on; weights + optional UX-threshold overridable. See
   *  `core/workload-cost.ts`. */
  workloadCost?: WorkloadCostConfig;
  /** Open GPU heaviness, symmetric to workloadCost: `cost = sum weight*value` with a fill axis
   *  via scene-graph bounds (footprint-proxy). Derived; fill reads the live stage
   *  (not offline). Default on. See `core/gpu-cost.ts`. */
  gpuCost?: GpuCostConfig;

  worstFrameMs?: number;

  /** Mount the DOM HUD overlay at attach. Toggle later via `profiler.setHud()`. */
  hud?: boolean;
  /** HUD color preset. "slate" (default) is the shipped muted/plain look;
   *  "warm" is a warm-toned dark variant; "contrast" is a lighter, higher-
   *  contrast dark variant (e.g. for screen recordings). All three keep the
   *  same light-text-on-dark direction, so nothing else needs re-tuning. Sets
   *  CSS custom properties only - zero effect on measurement. */
  hudTheme?: "slate" | "warm" | "contrast";
  /** Smooth expand/collapse + hover transitions on the HUD chrome. Default on;
   *  set false for an instant, transition-free HUD (e.g. when recording a
   *  frame-perfect video of the overlay itself). Purely cosmetic - CSS only,
   *  no effect on measurement or the render loop. */
  hudMotion?: boolean;
  /** Periodic telemetry flush to a game-owned sink. Omit to disable telemetry
   *  entirely (profiler still records frames; read via `getFrames()`). */
  telemetry?: TelemetryConfig;
}

/** One render instruction in a worst-frame scene dump (pipe id + optional action). */
export interface InstructionDump {
  index: number;
  renderPipeId: string;
  action?: string;
  canBundle?: boolean;
}

/** One render-group node in a worst-frame scene dump (depth + instruction/child counts). */
export interface RenderGroupDump {
  depth: number;
  instructionCount: number;
  childrenCount: number;
  isCachedAsTexture: boolean;
}

/** A {@link FrameRecord} paired with its live scene dump (instructions + render groups). */
export interface FrameCapture {
  frame: FrameRecord;
  instructions: InstructionDump[];
  renderGroups: RenderGroupDump[];
}

/** A saved session of frames - serialize to JSON, replay later in the inspector
 *  timeline. Holds only `FrameRecord[]` (the live scene-graph dump can't be
 *  recorded), so render-groups/instructions are unavailable on offline replay. */
export interface FrameRecording {
  version: 1;
  sessionId: string;
  recordedAtMs: number;
  targetFrameMs: number;
  frames: FrameRecord[];
}

export const DEFAULT_CRAWLER_CONFIG: Required<
  Omit<
    CrawlerConfig,
    | "pipeProfile"
    | "deepRenderSplit"
    | "filterProfile"
    | "textureTracking"
    | "worstFrameMs"
    | "enableGpuTiming"
    | "sceneHashTracking"
    | "spineProfile"
    | "audioProfile"
    | "selfProfile"
    | "memoryProfile"
    | "workloadCost"
    | "gpuCost"
    | "hud"
    | "hudTheme"
    | "hudMotion"
    | "telemetry"
  >
> = {
  bufferSize: 600,
  targetFrameMs: 1000 / 60,
  enableLongTaskObserver: true,
  enableHeapSnapshot: true,
  asyncTracking: true,
};
