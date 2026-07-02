import { type FrameStats, StatsAggregator } from "../../core/stats";
import type { FrameRecord } from "../../types";

/**
 * Shared aggregate helpers used by:
 *   - profiler/telemetry/batch.ts    -> TelemetryBatch (live game session)
 *
 * Same FrameRecord fields, same percentile recipe - only the output shape
 * differs. Keep the field lists below in one place to avoid drift.
 */

export const PHASE_PATHS: readonly string[] = [
  "phases.prerenderMs",
  "phases.renderStartMs",
  "phases.renderMs",
  "phases.renderEndMs",
  "phases.postrenderMs",
  "phases.gcMs",
  "renderSplit.buildInstructionsMs",
  "renderSplit.updateRenderablesMs",
  "renderSplit.batchUploadMs",
  "renderSplit.transformsMs",
  "renderSplit.executeInstructionsMs",
  "renderSplit.renderOtherMs",
  "filter.applyMs",
  "filter.pushMs",
  "filter.popMs",
  "prePixiMs",
  "postPixiMs",
];

export const COUNTER_FIELDS = [
  "drawCalls",
  "rebuilds",
  "instructions",
  "renderGroupsRebuilt",
  "stateChanges",
  "shaderCompiles",
  "bufferUploads",
  "bufferBytesUploaded",
  "batchBreaks",
  "renderablesUpdated",
  "verticesDrawn",
  "stencilMaskPasses",
  "renderTargetSwitches",
] as const;

export interface PhaseQuantiles {
  /** Arithmetic mean. Tier 4 calibration fitting uses mean ratios across
   *  devices (Σ phase_ms / N samples - stable on long windows). */
  mean: number;
  p50: number;
  p95: number;
}

export interface SpineSummary {
  active: number;
  cpuP95: number;
  pipeP95: number;
}

export interface GpuSummary {
  p95: number;
  coverage: number;
}

export interface AggregateResult {
  samples: number;
  frameTotal: FrameStats;
  /** Raw FrameRecord phase paths (see PHASE_PATHS). Pixi internal phase ms,
   *  not derived. Used by the HUD/inspector for diagnostics. */
  phases: Record<string, PhaseQuantiles>;
  counters: Record<string, number>;
  spine?: SpineSummary;
  gpu?: GpuSummary;
}

/**
 * Strip the last frame because its postPixiMs is not yet patched. HUD does
 * the same; see `buildAveragedView` in hud.ts.
 */
export function stableSlice(
  frames: readonly FrameRecord[]
): readonly FrameRecord[] {
  return frames.length > 1 ? frames.slice(0, -1) : frames;
}

export function aggregateFrames(
  frames: readonly FrameRecord[]
): AggregateResult {
  const usable = stableSlice(frames);
  const stats = new StatsAggregator({ getFrames: () => usable });

  const frameTotal = stats.quantiles((f) => f.rafDeltaMs) ?? {
    samples: 0,
    min: 0,
    max: 0,
    avg: 0,
    p50: 0,
    p95: 0,
    p99: 0,
  };

  const phases: Record<string, PhaseQuantiles> = {};
  for (const path of PHASE_PATHS) {
    const s = stats.quantiles(stats.path(path));
    if (!s) continue;
    phases[path] = { mean: s.avg, p50: s.p50, p95: s.p95 };
  }

  const counters: Record<string, number> = {};
  for (const field of COUNTER_FIELDS) {
    let sum = 0;
    for (const f of usable) sum += f.counters[field];
    counters[field] = sum;
  }

  const result: AggregateResult = {
    samples: usable.length,
    frameTotal,
    phases,
    counters,
  };

  const spineCpu = stats.quantiles((f) => spineCpuMs(f));
  const spinePipe = stats.quantiles((f) => spinePipeMs(f));
  const spineActive = lastDefined(usable, (f) => f.spine?.instanceCount);
  if (spineActive !== undefined && spineActive > 0 && spineCpu && spinePipe) {
    result.spine = {
      active: spineActive,
      cpuP95: spineCpu.p95,
      pipeP95: spinePipe.p95,
    };
  }

  const gpu = stats.quantiles((f) => f.gpuMs);
  if (gpu) {
    result.gpu = {
      p95: gpu.p95,
      coverage: gpu.samples / Math.max(1, usable.length),
    };
  }

  return result;
}

function spineCpuMs(f: FrameRecord): number | undefined {
  const s = f.spine;
  if (!s) return undefined;
  const p = s.phases;
  return (
    p.animationStateUpdateMs +
    p.skeletonPrePhysicsMs +
    p.animationApplyMs +
    p.worldTransformMs +
    p.slotObjectsMs
  );
}

function spinePipeMs(f: FrameRecord): number | undefined {
  const s = f.spine;
  if (!s) return undefined;
  const p = s.phases;
  return (
    p.pipeAddRenderableMs +
    p.pipeUpdateRenderableMs +
    p.pipeValidateRenderableMs
  );
}

function lastDefined<T>(
  frames: readonly FrameRecord[],
  pick: (f: FrameRecord) => T | undefined
): T | undefined {
  for (let i = frames.length - 1; i >= 0; i--) {
    const f = frames[i];
    if (!f) continue;
    const v = pick(f);
    if (v !== undefined) return v;
  }
  return undefined;
}
