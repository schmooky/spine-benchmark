/** Shapes shared by ingest and report endpoints. The client sends RunUpload. */

export interface DeviceInfo {
  /** Best-effort human label, e.g. "Pixel 6a (Android 14)" or "MacBookPro (mac)". */
  label: string;
  userAgent: string;
  platform: string;
  mobile: boolean | null;
  uaBrands: { brand: string; version: string }[] | null;
  uaModel: string | null;
  screen: { width: number; height: number; dpr: number };
  hardwareConcurrency: number | null;
  deviceMemoryGb: number | null;
  gpu: { vendor: string; renderer: string } | null;
  maxTextureSize: number | null;
  connection: string | null;
  battery: { level: number; charging: boolean } | null;
  language: string;
  timezone: string;
  /** Post-run probes from the client (displayHz, cpu drift, heap, ...). */
  runtime?: {
    displayHz?: number;
    cpuScoreStart?: number;
    cpuScoreEnd?: number;
    cpuDriftPct?: number;
    rendererType?: string;
    contextLost?: boolean;
    [extra: string]: unknown;
  } | null;
  /** Client 0.2.0+ sends much more (gl caps, webgpu, ua-ch, media flags).
   *  Stored verbatim; analysis reads it from the raw document. */
  [extra: string]: unknown;
}

export interface ScenarioResult {
  id: string;
  label: string;
  spine: string;
  kind: "solo" | "ramp" | "swarm";
  startMs: number;
  durationMs: number;
  /** Aggregate stats for the whole scenario. */
  stats: {
    frames: number;
    avgFps: number;
    frameMsAvg: number;
    frameMsP95: number;
    frameMsP99: number;
    longFrames: number;
    maxInstances: number;
    /** RI/CI of one instance times instance count, sampled per second. */
    riPeak: number;
    ciPeak: number;
  };
  /** For ramp scenarios: per-step rows (instances vs achieved fps). */
  steps?: { instances: number; fps: number; frameMsP95: number }[];
}

export interface RunSummary {
  totalDurationMs: number;
  totalFrames: number;
  avgFps: number;
  worstFrameMsP99: number;
  hiddenMs: number;
  degraded: boolean;
  quick: boolean;
  /** Client 0.2.0+ */
  displayHz?: number;
  longTaskCount?: number;
  longTaskTotalMs?: number;
}

export interface RunCapture {
  /** Per-scenario raw frame deltas in ms (rounded to 0.1). */
  frames: { scenarioId: string; dtMs: number[] }[];
  /** One row per second across the whole run. Client 0.2.0+ adds heapMb
   *  and `one` (raw RI/CI formula inputs for a single instance). */
  perSecond: {
    t: number;
    scenarioId: string;
    fps: number;
    frameMsAvg: number;
    frameMsP95: number;
    instances: number;
    ri: number;
    ci: number;
    heapMb?: number | null;
    one?: Record<string, number> | null;
  }[];
  /** Client 0.2.0+: longtask / LoAF summaries, event timeline, resource timings. */
  longTasks?: unknown;
  loaf?: unknown;
  events?: unknown[];
  resources?: unknown[];
}

export interface RunUpload {
  clientVersion: string;
  startedAt: string;
  device: DeviceInfo;
  scenarios: ScenarioResult[];
  summary: RunSummary;
  capture: RunCapture;
}

export interface RunRecord {
  id: string;
  createdAt: string;
  clientVersion: string;
  device: DeviceInfo;
  scenarios: ScenarioResult[];
  summary: RunSummary;
  captureKey: string | null;
}
