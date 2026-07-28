/**
 * @module @spine-benchmark/pixi-crawler
 *
 * A drop-in PixiJS 8 performance crawler: per-frame timing, a phase-split cost
 * breakdown (CPU pre / pixi build-transform-execute / spine / GPU), device-
 * invariant workload counters, an optional HUD + worst-frame inspector, and a
 * telemetry sink. Add it to any app in one call:
 *
 *     import { mountCrawler } from "@spine-benchmark/pixi-crawler";
 *     const crawler = mountCrawler(app);            // HUD visible, auto-dispose
 *
 * Or construct it directly for full control:
 *
 *     import { Crawler } from "@spine-benchmark/pixi-crawler";
 *     const crawler = new Crawler({
 *         targetFrameMs: 1000 / 60,
 *         spineProfile: { enabled: true },
 *         hud: !import.meta.env.PROD,
 *         telemetry: { sink, sampling: { windowMs: 5000 }, rawFrames: "on-overrun" },
 *     });
 *     crawler.attach(app.renderer, app.ticker);
 *     window.addEventListener("pagehide", () => void crawler.dispose());
 *
 * `new Crawler(config)` is the single root; every other subsystem is a
 * config-gated submodule it owns. Contracts:
 *   - `app.ticker !== Ticker.shared` (the Application must own its ticker, else
 *     Spine collides - not supported).
 *   - The package's pixi peer-dep must match the app's pixi exactly, or the
 *     hooks patch the wrong prototype graph.
 *   - `dispose()` / `detach()` restores `TextureSource.prototype.unload`.
 */

export { Crawler } from "./crawler";
export { mountCrawler } from "./mount";
export type { CrawlerTarget, MountOptions } from "./mount";
export type {
  CrawlerConfig,
  FrameRecord,
  FrameCapture,
  FrameRecording,
  InstructionDump,
  RenderGroupDump,
  PipeExecuteCall,
} from "./types";
export type {
  TelemetrySink,
  TelemetryBatch,
  TelemetryConfig,
  RawFramesPolicy,
} from "./features/telemetry/types";
export type {
  WorkloadCost,
  WorkloadDriver,
  WorkloadDriverName,
  WorkloadCostConfig,
} from "./core/workload-cost";
export type {
  DeviceCeiling,
  DeviceTier,
  DeviceTierConfig,
} from "./core/device-tier";
export {
  DEVICE_CEILINGS,
  DEFAULT_TIER_BANDS,
  DEFAULT_TIER_LABELS,
} from "./core/device-tier";
export type {
  GpuCost,
  GpuDriver,
  GpuDriverName,
  GpuCostConfig,
  GpuCostCoverage,
} from "./core/gpu-cost";
