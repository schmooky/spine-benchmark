import type { Crawler } from "../../crawler";

import { buildTelemetryBatch } from "./batch";
import type { RawFramesPolicy, TelemetryBatch, TelemetrySink } from "./types";

type RicFn = (cb: () => void, opts?: { timeout: number }) => number;

export interface TelemetryFlusherOpts {
  sink: TelemetrySink;
  windowMs: number;
  rawFrames: RawFramesPolicy;
}

/**
 * Periodic telemetry flush loop - a Crawler submodule. Owns the sampling
 * interval, the last-flushed cursor, and the sink-send error wrapper. Reads
 * identity (sessionId / deviceId / targetFrameMs) and frames straight off the
 * Crawler it's attached to.
 *
 * Lifecycle: `start()` on Crawler.attach, `stop()` on Crawler.detach. Final
 * flush is driven by Crawler.dispose() via `flushNow()` BEFORE detach, so the
 * last window isn't lost.
 */
export class TelemetryFlusher {
  private lastFlushedFrameIdx: number;
  private lastFlushAtMs = performance.now();
  private intervalId: number | undefined;
  private stopped = false;

  constructor(
    private readonly profiler: Crawler,
    private readonly opts: TelemetryFlusherOpts
  ) {
    this.lastFlushedFrameIdx = profiler.getLastFrameIdx();
  }

  start(): void {
    const ric = (globalThis as unknown as { requestIdleCallback?: RicFn })
      .requestIdleCallback;
    const schedule = (): void => {
      if (this.stopped) return;
      const job = (): void => {
        const batch = this._buildBatch();
        if (batch) this._send(batch);
      };
      if (ric) ric(job, { timeout: this.opts.windowMs });
      else window.setTimeout(job, 0);
    };
    this.intervalId = window.setInterval(schedule, this.opts.windowMs);
  }

  /** Clear the interval but keep `flushNow()` usable - used by dispose() to
   *  stop scheduled flushes before the final manual flush. */
  pause(): void {
    if (this.intervalId !== undefined) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
  }

  /** Full teardown - interval cleared and further flushes refused. */
  stop(): void {
    this.pause();
    this.stopped = true;
  }

  /** Build + send one batch immediately. No-op after `stop()`. */
  flushNow(): TelemetryBatch | undefined {
    const batch = this._buildBatch();
    if (batch) this._send(batch);
    return batch;
  }

  private _buildBatch(): TelemetryBatch | undefined {
    if (this.stopped) return undefined;
    const frames = this.profiler
      .getFrames()
      .filter((f) => f.frameIdx > this.lastFlushedFrameIdx);
    // Advance the cursor by what we actually AGGREGATE, derived from this same
    // snapshot - NOT a second live getLastFrameIdx() read. Two reasons:
    //   1. buildTelemetryBatch strips the last frame (its postPixiMs isn't
    //      patched yet); parking the cursor one short lets it re-enter the next
    //      window once patched, instead of being dropped forever.
    //   2. flush runs in requestIdleCallback - frames pushed between the
    //      snapshot above and a re-read of getLastFrameIdx() would be skipped
    //      and never aggregated (counters undercount, raw_frames gaps).
    const nextCursor =
      frames.length >= 2
        ? frames[frames.length - 2]!.frameIdx
        : this.lastFlushedFrameIdx;
    const now = performance.now();
    const workloadCostConfig = this.profiler.workloadCostConfig;
    const gpuCostConfig = this.profiler.gpuCostConfig;
    const gpuRoot = this.profiler.sceneRoot;
    const label = this.profiler.telemetryLabel;
    const batch = buildTelemetryBatch({
      frames,
      sessionId: this.profiler.sessionId,
      deviceId: this.profiler.deviceId,
      windowMs: now - this.lastFlushAtMs,
      targetFrameMs: this.profiler.targetFrameMs,
      rawFramesPolicy: this.opts.rawFrames,
      ...(workloadCostConfig ? { workloadCostConfig } : {}),
      ...(gpuCostConfig ? { gpuCostConfig } : {}),
      ...(gpuRoot
        ? {
            gpuRoot,
            gpuDpr: this.profiler.rendererResolution,
            gpuScreenW: this.profiler.rendererScreen.width,
            gpuScreenH: this.profiler.rendererScreen.height,
          }
        : {}),
      ...(label !== undefined ? { label } : {}),
    });
    if (!batch) return undefined;
    this.lastFlushedFrameIdx = nextCursor;
    this.lastFlushAtMs = now;
    return batch;
  }

  private _send(batch: TelemetryBatch): void {
    try {
      const r = this.opts.sink.send(batch);
      if (r && typeof r.catch === "function") {
        r.catch((err) => {
          console.warn("[crawler] telemetry sink rejected:", err);
        });
      }
    } catch (err) {
      console.warn("[crawler] telemetry sink threw:", err);
    }
  }
}
