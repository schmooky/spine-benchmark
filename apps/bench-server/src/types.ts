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
  /** WebGL caps (0.2.0+). `gpuTimerSupported` (0.3.1+) is whether the device has
   * EXT_disjoint_timer_query_webgl2 (absent on Safari/iOS -> no per-frame GPU ms). */
  gl?: { renderer?: string; maxTextureSize?: number; gpuTimerSupported?: boolean } | null;
  /** WebGPU support (0.2.0+). */
  webgpu?: { supported?: boolean; vendor?: string; architecture?: string } | null;
  /** Client 0.2.0+ sends much more (ua-ch, media flags). Stored verbatim. */
  [extra: string]: unknown;
}

/** Per-scene detail carried on kind === "scene" scenarios. */
export interface SceneReport {
  game: string;
  state: string;
  description: string;
  fitScale: number;
  onScreenAreaPx: number;
  spineCount: number;
  tier: string;
  missingRegions: number;
}

export interface ScenarioResult {
  id: string;
  label: string;
  spine: string;
  kind: "solo" | "ramp" | "swarm" | "scene";
  scene?: SceneReport;
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
    /** True GPU render time (EXT timer query) - the vsync-independent cost. */
    gpuMsAvg?: number | null;
    gpuMsP95?: number | null;
    /** CPU spine-update time (compute-side cost). */
    cpuMsAvg?: number | null;
    cpuMsP95?: number | null;
    /** ramp knees (0.3.1+): instances where it first dropped below refresh
     * (sustain) and where it collapsed (hard stop). */
    sustainInstances?: number | null;
    collapseInstances?: number | null;
  };
  /** For ramp scenarios: per-step rows (instances vs achieved fps). */
  steps?: { instances: number; fps: number; frameMsP95: number }[];
  aborted?: string;
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
  aborted?: boolean;
  abortReason?: string;
  crashed?: boolean;
  /** scenes that crashed the tab / were skipped (resumable run). */
  crashedScenes?: string[];
  skippedScenes?: string[];
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
    /** true GPU/CPU ms (0.3.0+); gpuMs null when no timer (Safari/iOS). */
    gpuMs?: number | null;
    cpuMs?: number | null;
    /** Full crawler measurement set meaned over the second (0.4.0+): the
     * ground-truth cost drivers + CPU render-phase split the fit regresses on.
     * Stored verbatim; keys mirror the runner's FrameMetrics. */
    m?: Record<string, number> | null;
    /** Data quality: total frames vs frames with a resolved GPU reading, and
     * how many GPU queries came back disjoint (discarded) - 0.4.0+. */
    frames?: number;
    gpuFrames?: number;
    gpuDisjoint?: number;
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
