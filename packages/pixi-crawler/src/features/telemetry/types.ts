import type { FrameRecord } from "../../types";

export interface TelemetrySink {
  /** Fire-and-forget. The profiler does not await this - Promise rejections
   * are caught and logged. Sink may buffer / retry internally. */
  send(batch: TelemetryBatch): void | Promise<void>;
}

export interface TelemetryBatch {
  schema_version: 2;
  session_id: string;
  /** Auto-generated unique device id, persisted in localStorage (stable across
   *  reloads). Present on every batch when telemetry is enabled. */
  device_id?: string;
  flushed_at: string;
  window_ms: number;
  frames_captured: number;
  /** Free-form content label (`crawler.setTelemetryLabel`). For attributing
   *  the calibration corpus by scene. Absent if not set. */
  label?: string;
  aggregate: {
    frame_total_ms: { p50: number; p95: number; p99: number };
    phases: Record<string, { mean: number; p50: number; p95: number }>;
    counters: Record<string, number>;
    spine?: {
      active: number;
      cpu_ms: { p95: number };
      pipe_ms: { p95: number };
    };
    gpu_ms?: { p95: number; coverage: number };
    /** Open device- and game-independent workload measure (`cost = sum weight*counter`,
     *  fixed units, no saturation) over the batch window. `device` is the device-dependent
     *  real indicator (drop / p95 ms), outside the measure. See `core/workload-cost.ts`. */
    workload_cost?: {
      cost: number;
      bottleneck: string;
      drivers: {
        name: string;
        value: number;
        weight: number;
        contribution: number;
      }[];
      device: { drop_rate: number; frame_p95_ms: number };
    };
    /** Open GPU measure (symmetric to workload_cost). fill is a footprint-proxy from
     *  the live stage (a snapshot at flush, NOT a window). coverage is loudly incomplete
     *  (proxy + particle-blind). Do NOT confuse with `gpu_ms` (a direct device-dependent
     *  measurement). See `core/gpu-cost.ts`. */
    gpu_cost?: {
      cost: number;
      bottleneck: string;
      drivers: {
        name: string;
        value: number;
        weight: number;
        contribution: number;
      }[];
      fill_area: number;
      coverage: {
        status: string;
        fill_kind: string;
        missing: string[];
        bandwidth: string;
        union_nodes: number;
        screen_clamped: boolean;
        bounds_errors: number;
        explains: number;
      };
    };
  };
  raw_frames?: FrameRecord[];
}

/**
 * never       - never include raw FrameRecord[] in TelemetryBatch
 * on-overrun  - include when aggregate.frame_total_ms.p95 > target frame ms
 * always      - include in every batch (debug builds only - payload ~200 KB)
 */
export type RawFramesPolicy = "never" | "on-overrun" | "always";

/**
 * Telemetry submodule config - opt-in via `CrawlerConfig.telemetry`. When set,
 * the Crawler owns a periodic flush loop that builds `TelemetryBatch`es from
 * the frame ring buffer and pushes them to the game-owned `sink`.
 */
export interface TelemetryConfig {
  /** Game-owned transport. Fire-and-forget; rejections caught + logged. */
  sink: TelemetrySink;
  /** Flush cadence in ms. Default 5000. */
  sampling?: { windowMs?: number };
  /** Raw-frame inclusion policy. Default 'never'. */
  rawFrames?: RawFramesPolicy;
}
