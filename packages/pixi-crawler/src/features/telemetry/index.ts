/**
 * Telemetry feature barrel - periodic flush of aggregated FrameRecords to a
 * game-owned sink. Public surface for the composition root + lib entry.
 */
export { TelemetryFlusher } from "./flusher";
export type { TelemetryFlusherOpts } from "./flusher";
export { buildTelemetryBatch, shouldIncludeRawFrames } from "./batch";
export { aggregateFrames, stableSlice } from "./aggregate-core";
export type { AggregateResult } from "./aggregate-core";
export type {
  TelemetrySink,
  TelemetryBatch,
  TelemetryConfig,
  RawFramesPolicy,
} from "./types";
