import {
  type FillNode,
  type GpuCostConfig,
  computeGpuCost,
} from "../../core/gpu-cost";
import {
  type WorkloadCostConfig,
  computeWorkloadCost,
} from "../../core/workload-cost";
import type { FrameRecord } from "../../types";

import type { AggregateResult } from "./aggregate-core";
import { aggregateFrames, stableSlice } from "./aggregate-core";
import type { RawFramesPolicy, TelemetryBatch } from "./types";

export interface BuildBatchInput {
  readonly frames: readonly FrameRecord[];
  readonly sessionId: string;
  readonly deviceId: string | undefined;
  readonly windowMs: number;
  readonly targetFrameMs: number;
  readonly rawFramesPolicy: RawFramesPolicy;
  readonly workloadCostConfig?: WorkloadCostConfig;
  readonly gpuCostConfig?: GpuCostConfig;
  readonly gpuRoot?: FillNode;
  readonly gpuDpr?: number;
  readonly gpuScreenW?: number;
  readonly gpuScreenH?: number;
  readonly label?: string;
}

/**
 * Build the wire-format TelemetryBatch from a window of frames + run-time
 * identity. Returns undefined when fewer than 2 frames are usable (stable
 * slice strips the last unpatched frame; a 1-frame window can't be averaged).
 */
export function buildTelemetryBatch(
  input: BuildBatchInput
): TelemetryBatch | undefined {
  if (input.frames.length < 2) return undefined;
  const usable = stableSlice(input.frames);
  const agg = aggregateFrames(input.frames);

  const batch: TelemetryBatch = {
    schema_version: 2,
    session_id: input.sessionId,
    flushed_at: new Date().toISOString(),
    window_ms: input.windowMs,
    frames_captured: usable.length,
    ...(input.deviceId !== undefined ? { device_id: input.deviceId } : {}),
    ...(input.label !== undefined ? { label: input.label } : {}),
    aggregate: {
      frame_total_ms: {
        p50: agg.frameTotal.p50,
        p95: agg.frameTotal.p95,
        p99: agg.frameTotal.p99,
      },
      phases: agg.phases,
      counters: agg.counters,
    },
  };
  attachSpineSection(batch, agg);
  attachGpuSection(batch, agg);
  attachWorkloadCostSection(batch, input);
  attachGpuCostSection(batch, input);
  if (
    shouldIncludeRawFrames(
      input.rawFramesPolicy,
      agg.frameTotal.p95,
      input.targetFrameMs
    )
  ) {
    batch.raw_frames = [...usable];
  }
  return batch;
}

function attachWorkloadCostSection(
  batch: TelemetryBatch,
  input: BuildBatchInput
): void {
  if (input.workloadCostConfig?.enabled === false) return;
  // No `windowFrames` here on purpose: telemetry aggregates the WHOLE flush
  // window (~windowMs of frames), whereas Crawler.getWorkloadCost() (the HUD
  // readout) passes windowFrames=FPS_WINDOW_FRAMES for a rolling last-60 view.
  // Same recipe, different window - telemetry wants the period it's reporting on.
  const wc = computeWorkloadCost(input.frames, {
    ...(input.workloadCostConfig ? { config: input.workloadCostConfig } : {}),
  });
  if (!wc) return;
  batch.aggregate.workload_cost = {
    cost: wc.cost,
    bottleneck: wc.bottleneck,
    drivers: wc.drivers.map((d) => ({
      name: d.name,
      value: d.value,
      weight: d.weight,
      contribution: d.contribution,
    })),
    device: {
      drop_rate: wc.device.dropRate,
      frame_p95_ms: wc.device.frameP95Ms,
    },
  };
}

function attachGpuCostSection(
  batch: TelemetryBatch,
  input: BuildBatchInput
): void {
  if (input.gpuCostConfig?.enabled === false) return;
  const gc = computeGpuCost(
    input.frames,
    input.gpuRoot,
    input.gpuDpr ?? 1,
    input.gpuScreenW ?? 0,
    input.gpuScreenH ?? 0,
    {
      ...(input.gpuCostConfig ? { config: input.gpuCostConfig } : {}),
    }
  );
  if (!gc) return;
  batch.aggregate.gpu_cost = {
    cost: gc.cost,
    bottleneck: gc.bottleneck,
    drivers: gc.drivers.map((d) => ({
      name: d.name,
      value: d.value,
      weight: d.weight,
      contribution: d.contribution,
    })),
    fill_area: gc.fillArea,
    coverage: {
      status: gc.coverage.status,
      fill_kind: gc.coverage.fillKind,
      missing: gc.coverage.missing,
      bandwidth: gc.coverage.bandwidth,
      union_nodes: gc.coverage.unionNodes,
      screen_clamped: gc.coverage.screenClamped,
      bounds_errors: gc.coverage.boundsErrors,
      explains: gc.coverage.explains,
    },
  };
}

function attachSpineSection(batch: TelemetryBatch, agg: AggregateResult): void {
  if (!agg.spine) return;
  batch.aggregate.spine = {
    active: agg.spine.active,
    cpu_ms: { p95: agg.spine.cpuP95 },
    pipe_ms: { p95: agg.spine.pipeP95 },
  };
}

function attachGpuSection(batch: TelemetryBatch, agg: AggregateResult): void {
  if (!agg.gpu) return;
  batch.aggregate.gpu_ms = { p95: agg.gpu.p95, coverage: agg.gpu.coverage };
}

export function shouldIncludeRawFrames(
  policy: RawFramesPolicy,
  p95: number,
  targetMs: number
): boolean {
  if (policy === "never") return false;
  if (policy === "always") return true;
  return p95 > targetMs;
}
