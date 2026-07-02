import {
  Assets,
  type Renderer,
  TextureSource,
  Ticker,
  UPDATE_PRIORITY,
} from "pixi.js";

import {
  type FillNode,
  type GpuCost,
  type GpuCostConfig,
  computeGpuCost,
} from "./core/gpu-cost";
import { RingBuffer } from "./core/ring-buffer";
import {
  type WorkloadCost,
  type WorkloadCostConfig,
  computeWorkloadCost,
} from "./core/workload-cost";
import { AudioMeasurementCollector } from "./features/audio";
import {
  LoafCollector,
  LongTaskCollector,
  readHeapMb,
} from "./features/browser/browser-observers";
import { type GpuTimer, createGpuTimer } from "./features/gpu-timer/gpu-timer";
import { CrawlerHud } from "./features/hud/hud";
import { FPS_WINDOW_FRAMES } from "./features/hud/view";
import { WorstFrameInspector } from "./features/inspector/inspector";
import { MemoryCollector, type MemoryMeasurement } from "./features/memory";
import { type HotFunction, SelfProfiler } from "./features/self-profiler";
import { SpineMeasurementCollector } from "./features/spine";
import { type TelemetryBatch, TelemetryFlusher } from "./features/telemetry";
import { makeDeviceId, makeSessionId } from "./shared/session";
import type {
  FrameCapture,
  FrameRecord,
  FrameRecording,
  InstructionDump,
  PipeExecuteCall,
  CrawlerConfig,
  RenderGroupDump,
} from "./types";
import { DEFAULT_CRAWLER_CONFIG } from "./types";

const DEFAULT_TELEMETRY_WINDOW_MS = 5_000;

const RUNNER_NAMES = [
  "prerender",
  "renderStart",
  "render",
  "renderEnd",
  "postrender",
] as const;

type ResolvedConfig = CrawlerConfig & typeof DEFAULT_CRAWLER_CONFIG;

type AnyFn = (...args: unknown[]) => unknown;

interface InstructionLike {
  renderPipeId?: string;
  action?: string;
  canBundle?: boolean;
}

interface RenderGroupLike {
  instructionSet?: {
    instructionSize: number;
    instructions?: InstructionLike[];
  };
  renderGroupChildren?: RenderGroupLike[];
  isCachedAsTexture?: boolean;
}

interface BatchPipeLike {
  buildStart: AnyFn;
  upload: AnyFn;
  break: AnyFn;
  execute?: AnyFn;
}

interface PipeLike {
  execute?: AnyFn;
}

interface RenderGroupSystemLike {
  _buildInstructions: AnyFn;
  _updateRenderables: AnyFn;
  _updateRenderGroups: AnyFn;
}

interface GcSystemLike {
  run: AnyFn;
}

interface FilterSystemLike {
  push: AnyFn;
  pop: AnyFn;
  applyFilter: AnyFn;
}

interface GlStateSystemLike {
  set: AnyFn;
  stateId: number;
}

interface GlShaderSystemLike {
  _createProgramData: AnyFn;
}

interface GlBufferSystemLike {
  updateBuffer: AnyFn;
}

interface GlTextureSystemLike {
  onSourceUpdate: AnyFn;
  onSourceUnload: AnyFn;
  _initSource: AnyFn;
  _managedTextures?: { items?: Record<number, unknown>; _onUnload?: AnyFn };
}

interface TextureSourceLike {
  pixelWidth?: number;
  pixelHeight?: number;
  format?: string;
}

interface RendererInternals {
  runners: Record<
    string,
    { items: unknown[]; add(item: unknown): void; remove(item: unknown): void }
  >;
  geometry: { draw: AnyFn };
  renderPipes: Record<string, PipeLike>;
  gc?: GcSystemLike;
  renderGroup?: RenderGroupSystemLike;
  filter?: FilterSystemLike;
  state?: GlStateSystemLike;
  shader?: GlShaderSystemLike;
  buffer?: GlBufferSystemLike;
  texture?: GlTextureSystemLike;
  renderTarget?: { bind: AnyFn };
  gl?: WebGL2RenderingContext;
  resolution?: number;
  screen?: { width: number; height: number };
  _lastObjectRendered?: { renderGroup?: RenderGroupLike };
}

interface PerPipeBucket {
  ms: number;
  drawCalls: number;
  invocations: number;
}

/**
 * Root of the profiler: attaches to a Pixi renderer + ticker, records a
 * per-frame {@link FrameRecord} ring buffer, and owns every config-gated
 * submodule (HUD, inspector, telemetry, and the Spine/audio/GPU collectors).
 *
 * @remarks
 * Lifecycle is `new Crawler(config)` -> {@link Crawler.attach} ->
 * {@link Crawler.dispose} (or {@link Crawler.detach}). One instance measures
 * one window - {@link Crawler.attach} throws if called twice. Instrumentation
 * is installed by patching Pixi internal prototypes at attach and restored on
 * teardown, so the renderer's Pixi version must match this package's `pixi.js`
 * peer-dep exactly. Read frames directly with {@link Crawler.getFrames}, or
 * configure `telemetry.sink` to receive aggregated batches.
 *
 * @example
 * ```ts
 * const profiler = new Crawler({ targetFrameMs: 1000 / 60, hud: true });
 * profiler.attach(app.renderer, app.ticker);
 * window.addEventListener("pagehide", () => { void profiler.dispose(); });
 * ```
 */
export class Crawler {
  private readonly config: ResolvedConfig;
  private readonly buffer: RingBuffer<FrameRecord>;
  private readonly longTasks = new LongTaskCollector();
  private readonly loaf = new LoafCollector();

  private tickStart = 0;
  private prerenderMark = 0;
  private renderStartMark = 0;
  private renderMark = 0;
  private renderEndMark = 0;
  private postrenderMark = 0;

  private prevTickStart = 0;
  private frameIdx = 0;
  // Save the previous flush's tickEnd - the end of our app.ticker.update().
  // On the next flush (when we have a fresh tickStart = rAF_start[N+1]) we
  // retroactively write postPixiMs[N] = tickStart[N+1] - tickEnd[N].
  // Anchored to tickEnd, not postrenderMark, because between them sits the
  // runner tail (GCSystem.postrender -> gc.run, any user postrender listeners)
  // - already counted in phases.postrenderMs, so it must not go into postPixi.
  private lastTickEndMs = 0;
  // Timestamp of the end of the Ticker.shared tick (the last UTILITY listener on Ticker.shared).
  // Only in separate-ticker mode and only if Ticker.shared is already active. Splits
  // the residual postPixi into 'other Ticker.shared work' and 'composite + vsync idle'.
  private sharedTickEndMs = 0;

  private drawCalls = 0;
  private rebuilds = 0;
  private batchBreaks = 0;
  private gcMs = 0;
  private renderGroupsRebuilt = 0;

  // GPU-axis counters (see FrameRecord.counters). Per-frame, reset at flush.
  private verticesDrawn = 0;
  private stencilMaskPasses = 0;
  private renderTargetSwitches = 0;
  // Last bound renderTarget identity - running across frames (NOT reset): a switch
  // is a switch even across the frame boundary, mirrors RenderTargetSystem.didChange.
  private _lastBoundRT: unknown = undefined;
  // Filter nesting depth - renderTargetSwitches counts ONLY framebuffer switches
  // OUTSIDE a filter push/pop (root + cacheAsTexture + render-group cache), so it
  // does NOT double-count the filter/alpha-mask/advanced-blend RT binds already
  // priced by filterPasses. Set on filter.push, cleared on filter.pop.
  private _filterActiveDepth = 0;

  private buildInstructionsMs = 0;
  private updateRenderablesMs = 0;
  // Number of updateRenderable() calls in the frame (device-invariant twin of
  // updateRenderablesMs). We sum childrenRenderablesToUpdate.index in the hook
  // _updateRenderables. Per-frame, reset at flush.
  private renderablesUpdated = 0;
  private batchUploadMs = 0;
  private updateRenderGroupsMs = 0;
  private updateRenderGroupsDepth = 0;
  private pipeExecuteMs = 0;

  private filterPushMs = 0;
  private filterPopMs = 0;
  private filterApplyMs = 0;
  private filterPasses = 0;

  private stateChanges = 0;
  private shaderCompiles = 0;
  private bufferUploads = 0;
  private bufferBytesUploaded = 0;

  private realGpuUploadsThisFrame = 0;
  private bytesUploadedThisFrame = 0;
  private texturesUnloadedThisFrame = 0;
  private activeGpuCount = 0;

  private asyncMsThisFrame = 0;

  private readonly perPipeStats = new Map<string, PerPipeBucket>();
  private pipeExecuteCalls: PipeExecuteCall[] = [];

  private worstFrame: FrameCapture | undefined;
  private captureNextResolvers: ((c: FrameCapture) => void)[] = [];

  private renderer?: RendererInternals;
  private gpuTimer?: GpuTimer;
  // True when the crawler measures the SAME ticker that Spine.internalUpdate sits on
  // (Ticker.shared). Changes spine-cpu attribution: under the shared ticker Spine (NORMAL=0)
  // runs between our tickStart (INTERACTION=50) and app.render (LOW=-25) -> its
  // 5 cpu phases lie in prePixi of the same frame, with no cross-frame +1. With separate
  // tickers Spine ticks in Ticker.shared AFTER app.ticker -> spine-cpu is in postPixi and
  // read on the next flush (see buildAveragedView).
  private _sharedTicker = false;
  private _sharedTickEndSubscribed = false;
  private uninstalls: (() => void)[] = [];
  private attached = false;

  private spineCollector?: SpineMeasurementCollector;
  private audioCollector?: AudioMeasurementCollector;
  private selfProfiler?: SelfProfiler;
  private memoryCollector?: MemoryCollector;

  // Embeddable submodules - created in attach(), torn down via uninstalls.
  private hud?: CrawlerHud;
  private inspector?: WorstFrameInspector;
  private flusher?: TelemetryFlusher;
  private recordCb: ((nextActive: boolean) => Promise<void> | void) | undefined;
  private recordingActive = false;
  /** Built-in recorder: when active, every flushed frame is appended here
   *  (beyond the ring buffer's cap) so a session of any length up to the cap can
   *  be exported to JSON and replayed offline. Kept after stop until next start. */
  private recordedFrames: FrameRecord[] = [];
  private isRecordingActive = false;
  private static readonly RECORDING_CAP = 60_000; // ~17 min @ 60fps - OOM backstop
  /** Free-form content label, stamped into every TelemetryBatch. The game
   *  calls `setTelemetryLabel(scene)` on transitions - needed to attribute the
   *  calibration corpus by scene. */
  private _telemetryLabel: string | undefined;

  /** Stable per-instance id, tagged onto every TelemetryBatch. */
  readonly sessionId: string = makeSessionId();
  private _deviceId: string | undefined;

  /**
   * Create a profiler with merged config; does not attach to a renderer yet.
   *
   * @remarks
   * QA-oriented instrumentation is default-on (`deepRenderSplit`,
   * `filterProfile`, `enableGpuTiming`, `textureTracking`). `pipeProfile` stays
   * OFF - its per-instruction wrapping is the largest profiler-induced FPS hit.
   * Explicit `config` fields always win over these defaults.
   *
   * @param config - Crawler configuration; see {@link CrawlerConfig}. Every field is optional.
   */
  constructor(config: CrawlerConfig = {}) {
    this.config = {
      deepRenderSplit: true,
      filterProfile: true,
      enableGpuTiming: true,
      textureTracking: true,
      ...DEFAULT_CRAWLER_CONFIG,
      ...config,
    };
    this.buffer = new RingBuffer<FrameRecord>(this.config.bufferSize);
  }

  /** Auto-generated unique device id (persisted in localStorage), tagged onto
   *  telemetry batches. Set at attach when telemetry is configured. */
  get deviceId(): string | undefined {
    return this._deviceId;
  }

  /**
   * Install instrumentation on a Pixi renderer + ticker and start recording.
   *
   * @remarks
   * Patches Pixi internal prototypes (gl draw methods, batch / render-group /
   * filter systems, `TextureSource.prototype.unload`, …) and subscribes ticker
   * listeners; all of it is reverted by {@link Crawler.detach} /
   * {@link Crawler.dispose}. Contracts: the renderer's Pixi version must match
   * this package's `pixi.js` peer-dep exactly, and `ticker` should be the
   * Application's own ticker (not `Ticker.shared`, where Spine collides).
   *
   * @param renderer - The live Pixi `Renderer` (WebGL/WebGPU) to instrument.
   * @param ticker - The Application ticker that drives `render()`.
   * @throws {Error} If this profiler is already attached - create a new instance per measurement window.
   *
   * @example
   * ```ts
   * await app.init({ ... });
   * profiler.attach(app.renderer, app.ticker);
   * ```
   */
  attach(renderer: Renderer, ticker: Ticker): void {
    if (this.attached) {
      throw new Error(
        "Crawler.attach: already attached; create a new Crawler instance for a separate measurement window."
      );
    }
    this.attached = true;
    this._sharedTicker = ticker === Ticker.shared;
    const internals = renderer as unknown as RendererInternals;
    this.renderer = internals;

    for (const name of RUNNER_NAMES) {
      const runner = internals.runners[name];
      if (!runner)
        throw new Error(
          `Crawler.attach: runner "${name}" not found on renderer`
        );
      runner.add(this);
      // Move to front so our mark fires BEFORE Pixi systems - phase intervals then measure work in the *named* runner, not the next one.
      const idx = runner.items.indexOf(this);
      if (idx > 0) {
        runner.items.splice(idx, 1);
        runner.items.unshift(this);
      }
      this.uninstalls.push(() => {
        runner.remove(this);
      });
    }

    // Hook at the gl level - geometry.draw is the common path, but particle/encoder
    // adaptors call gl.drawElements directly (see GlParticleContainerAdaptor.mjs:14).
    // Wrapping the gl context catches both.
    if (internals.gl) this._wrapGlDrawMethods(internals.gl);

    const batchPipe = internals.renderPipes["batch"] as
      | BatchPipeLike
      | undefined;
    if (!batchPipe)
      throw new Error("Crawler.attach: renderPipes.batch not found");
    this._wrapMethod(batchPipe, "buildStart", (orig) => (...args) => {
      this.rebuilds++;
      return orig(...args);
    });
    // batch.break - each call splits the current batch into a separate drawElements.
    // BatcherPipe.mjs:45/49 - break is called on a gpu state change (BlendMode,
    // shader, texture slots overflow) and on a custom-pipe change in the instruction stream.
    this._wrapMethod(batchPipe, "break", (orig) => (...args) => {
      this.batchBreaks++;
      return orig(...args);
    });

    if (internals.gc) {
      this._wrapMethod(internals.gc, "run", (orig) => (...args) => {
        const t0 = performance.now();
        const r = orig(...args);
        this.gcMs += performance.now() - t0;
        return r;
      });
    }

    if (internals.renderGroup) {
      const rg = internals.renderGroup;
      this._wrapMethod(rg, "_buildInstructions", (orig) => (...args) => {
        this.renderGroupsRebuilt++;
        const t0 = performance.now();
        const r = orig(...args);
        this.buildInstructionsMs += performance.now() - t0;
        return r;
      });
      this._wrapMethod(rg, "_updateRenderables", (orig) => (...args) => {
        // index = number of renderables to update; read BEFORE orig (which
        // clearLists up to index at the end). Only didViewUpdate ones actually
        // update, but index is the upper bound per render-group; summed
        // across groups = a device-invariant measure of incremental work.
        const rgArg = args[0] as
          | { childrenRenderablesToUpdate?: { index?: number } }
          | undefined;
        this.renderablesUpdated +=
          rgArg?.childrenRenderablesToUpdate?.index ?? 0;
        const t0 = performance.now();
        const r = orig(...args);
        this.updateRenderablesMs += performance.now() - t0;
        return r;
      });
      this._wrapMethod(rg, "_updateRenderGroups", (orig) => (...args) => {
        const outer = this.updateRenderGroupsDepth === 0;
        this.updateRenderGroupsDepth++;
        const t0 = outer ? performance.now() : 0;
        const r = orig(...args);
        this.updateRenderGroupsDepth--;
        if (outer) this.updateRenderGroupsMs += performance.now() - t0;
        return r;
      });
    }

    this._wrapMethod(batchPipe, "upload", (orig) => (...args) => {
      const t0 = performance.now();
      const r = orig(...args);
      this.batchUploadMs += performance.now() - t0;
      return r;
    });

    // pipe.execute wrap fires per-instruction (100-500x/frame on heavy scenes).
    // Even the "light" path (just perf.now() × 2 + pipeExecuteMs +=) costs ~0.5-2ms
    // per frame on mobile Safari due to function-call indirection deopt of every
    // pipe's hot execute() method. We gate the ENTIRE wrap behind pipeProfile;
    // when off, pipeExecuteMs / perPipe / pipeExecuteCalls all stay 0/undefined.
    // Inspector's renderSplit `executeInstructionsMs` shows 0 - accepted trade-off
    // for embed in production-like QA builds.
    const trackPerPipe = this.config.pipeProfile === true;
    if (trackPerPipe) {
      for (const name of Object.keys(internals.renderPipes)) {
        const pipe = internals.renderPipes[name];
        if (!pipe || typeof pipe.execute !== "function") continue;
        this.perPipeStats.set(name, { ms: 0, drawCalls: 0, invocations: 0 });
        this._wrapMethod(
          pipe as { execute: AnyFn },
          "execute",
          (orig) => (instr) => {
            const drawsBefore = this.drawCalls;
            const t0 = performance.now();
            const r = orig(instr);
            const elapsed = performance.now() - t0;
            this.pipeExecuteMs += elapsed;
            const stats = this.perPipeStats.get(name)!;
            stats.ms += elapsed;
            const drawDelta = this.drawCalls - drawsBefore;
            stats.drawCalls += drawDelta;
            stats.invocations++;
            // Per-call timeline. instruction.action may be a string (filter
            // push/applyFilter/pop, mask push/pop, blendMode change, etc.) or
            // absent for ordinary draw instructions.
            const action = (instr as { action?: string } | undefined)?.action;
            const call: PipeExecuteCall = {
              index: this.pipeExecuteCalls.length,
              pipeId: name,
              ms: elapsed,
              drawCalls: drawDelta,
            };
            if (action) call.action = action;
            this.pipeExecuteCalls.push(call);
            return r;
          }
        );
      }
    }

    if (this.config.filterProfile && internals.filter) {
      const f = internals.filter;
      // try/finally on all three: a throw inside FilterSystem must not leave
      // _filterActiveDepth desynced (it gates renderTargetSwitches) nor drop
      // the timing increment. prerender() also resets depth each frame as a
      // backstop - filter nesting never survives a frame boundary.
      this._wrapMethod(f, "push", (orig) => (...args) => {
        // Enter filter scope BEFORE orig so the bind it issues is excluded
        // from renderTargetSwitches (priced by filterPasses instead).
        this._filterActiveDepth++;
        const t0 = performance.now();
        try {
          return orig(...args);
        } finally {
          this.filterPushMs += performance.now() - t0;
        }
      });
      this._wrapMethod(f, "pop", (orig) => (...args) => {
        const t0 = performance.now();
        try {
          return orig(...args);
        } finally {
          this.filterPopMs += performance.now() - t0;
          // Leave filter scope AFTER orig so pop's restore-bind is also excluded.
          this._filterActiveDepth = Math.max(0, this._filterActiveDepth - 1);
        }
      });
      this._wrapMethod(f, "applyFilter", (orig) => (...args) => {
        const t0 = performance.now();
        try {
          const r = orig(...args);
          this.filterPasses++; // count only a pass that actually completed
          return r;
        } finally {
          this.filterApplyMs += performance.now() - t0;
        }
      });
    }

    // Stencil masks (clip-rect / shape mask) - extra GPU geometry pass + a
    // stencil-test on the masked draws. NOT filter-routed (alpha masks ARE -> they
    // land in filter.passes; advanced blend modes too). We hook only the
    // stencilMask pipe's execute (a handful of instructions/frame) and count
    // `pushMaskBegin` = stencil masks actually rendered this frame. Independent of
    // pipeProfile (cheap - single pipe, not the all-pipes execute wrap).
    const stencilPipe = internals.renderPipes["stencilMask"];
    if (stencilPipe && typeof stencilPipe.execute === "function") {
      this._wrapMethod(
        stencilPipe as { execute: AnyFn },
        "execute",
        (orig) => (instr) => {
          if (
            (instr as { action?: string } | undefined)?.action ===
            "pushMaskBegin"
          )
            this.stencilMaskPasses++;
          return orig(instr);
        }
      );
    }

    // Render-target switches - RenderTargetSystem.bind returns the resolved
    // renderTarget; an identity change vs the previously bound one is a real
    // framebuffer switch (mirrors the system's internal `didChange` that gates
    // gl.bindFramebuffer). We count ONLY switches OUTSIDE a filter push/pop
    // (root scene pass + cacheAsTexture + render-group cache); filter/alpha-mask/
    // advanced-blend binds are already priced by filterPasses, so gating on
    // `_filterActiveDepth === 0` avoids double-count without fragile arithmetic.
    // `_lastBoundRT` updates unconditionally so the switch back out of a filter
    // is tracked correctly. On TBDR each counted switch = tile store/load.
    // bind fires ~1-10×/frame -> rest-param cost negligible.
    if (
      internals.renderTarget &&
      typeof internals.renderTarget.bind === "function"
    ) {
      this._wrapMethod(
        internals.renderTarget as { bind: AnyFn },
        "bind",
        (orig) =>
          (...args) => {
            const result = orig(...args);
            if (result !== this._lastBoundRT) {
              if (this._filterActiveDepth === 0) this.renderTargetSwitches++;
              this._lastBoundRT = result;
            }
            return result;
          }
      );
    }

    if (internals.state) {
      const stateSys = internals.state;
      this._wrapMethod(stateSys, "set", (orig) => (...args) => {
        const before = stateSys.stateId;
        const r = orig(...args);
        if (stateSys.stateId !== before) this.stateChanges++;
        return r;
      });
    }

    if (internals.shader) {
      this._wrapMethod(
        internals.shader,
        "_createProgramData",
        (orig) =>
          (...args) => {
            this.shaderCompiles++;
            return orig(...args);
          }
      );
    }

    if (internals.buffer) {
      this._wrapMethod(
        internals.buffer,
        "updateBuffer",
        (orig) =>
          (...args) => {
            this.bufferUploads++;
            const buf = args[0] as
              | { data?: { byteLength?: number } }
              | undefined;
            const bytes = buf?.data?.byteLength;
            if (typeof bytes === "number") this.bufferBytesUploaded += bytes;
            return orig(...args);
          }
      );
    }

    if (internals.texture) {
      const tex = internals.texture;
      const initialItems = tex._managedTextures?.items;
      if (initialItems) this.activeGpuCount = Object.keys(initialItems).length;

      this._wrapMethod(tex, "onSourceUpdate", (orig) => (...args) => {
        const source = args[0] as TextureSourceLike | undefined;
        this.realGpuUploadsThisFrame++;
        if (
          source &&
          typeof source.pixelWidth === "number" &&
          typeof source.pixelHeight === "number"
        ) {
          this.bytesUploadedThisFrame +=
            source.pixelWidth *
            source.pixelHeight *
            bytesPerPixel(source.format);
        }
        return orig(...args);
      });

      this._wrapMethod(tex, "_initSource", (orig) => (...args) => {
        this.activeGpuCount++;
        return orig(...args);
      });

      // Hook TextureSource.prototype.unload - this is the single chokepoint for
      // both manual `source.destroy()` and `renderer.gc.run()` unload paths. The
      // alternative - wrapping GlTextureSystem.onSourceUnload - misses the GC path
      // entirely: GCManagedHash nulls its `items[uid]` BEFORE calling source.unload(),
      // so its own "unload" event listener short-circuits before invoking _onUnload.
      const protoUnload = TextureSource.prototype.unload;
      // Wrapper needs the TextureSource instance as its own `this` for
      // protoUnload.apply, so alias the Crawler into a local.
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      const profilerSelf = this;
      (TextureSource.prototype as { unload: AnyFn }).unload = function (
        ...args: unknown[]
      ) {
        profilerSelf.texturesUnloadedThisFrame++;
        if (profilerSelf.activeGpuCount > 0) profilerSelf.activeGpuCount--;
        protoUnload.apply(this, args as []);
      };
      this.uninstalls.push(() => {
        (TextureSource.prototype as { unload: AnyFn }).unload =
          protoUnload as AnyFn;
      });
    }

    if (this.config.enableGpuTiming) {
      const timer = createGpuTimer(internals.gl, {
        currentFrameIdx: () => this.frameIdx,
        findRecord: (idx) => this.buffer.findLast((r) => r.frameIdx === idx),
      });
      if (timer) {
        this.gpuTimer = timer;
        this.uninstalls.push(() => {
          this.gpuTimer?.teardown();
          delete this.gpuTimer;
        });
      }
    }

    ticker.add(this._onTickStart, this, UPDATE_PRIORITY.INTERACTION);
    ticker.add(this._onTickEnd, this, UPDATE_PRIORITY.UTILITY);
    this.uninstalls.push(() => {
      ticker.remove(this._onTickStart, this);
      ticker.remove(this._onTickEnd, this);
    });

    // Mark the END of the Ticker.shared tick (UTILITY = last) to split the
    // postPixi residual into "other Ticker.shared work" vs "composite + vsync
    // idle". Separate-ticker mode only (under a shared ticker our _onTickEnd
    // already IS the shared-tick end). GATE on count>0: subscribing to an idle
    // Ticker.shared would START its rAF loop and perturb measurement - when Spine
    // or game logic already drives it, our marker adds no extra rAF. Idle now?
    // _onTickStart retries each frame (Spine often starts the shared ticker
    // lazily, after attach), so the split isn't lost to attach-time ordering.
    this._maybeSubscribeSharedTickEnd();

    if (this.config.enableLongTaskObserver) {
      this.longTasks.start();
      this.uninstalls.push(() => {
        this.longTasks.stop();
      });
      // LoAF gated by the same config flag - it supersets long-tasks
      // with a breakdown (script vs render vs styleAndLayout), and
      // there is no reason to split them across different config knobs.
      this.loaf.start();
      this.uninstalls.push(() => {
        this.loaf.stop();
      });
    }

    if (this.config.asyncTracking) {
      this._wrapMethod(
        Assets as unknown as { load: AnyFn },
        "load",
        (orig) =>
          async (...args) => {
            const t0 = performance.now();
            try {
              return await orig(...args);
            } finally {
              this.asyncMsThisFrame += performance.now() - t0;
            }
          }
      );
    }

    if (this.config.spineProfile?.enabled) {
      const opts: {
        perInstance?: boolean;
        disablePipeProbes?: boolean;
        autoRegister?: boolean;
      } = {};
      if (this.config.spineProfile.perInstance === true)
        opts.perInstance = true;
      if (this.config.spineProfile.disablePipeProbes === true)
        opts.disablePipeProbes = true;
      if (this.config.spineProfile.autoRegister === false)
        opts.autoRegister = false;
      this.spineCollector = new SpineMeasurementCollector(opts);
      this.spineCollector.attach(
        renderer as unknown as {
          type?: number;
          renderPipes?: Record<string, unknown>;
        }
      );
      this.uninstalls.push(() => {
        this.spineCollector?.detach();
        delete this.spineCollector;
      });
    }

    if (this.config.selfProfile?.enabled) {
      const sp = this.config.selfProfile;
      const opts: {
        sampleIntervalMs?: number;
        windowMs?: number;
        topK?: number;
      } = {};
      if (sp.sampleIntervalMs !== undefined)
        opts.sampleIntervalMs = sp.sampleIntervalMs;
      if (sp.windowMs !== undefined) opts.windowMs = sp.windowMs;
      if (sp.topK !== undefined) opts.topK = sp.topK;
      const profiler = new SelfProfiler(opts);
      if (profiler.isSupported()) {
        profiler.start();
        this.selfProfiler = profiler;
        this.uninstalls.push(() => {
          this.selfProfiler?.teardown();
          delete this.selfProfiler;
        });
      } else {
        console.warn(
          "[Crawler] selfProfile enabled but JS Self-Profiling API unavailable (need Document-Policy: js-profiling header + Chromium)."
        );
      }
    }

    if (this.config.memoryProfile?.enabled) {
      const mp = this.config.memoryProfile;
      const collector = new MemoryCollector(
        mp.intervalMs !== undefined ? { intervalMs: mp.intervalMs } : {}
      );
      collector.start();
      this.memoryCollector = collector;
      this.uninstalls.push(() => {
        this.memoryCollector?.teardown();
        delete this.memoryCollector;
      });
    }

    if (this.config.audioProfile?.enabled) {
      this.audioCollector = new AudioMeasurementCollector();
      this.audioCollector.attach();
      this.uninstalls.push(() => {
        this.audioCollector?.detach();
        delete this.audioCollector;
      });
    }

    // Inspector is always available (cheap - no DOM until shown) so that
    // openInspector() works regardless of HUD state.
    this.inspector = new WorstFrameInspector();
    this.uninstalls.push(() => {
      this.inspector?.hide();
      delete this.inspector;
    });

    if (this.config.hud) this._mountHud();

    if (this.config.telemetry) {
      const t = this.config.telemetry;
      this._deviceId = makeDeviceId();
      this.flusher = new TelemetryFlusher(this, {
        sink: t.sink,
        windowMs: t.sampling?.windowMs ?? DEFAULT_TELEMETRY_WINDOW_MS,
        rawFrames: t.rawFrames ?? "never",
      });
      this.flusher.start();
      this.uninstalls.push(() => {
        this.flusher?.stop();
        delete this.flusher;
      });
    }
  }

  private _mountHud(): void {
    if (this.hud) return;
    const h = new CrawlerHud(this);
    if (this.recordCb) h.onRecord(this.recordCb);
    h.setRecording(this.recordingActive);
    h.mount();
    this.hud = h;
  }

  /** Frame budget in milliseconds (target refresh rate). The HUD reads it to normalize the bars. */
  get targetFrameMs(): number {
    return this.config.targetFrameMs;
  }

  /**
   * Resolved `workloadCost` config (`undefined` -> built-in defaults).
   *
   * @internal Read by the telemetry flusher; not part of the consumer API.
   */
  get workloadCostConfig(): WorkloadCostConfig | undefined {
    return this.config.workloadCost;
  }

  /**
   * Resolved `gpuCost` config (`undefined` -> built-in defaults).
   *
   * @internal Read by the telemetry flusher; not part of the consumer API.
   */
  get gpuCostConfig(): GpuCostConfig | undefined {
    return this.config.gpuCost;
  }

  /** Content label for subsequent TelemetryBatch (corpus attribution during
   *  calibration). The game calls it on scene transitions; `undefined` clears the label. */
  setTelemetryLabel(label: string | undefined): void {
    this._telemetryLabel = label;
  }

  /** Current content label (read by the flusher). */
  get telemetryLabel(): string | undefined {
    return this._telemetryLabel;
  }

  /** True when attach received Ticker.shared - the same ticker as
   *  Spine.internalUpdate. The HUD switches spine-cpu attribution to prePixi
   *  (of the same frame) instead of postPixi (cross-frame). */
  get usesSharedTicker(): boolean {
    return this._sharedTicker;
  }

  /**
   * Resident GPU texture memory, in megabytes.
   *
   * @remarks
   * On-demand walk of the renderer's managed `TextureSource` set (not a running
   * counter, which can drift): `Σ pixelW·pixelH·bytesPerPixel(format)`. O(N) over
   * resident textures (typically <1000) - call sparingly, not per frame.
   *
   * @returns Resident texture bytes / 1024² (0 when the renderer/texture system is unavailable).
   */
  getGpuTextureMb(): number {
    const items = this.renderer?.texture?._managedTextures?.items;
    if (!items) return 0;
    let bytes = 0;
    for (const item of Object.values(items)) {
      // GCManagedHash stores the TextureSource itself directly as the item; just in
      // case, we support both variants (item or item.source).
      const src =
        (item as { source?: TextureSourceLike } | undefined)?.source ??
        (item as TextureSourceLike | undefined);
      if (!src) continue;
      if (
        typeof src.pixelWidth === "number" &&
        typeof src.pixelHeight === "number"
      ) {
        bytes += src.pixelWidth * src.pixelHeight * bytesPerPixel(src.format);
      }
    }
    return bytes / (1024 * 1024);
  }

  /** The Spine measurement collector, or `undefined` when `spineProfile` is off. */
  getSpineCollector(): SpineMeasurementCollector | undefined {
    return this.spineCollector;
  }

  /** The audio measurement collector, or `undefined` when `audioProfile` is off. */
  getAudioCollector(): AudioMeasurementCollector | undefined {
    return this.audioCollector;
  }

  /** Top sampled self-time functions over the last window (JS Self-Profiling).
   *  Empty when selfProfile is off / unsupported / before the first window. */
  getSelfProfileTop(): HotFunction[] {
    return this.selfProfiler?.getTop() ?? [];
  }

  /** Latest process-level memory snapshot (measureUserAgentSpecificMemory), or
   *  undefined when memoryProfile is off / unsupported / before first measurement. */
  getMemoryMeasurement(): MemoryMeasurement | undefined {
    return this.memoryCollector?.getLatest();
  }

  /**
   * Open, device- and game-independent workload measure for the current window.
   *
   * @remarks
   * `cost = Σ weight·counter` in fixed units (no saturation), aggregated p95/mean
   * over the last {@link FPS_WINDOW_FRAMES} frames; the same scene yields the same
   * number on any hardware. This is NOT an fps prediction - real device-dependent
   * slowdown (drop rate, p95 ms) lives separately under {@link WorkloadCost.device}.
   * See `core/workload-cost.ts`.
   *
   * @returns The measure, or `undefined` when `workloadCost.enabled === false` or fewer than 2 frames exist.
   */
  getWorkloadCost(): WorkloadCost | undefined {
    if (this.config.workloadCost?.enabled === false) return undefined;
    return computeWorkloadCost(this.getFrames(), {
      ...(this.config.workloadCost ? { config: this.config.workloadCost } : {}),
      windowFrames: FPS_WINDOW_FRAMES,
    });
  }

  /** Root of the last render's scene-graph (for the gpuCost fill walk). */
  get sceneRoot(): FillNode | undefined {
    return this.renderer?._lastObjectRendered as unknown as
      | FillNode
      | undefined;
  }

  /** The renderer's device pixel ratio (dpr for fill area). */
  get rendererResolution(): number {
    return this.renderer?.resolution ?? 1;
  }

  /** Viewport size (CSS px) to clamp fill to the screen. {0,0} if unknown. */
  get rendererScreen(): { width: number; height: number } {
    const s = this.renderer?.screen;
    return { width: s?.width ?? 0, height: s?.height ?? 0 };
  }

  /**
   * Open GPU-heaviness measure, symmetric to {@link Crawler.getWorkloadCost}.
   *
   * @remarks
   * `cost = Σ weight·value` with a fill axis derived from live scene-graph bounds.
   * Honestly partial: `coverage='partial'` (bounds-proxy fill, particle-blind) and
   * the weights are placeholders until calibrated against `gpuMs`. The fill axis
   * reads the LIVE stage, so this is NOT reproducible offline from `raw_frames`.
   * See `core/gpu-cost.ts`.
   *
   * @returns The measure, or `undefined` when `gpuCost.enabled === false` or fewer than 2 frames exist.
   */
  getGpuCost(): GpuCost | undefined {
    if (this.config.gpuCost?.enabled === false) return undefined;
    const s = this.rendererScreen;
    return computeGpuCost(
      this.getFrames(),
      this.sceneRoot,
      this.rendererResolution,
      s.width,
      s.height,
      {
        ...(this.config.gpuCost ? { config: this.config.gpuCost } : {}),
        windowFrames: FPS_WINDOW_FRAMES,
      }
    );
  }

  /**
   * Tear down: restore every patched prototype/listener and unmount the HUD.
   *
   * @remarks
   * Idempotent - a no-op when not attached. Does NOT flush a final telemetry
   * batch; use {@link Crawler.dispose} for that. The frame ring buffer is left
   * intact, so {@link Crawler.getFrames} still returns the recorded window.
   */
  detach(): void {
    if (!this.attached) return;
    this.hud?.unmount();
    delete this.hud;
    for (const fn of this.uninstalls.reverse()) fn();
    this.uninstalls = [];
    this.perPipeStats.clear();
    this._sharedTickEndSubscribed = false;
    this.attached = false;
  }

  /**
   * Graceful shutdown for embedded use: flush a final telemetry batch, then detach.
   *
   * @remarks
   * Drains pending GPU queries and flushes the last telemetry window (so it isn't
   * lost) before {@link Crawler.detach}. Idempotent - a no-op when not attached.
   * Prefer this over `detach()` when telemetry is configured.
   *
   * @returns A promise that resolves once the final flush and detach complete.
   */
  async dispose(): Promise<void> {
    if (!this.attached) return;
    this.flusher?.pause();
    await this.flushPendingGpu();
    this.flusher?.flushNow();
    this.detach();
  }

  // ---- embeddable submodule API ----

  /**
   * Build and send one telemetry batch immediately (drains GPU queries first).
   *
   * @returns The batch that was sent, or `undefined` when telemetry is off or no frames are pending.
   */
  async flushNow(): Promise<TelemetryBatch | undefined> {
    await this.flushPendingGpu();
    return this.flusher?.flushNow();
  }

  /** Mount/unmount the DOM HUD overlay at runtime. */
  setHud(visible: boolean): void {
    if (visible) this._mountHud();
    else {
      this.hud?.unmount();
      delete this.hud;
    }
  }

  /** Open the frame explorer (timeline + per-frame metrics). Pins to the worst
   *  frame when one exists, otherwise follows the latest frame live. */
  openInspector(): void {
    this.inspector?.open(this, this.getWorstFrame()?.frame.frameIdx);
  }

  // ---- frame recording (export -> JSON -> offline replay) ----

  /** Begin a built-in recording: every subsequent flushed frame is accumulated
   *  (beyond the ring buffer) until `stopRecording()` or the cap. Clears any
   *  prior recording. */
  startRecording(): void {
    this.recordedFrames = [];
    this.isRecordingActive = true;
    this.hud?.syncRecorder();
  }

  /** Stop accumulating. The recorded frames are kept for `getRecording()` /
   *  export until the next `startRecording()`. */
  stopRecording(): void {
    this.isRecordingActive = false;
    this.hud?.syncRecorder();
  }

  isRecording(): boolean {
    return this.isRecordingActive;
  }

  /** Frames accumulated by the current/last recording (0 if never recorded). */
  recordedFrameCount(): number {
    return this.recordedFrames.length;
  }

  /** Snapshot the recording as a JSON-serialisable object. Uses the accumulated
   *  recording when one exists, else the current ring buffer (so "save" always
   *  yields the most recent frames even without an explicit start/stop). */
  getRecording(): FrameRecording {
    const frames =
      this.recordedFrames.length > 0 ? this.recordedFrames : this.getFrames();
    return {
      version: 1,
      sessionId: this.sessionId,
      recordedAtMs: Date.now(),
      targetFrameMs: this.config.targetFrameMs,
      frames: [...frames],
    };
  }

  /** Open the inspector over a recording (offline replay - no live scene, so the
   *  render-group/instruction dump is unavailable). Accepts a loaded JSON object. */
  openRecording(recording: FrameRecording): void {
    this.inspector?.openRecording(recording);
  }

  /** Register a callback for the HUD "Record" button. `undefined` removes it. */
  onRecord(
    cb: ((nextActive: boolean) => Promise<void> | void) | undefined
  ): void {
    this.recordCb = cb;
    this.hud?.onRecord(cb);
  }

  /** Update the HUD record-button visual state (does not invoke the callback). */
  setRecordingActive(active: boolean): void {
    this.recordingActive = active;
    this.hud?.setRecording(active);
  }

  /** Whether {@link Crawler.attach} has run and teardown hasn't happened yet. */
  isAttached(): boolean {
    return this.attached;
  }

  /** Snapshot of the recorded frame ring buffer, oldest->newest. */
  getFrames(): FrameRecord[] {
    return this.buffer.toArray();
  }

  /** The most recently flushed frame, or `undefined` before the first flush. */
  getLastFrame(): FrameRecord | undefined {
    return this.buffer.last();
  }

  /** Frame index of the most recent frame, or `-1` before the first flush. */
  getLastFrameIdx(): number {
    return this.buffer.last()?.frameIdx ?? -1;
  }

  /**
   * Drain pending `EXT_disjoint_timer_query_webgl2` results into `FrameRecord.gpuMs`.
   *
   * @remarks
   * GPU queries complete 1-3 frames late; after a measurement window ends, call
   * this to backfill the last frames' `gpuMs` before aggregation. Polls via
   * `requestAnimationFrame` until the pending queue empties or the timeout elapses;
   * any still-pending queries are dropped (their `gpuMs` stays undefined).
   *
   * @param timeoutMs - Maximum time to poll before giving up.
   * @defaultValue 50
   * @returns A promise that resolves when draining finishes or times out.
   */
  flushPendingGpu(timeoutMs = 50): Promise<void> {
    return this.gpuTimer?.flushPending(timeoutMs) ?? Promise.resolve();
  }

  /**
   * Build a {@link FrameCapture} for the latest frame (record + live scene dump).
   *
   * @returns The capture, or `null` when no frame has been recorded yet.
   */
  capture(): FrameCapture | null {
    const last = this.buffer.last();
    if (!last) return null;
    return this._buildCapture(last);
  }

  /**
   * Capture the next frame to be flushed.
   *
   * @returns A promise that resolves with that frame's {@link FrameCapture} on the next flush.
   */
  captureNext(): Promise<FrameCapture> {
    return new Promise((resolve) => {
      this.captureNextResolvers.push(resolve);
    });
  }

  /** The worst frame seen so far (highest `measuredCpuMs` past the threshold), or `undefined`. */
  getWorstFrame(): FrameCapture | undefined {
    return this.worstFrame;
  }

  /** Forget the current worst frame so the next overrun becomes the new worst. */
  clearWorstFrame(): void {
    this.worstFrame = undefined;
  }

  /**
   * Pixi `prerender` runner hook - stamps the phase boundary and drives GPU timing.
   *
   * @internal Invoked by the Pixi renderer's runner system, not by consumers.
   */
  prerender(): void {
    this.prerenderMark = performance.now();
    // Backstop for the filter-depth gate: nesting never survives a frame, so
    // a throw inside FilterSystem.push/pop that left _filterActiveDepth > 0
    // (and silently zeroed renderTargetSwitches) self-heals at frame start.
    this._filterActiveDepth = 0;
    this.gpuTimer?.poll();
    this.gpuTimer?.beginFrame();
  }
  /** @internal Pixi `renderStart` runner hook. */
  renderStart(): void {
    this.renderStartMark = performance.now();
  }
  /** @internal Pixi `render` runner hook. */
  render(): void {
    this.renderMark = performance.now();
  }
  /** @internal Pixi `renderEnd` runner hook. */
  renderEnd(): void {
    this.renderEndMark = performance.now();
    this.gpuTimer?.endFrame();
  }
  /** @internal Pixi `postrender` runner hook. */
  postrender(): void {
    this.postrenderMark = performance.now();
  }

  private _onTickStart = (): void => {
    this.tickStart = performance.now();
    this._maybeSubscribeSharedTickEnd();
  };

  /** Subscribe `_onSharedTickEnd` to Ticker.shared the first frame it's actually
   *  running (count>0). Idempotent + cheap (a count read + two flags) so it's safe
   *  to call every frame from _onTickStart. No-op under a shared ticker. */
  private _maybeSubscribeSharedTickEnd(): void {
    if (this._sharedTicker || this._sharedTickEndSubscribed) return;
    if (Ticker.shared.count <= 0) return;
    Ticker.shared.add(this._onSharedTickEnd, this, UPDATE_PRIORITY.UTILITY);
    this._sharedTickEndSubscribed = true;
    this.uninstalls.push(() =>
      Ticker.shared.remove(this._onSharedTickEnd, this)
    );
  }

  private _onTickEnd = (): void => {
    this._flushFrame(performance.now());
  };

  // End of the Ticker.shared tick. Patched into the postPixi split on the next flush.
  private _onSharedTickEnd = (): void => {
    this.sharedTickEndMs = performance.now();
  };

  private _wrapMethod<T extends Record<K, AnyFn>, K extends keyof T>(
    target: T,
    key: K,
    wrap: (orig: AnyFn) => AnyFn
  ): void {
    const orig = target[key].bind(target) as AnyFn;
    (target[key] as AnyFn) = wrap(orig);
    this.uninstalls.push(() => {
      (target[key] as AnyFn) = orig;
    });
  }

  private _flushFrame(tickEnd: number): void {
    // Patch the previous frame's postPixiMs retroactively: at its flush
    // we knew only tickEnd, not the next cycle's rAF_start. We are now inside
    // the next cycle and `tickStart` ~= rAF_start of this frame. That interval
    // includes other rAF subscribers (Ticker.shared -> Spine.internalUpdate)
    // plus the browser's style+layout+composite.
    if (this.lastTickEndMs > 0) {
      const prev = this.buffer.last();
      if (prev) {
        prev.postPixiMs = Math.max(0, this.tickStart - this.lastTickEndMs);
        // Duration of the previous cycle's Ticker.shared tick = sharedTickEnd - tickEnd.
        // sharedTickEndMs is captured in the Ticker.shared tick AFTER the previous flush and
        // BEFORE the current one - it belongs to prev. <= postPixi (the shared tick ends
        // before the next app.ticker start), so the split stays additive.
        if (this.sharedTickEndMs > this.lastTickEndMs) {
          prev.sharedTickerMs = this.sharedTickEndMs - this.lastTickEndMs;
        }
      }
    }

    const prerenderMs = this.renderStartMark - this.prerenderMark;
    const renderStartMs = this.renderMark - this.renderStartMark;
    const renderMs = this.renderEndMark - this.renderMark;
    const renderEndMs = this.postrenderMark - this.renderEndMark;
    const postrenderMs = tickEnd - this.postrenderMark;
    const phasesSum =
      prerenderMs + renderStartMs + renderMs + renderEndMs + postrenderMs;
    const tickListenersMs = tickEnd - this.tickStart - phasesSum;
    const measuredCpuMs = tickEnd - this.tickStart;
    const rafDeltaMs =
      this.prevTickStart === 0 ? 0 : this.tickStart - this.prevTickStart;
    const unaccountedMs = rafDeltaMs === 0 ? 0 : rafDeltaMs - measuredCpuMs;
    const frameDropped =
      rafDeltaMs > 0 && rafDeltaMs > this.config.targetFrameMs * 1.5;

    // Honest frame partition by rAF anchor: pre-pixi is the window from our
    // INTERACTION listener (~ rAF cycle start) to the first pixi mark. Covers
    // user listeners of HIGH+NORMAL priority in app.ticker. post-pixi for the current
    // frame fills in on the next flush (see the patch above).
    const rafStartMs = this.tickStart;
    const prePixiMs = Math.max(0, this.prerenderMark - this.tickStart);

    const longTasksAgg = this.longTasks.harvest();
    const heapMb = this.config.enableHeapSnapshot ? readHeapMb() : undefined;

    const browser: FrameRecord["browser"] = {
      longTasksMsThisFrame: longTasksAgg.msSum,
      longTasksCount: longTasksAgg.count,
    };
    if (heapMb !== undefined) browser.jsHeapMb = heapMb;

    const record: FrameRecord = {
      frameIdx: this.frameIdx++,
      rafDeltaMs,
      frameDropped,
      measuredCpuMs,
      unaccountedMs,
      rafStartMs,
      prePixiMs,
      postPixiMs: 0,
      phases: {
        tickListenersMs,
        prerenderMs,
        renderStartMs,
        renderMs,
        renderEndMs,
        postrenderMs,
        gcMs: this.gcMs,
      },
      counters: {
        drawCalls: this.drawCalls,
        rebuilds: this.rebuilds,
        instructions: this._sumInstructions(),
        renderGroupsRebuilt: this.renderGroupsRebuilt,
        stateChanges: this.stateChanges,
        shaderCompiles: this.shaderCompiles,
        bufferUploads: this.bufferUploads,
        bufferBytesUploaded: this.bufferBytesUploaded,
        batchBreaks: this.batchBreaks,
        renderablesUpdated: this.renderablesUpdated,
        verticesDrawn: this.verticesDrawn,
        stencilMaskPasses: this.stencilMaskPasses,
        renderTargetSwitches: this.renderTargetSwitches,
      },
      textures: {
        uploadsThisFrame: this.realGpuUploadsThisFrame,
        realGpuUploadsThisFrame: this.realGpuUploadsThisFrame,
        unloadsThisFrame: this.texturesUnloadedThisFrame,
        bytesUploadedThisFrame: this.bytesUploadedThisFrame,
        activeGpuCount: this.activeGpuCount,
      },
      browser,
    };

    // sceneHash - a walk of the whole tree + per-char FNV every frame. Costly
    // at 120fps and normally unread -> only under an explicit flag.
    if (this.config.sceneHashTracking)
      record.sceneHash = this._computeSceneHash();

    if (this.config.deepRenderSplit) {
      const buildUpdateUpload =
        this.buildInstructionsMs +
        this.updateRenderablesMs +
        this.batchUploadMs;
      const transformsMs = Math.max(
        0,
        this.updateRenderGroupsMs - buildUpdateUpload
      );
      const renderOtherMs = Math.max(
        0,
        renderMs - this.updateRenderGroupsMs - this.pipeExecuteMs
      );
      record.renderSplit = {
        buildInstructionsMs: this.buildInstructionsMs,
        updateRenderablesMs: this.updateRenderablesMs,
        batchUploadMs: this.batchUploadMs,
        transformsMs,
        executeInstructionsMs: this.pipeExecuteMs,
        renderOtherMs,
      };
    }

    if (this.config.filterProfile) {
      record.filter = {
        pushMs: this.filterPushMs,
        popMs: this.filterPopMs,
        applyMs: this.filterApplyMs,
        passes: this.filterPasses,
      };
    }

    if (this.asyncMsThisFrame > 0) {
      record.asyncMs = this.asyncMsThisFrame;
    }

    const spineMetrics = this.spineCollector?.flush();
    if (spineMetrics) record.spine = spineMetrics;

    const loafSnap = this.loaf.harvest();
    if (loafSnap) record.loaf = loafSnap;

    const audioMetrics = this.audioCollector?.flush();
    if (audioMetrics) record.audio = audioMetrics;

    if (this.config.pipeProfile && this.perPipeStats.size > 0) {
      const perPipe: Record<string, PerPipeBucket> = {};
      for (const [name, stats] of this.perPipeStats) {
        if (stats.invocations === 0) continue;
        perPipe[name] = {
          ms: stats.ms,
          drawCalls: stats.drawCalls,
          invocations: stats.invocations,
        };
      }
      record.perPipe = perPipe;
    }

    // We pass the per-call timeline into record as a separate array, and start a new
    // buffer for the next frame (passed by reference, not copied - record
    // owns the array, the ring buffer keeps it as long as needed).
    if (this.config.pipeProfile && this.pipeExecuteCalls.length > 0) {
      record.pipeExecuteCalls = this.pipeExecuteCalls;
      this.pipeExecuteCalls = [];
    } else {
      this.pipeExecuteCalls.length = 0;
    }

    this.buffer.push(record);
    if (
      this.isRecordingActive &&
      this.recordedFrames.length < Crawler.RECORDING_CAP
    ) {
      this.recordedFrames.push(record);
    }
    this.prevTickStart = this.tickStart;
    this.lastTickEndMs = tickEnd;

    const worstThreshold =
      this.config.worstFrameMs ?? this.config.targetFrameMs;
    const beatsWorst =
      record.measuredCpuMs > worstThreshold &&
      (!this.worstFrame ||
        record.measuredCpuMs > this.worstFrame.frame.measuredCpuMs);
    const hasCaptureRequest = this.captureNextResolvers.length > 0;
    if (beatsWorst || hasCaptureRequest) {
      const cap = this._buildCapture(record);
      if (beatsWorst) this.worstFrame = cap;
      if (hasCaptureRequest) {
        const resolvers = this.captureNextResolvers;
        this.captureNextResolvers = [];
        for (const r of resolvers) r(cap);
      }
    }

    this.drawCalls = 0;
    this.rebuilds = 0;
    this.batchBreaks = 0;
    this.gcMs = 0;
    this.renderGroupsRebuilt = 0;
    this.verticesDrawn = 0;
    this.stencilMaskPasses = 0;
    this.renderTargetSwitches = 0;
    // _lastBoundRT is a running cross-frame field - do not reset (like activeGpuCount).
    this.buildInstructionsMs = 0;
    this.updateRenderablesMs = 0;
    this.renderablesUpdated = 0;
    this.batchUploadMs = 0;
    this.updateRenderGroupsMs = 0;
    this.pipeExecuteMs = 0;
    this.filterPushMs = 0;
    this.filterPopMs = 0;
    this.filterApplyMs = 0;
    this.filterPasses = 0;
    this.stateChanges = 0;
    this.shaderCompiles = 0;
    this.bufferUploads = 0;
    this.bufferBytesUploaded = 0;
    this.realGpuUploadsThisFrame = 0;
    this.bytesUploadedThisFrame = 0;
    this.texturesUnloadedThisFrame = 0;
    this.asyncMsThisFrame = 0;
    // activeGpuCount is a running counter - do not reset.
    for (const stats of this.perPipeStats.values()) {
      stats.ms = 0;
      stats.drawCalls = 0;
      stats.invocations = 0;
    }
  }

  private _sumInstructions(): number {
    const root = this.renderer?._lastObjectRendered?.renderGroup;
    return root ? sumGroupInstructions(root) : 0;
  }

  private _computeSceneHash(): string {
    const root = this.renderer?._lastObjectRendered?.renderGroup;
    if (!root) return "";
    let h = 0x811c9dc5;
    h = walkHash(root, h);
    return (h >>> 0).toString(16);
  }

  private _buildCapture(frame: FrameRecord): FrameCapture {
    const root = this.renderer?._lastObjectRendered?.renderGroup;
    const instructions: InstructionDump[] = [];
    const renderGroups: RenderGroupDump[] = [];
    if (root) {
      dumpInstructions(root, instructions);
      dumpRenderGroups(root, 0, renderGroups);
    }
    return { frame, instructions, renderGroups };
  }

  private _wrapGlDrawMethods(gl: WebGL2RenderingContext): void {
    type DrawMethod =
      | "drawElements"
      | "drawElementsInstanced"
      | "drawArrays"
      | "drawArraysInstanced";
    const methods: DrawMethod[] = [
      "drawElements",
      "drawElementsInstanced",
      "drawArrays",
      "drawArraysInstanced",
    ];
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    for (const name of methods) {
      const orig = gl[name] as (...args: unknown[]) => unknown;
      // Per-method arg layout for the vertex/index count (proxy of vertex-shader
      // + primitive-assembly load -> gpuCost `vertices`). `count` index + optional
      // instanceCount index, captured in the closure so the hot path branches on
      // constants, not on `name`:
      //   drawElements(mode, COUNT, type, offset)
      //   drawElementsInstanced(mode, COUNT, type, offset, INSTANCE)
      //   drawArrays(mode, first, COUNT)
      //   drawArraysInstanced(mode, first, COUNT, INSTANCE)
      let countIdx = -1,
        instIdx = -1;
      switch (name) {
        case "drawElements":
          countIdx = 1;
          break;
        case "drawElementsInstanced":
          countIdx = 1;
          instIdx = 4;
          break;
        case "drawArrays":
          countIdx = 2;
          break;
        case "drawArraysInstanced":
          countIdx = 2;
          instIdx = 3;
          break;
      }
      // Hot wrapper - fires per draw call (hundreds/frame on heavy scenes).
      // Use a plain function + `apply(gl, arguments)` to hit V8's
      // `f.apply(ctx, arguments)` fast path: a `(...args)` rest param would
      // allocate a fresh array on EVERY draw call (~60k allocs/sec at 500
      // draws × 120fps), churning the GC the profiler is meant to measure.
      // Indexed `arguments[k]` reads stay on the fast path (no rest param).
      (gl[name] as unknown as AnyFn) = function (this: unknown): unknown {
        self.drawCalls++;
        // eslint-disable-next-line prefer-rest-params
        const c = arguments[countIdx] as number;
        if (typeof c === "number") {
          if (instIdx >= 0) {
            // eslint-disable-next-line prefer-rest-params
            const inst = arguments[instIdx] as number;
            self.verticesDrawn += typeof inst === "number" ? c * inst : c;
          } else {
            self.verticesDrawn += c;
          }
        }
        // eslint-disable-next-line prefer-rest-params
        return orig.apply(gl, arguments as unknown as unknown[]);
      };
      this.uninstalls.push(() => {
        (gl[name] as unknown as AnyFn) = orig as AnyFn;
      });
    }
  }
}

function sumGroupInstructions(group: RenderGroupLike): number {
  let sum = group.instructionSet?.instructionSize ?? 0;
  const children = group.renderGroupChildren;
  if (children) {
    for (const child of children) sum += sumGroupInstructions(child);
  }
  return sum;
}

function walkHash(group: RenderGroupLike, hashIn: number): number {
  let h = hashIn;
  const instructions = group.instructionSet?.instructions ?? [];
  const count = group.instructionSet?.instructionSize ?? 0;
  for (let i = 0; i < count; i++) {
    const instr = instructions[i];
    if (!instr) continue;
    h = fnv1aFold(h, instr.renderPipeId ?? "?");
    if (instr.action) h = fnv1aFold(h, instr.action);
  }
  const children = group.renderGroupChildren;
  if (children) {
    for (const child of children) h = walkHash(child, h);
  }
  return h;
}

function fnv1aFold(hashIn: number, s: string): number {
  let h = hashIn;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h;
}

function dumpInstructions(
  group: RenderGroupLike,
  out: InstructionDump[]
): void {
  const instructions = group.instructionSet?.instructions ?? [];
  const count = group.instructionSet?.instructionSize ?? 0;
  for (let i = 0; i < count; i++) {
    const instr = instructions[i];
    if (!instr) continue;
    const dump: InstructionDump = {
      index: out.length,
      renderPipeId: instr.renderPipeId ?? "?",
    };
    if (instr.action) dump.action = instr.action;
    if (instr.canBundle !== undefined) dump.canBundle = instr.canBundle;
    out.push(dump);
  }
  const children = group.renderGroupChildren;
  if (children) {
    for (const child of children) dumpInstructions(child, out);
  }
}

function dumpRenderGroups(
  group: RenderGroupLike,
  depth: number,
  out: RenderGroupDump[]
): void {
  out.push({
    depth,
    instructionCount: group.instructionSet?.instructionSize ?? 0,
    childrenCount: group.renderGroupChildren?.length ?? 0,
    isCachedAsTexture: group.isCachedAsTexture === true,
  });
  const children = group.renderGroupChildren;
  if (children) {
    for (const child of children) dumpRenderGroups(child, depth + 1, out);
  }
}

// Bytes per pixel for Pixi 8 format strings. Compressed/exotic formats fall back to 4 (RGBA8).
function bytesPerPixel(format: string | undefined): number {
  switch (format) {
    case "r8unorm":
    case "r8snorm":
    case "r8uint":
    case "r8sint":
    case "stencil8":
      return 1;
    case "rg8unorm":
    case "rg8snorm":
    case "rg8uint":
    case "rg8sint":
    case "r16uint":
    case "r16sint":
    case "r16float":
    case "depth16unorm":
      return 2;
    case "rgba8unorm":
    case "rgba8unorm-srgb":
    case "rgba8snorm":
    case "rgba8uint":
    case "rgba8sint":
    case "bgra8unorm":
    case "bgra8unorm-srgb":
    case "rg16uint":
    case "rg16sint":
    case "rg16float":
    case "r32uint":
    case "r32sint":
    case "r32float":
    case "depth24plus":
    case "depth24plus-stencil8":
    case "depth32float":
      return 4;
    case "rgba16uint":
    case "rgba16sint":
    case "rgba16float":
    case "rg32uint":
    case "rg32sint":
    case "rg32float":
      return 8;
    case "rgba32uint":
    case "rgba32sint":
    case "rgba32float":
      return 16;
    default:
      return 4;
  }
}
