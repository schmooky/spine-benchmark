/** Mirrors apps/bench-server/src/types.ts - the upload contract. */

import type { ImpactInputs } from "./bench/impact";

export interface GlInfo {
  context: "webgl2" | "webgl" | null;
  version: string;
  shadingLanguageVersion: string;
  vendor: string;
  renderer: string;
  antialias: boolean | null;
  /** true iff EXT_disjoint_timer_query_webgl2 is available (per-frame GPU ms). */
  gpuTimerSupported: boolean;
  maxTextureSize: number;
  maxTextureImageUnits: number;
  maxCombinedTextureImageUnits: number;
  maxVertexAttribs: number;
  maxVertexUniformVectors: number;
  maxFragmentUniformVectors: number;
  maxVaryingVectors: number;
  maxRenderbufferSize: number;
  maxViewportDims: number[];
  maxSamples: number | null;
  maxDrawBuffers: number | null;
  highpFragment: boolean;
  extensions: string[];
}

export interface WebGpuInfo {
  supported: boolean;
  vendor?: string;
  architecture?: string;
  device?: string;
  description?: string;
  features?: string[];
  limits?: Record<string, number>;
}

/** Probes measured around the run itself; merged into device.runtime. */
export interface RuntimeProbes {
  displayHz: number;
  cpuScoreStart: number;
  cpuScoreEnd: number;
  /** Negative = slower at the end = thermal throttling signal. */
  cpuDriftPct: number;
  rendererType: string;
  pixiResolution: number;
  heapStart: { limitMb: number | null; usedMb: number | null };
  heapEnd: { limitMb: number | null; usedMb: number | null };
  batteryEnd: { level: number; charging: boolean } | null;
  contextLost: boolean;
}

export interface DeviceInfo {
  /** Best-effort human label, e.g. "Pixel 6a (Mali-G78)". */
  label: string;
  userAgent: string;
  platform: string;
  mobile: boolean | null;
  uaBrands: { brand: string; version: string }[] | null;
  uaModel: string | null;
  architecture: string | null;
  bitness: string | null;
  formFactor: string | null;
  wow64: boolean | null;
  fullVersionList: { brand: string; version: string }[] | null;
  vendor: string;
  languages: string[];
  webdriver: boolean | null;
  cookieEnabled: boolean;
  screen: { width: number; height: number; dpr: number };
  screenDetail: {
    availWidth: number;
    availHeight: number;
    colorDepth: number;
    pixelDepth: number;
    orientation: string | null;
    orientationAngle: number | null;
    isExtended: boolean | null;
  };
  viewport: {
    innerWidth: number;
    innerHeight: number;
    outerWidth: number;
    outerHeight: number;
    vvWidth: number | null;
    vvHeight: number | null;
    vvScale: number | null;
  };
  maxTouchPoints: number;
  media: {
    colorGamut: string;
    hdr: boolean;
    reducedMotion: boolean;
    colorScheme: string;
    pointerCoarse: boolean;
    hoverNone: boolean;
    standalone: boolean;
  };
  hardwareConcurrency: number | null;
  deviceMemoryGb: number | null;
  gpu: { vendor: string; renderer: string } | null;
  maxTextureSize: number | null;
  gl: GlInfo | null;
  webgpu: WebGpuInfo | null;
  connection: string | null;
  connectionDetail: {
    effectiveType: string | null;
    type: string | null;
    downlink: number | null;
    downlinkMax: number | null;
    rtt: number | null;
    saveData: boolean | null;
  } | null;
  battery: { level: number; charging: boolean } | null;
  batteryDetail: {
    level: number;
    charging: boolean;
    chargingTime: number | null;
    dischargingTime: number | null;
  } | null;
  storage: { quotaMb: number | null; usageMb: number | null } | null;
  language: string;
  timezone: string;
  visibilityAtStart: string;
  timeOrigin: number;
  /** Filled in after the benchmark finishes. */
  runtime: RuntimeProbes | null;
}

/** Per-scene detail shipped with a "scene" scenario so the report shows what
 * was actually on screen, in what layout, at what fit. */
export interface SceneReport {
  game: string;
  state: string;
  description: string;
  /** uniform contain-fit scale applied to the whole scene for this device. */
  fitScale: number;
  /** resulting on-screen area in px^2 (for normalising RI across screens). */
  onScreenAreaPx: number;
  /** spine instance count in the scene. */
  spineCount: number;
  /** authored/estimated impact tier. */
  tier: string;
  /** atlas regions the paired atlas lacked (blank-rendered), for QA. */
  missingRegions: number;
}

export interface ScenarioResult {
  id: string;
  label: string;
  spine: string;
  kind: "solo" | "ramp" | "swarm" | "scene";
  startMs: number;
  durationMs: number;
  /** present when kind === "scene". */
  scene?: SceneReport;
  stats: {
    frames: number;
    avgFps: number;
    frameMsAvg: number;
    frameMsP95: number;
    frameMsP99: number;
    longFrames: number;
    maxInstances: number;
    riPeak: number;
    ciPeak: number;
    /** True GPU render time (EXT timer query); null when unsupported. The
     * vsync-independent cost signal used to validate/refit RI. */
    gpuMsAvg?: number | null;
    gpuMsP95?: number | null;
    /** CPU time advancing spines (spine.update); the compute-side (CI) signal. */
    cpuMsAvg?: number | null;
    cpuMsP95?: number | null;
    /** Ramp knees: instances where it first dropped below refresh (sustain =
     * capacity) and the bracket top / hard stop (collapse). */
    sustainInstances?: number | null;
    collapseInstances?: number | null;
  };
  steps?: { instances: number; fps: number; frameMsP95: number }[];
  /** Set when the scenario was cut short or capped (reason). */
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
  displayHz: number;
  longTaskCount: number;
  longTaskTotalMs: number;
  /** The run hit the device floor and ended early. */
  aborted?: boolean;
  abortReason?: string;
  /** Reconstructed from a crash stash - the browser died mid-run. */
  crashed?: boolean;
  /** Scene ids that crashed the tab (killed the page) and were skipped on resume. */
  crashedScenes?: string[];
  /** Scene ids skipped (crash or un-loadable/broken). */
  skippedScenes?: string[];
}

export interface TimelineEvent {
  /** ms since benchmark start */
  t: number;
  type: string;
  detail?: string;
}

export interface LongTaskSummary {
  count: number;
  totalMs: number;
  maxMs: number;
  /** capped at 200 entries */
  tasks: { t: number; ms: number }[];
}

export interface LoafSummary {
  count: number;
  totalBlockingMs: number;
  /** worst frames by blocking time, capped at 20 */
  worst: { t: number; ms: number; blockingMs: number; script?: string }[];
}

export interface PerSecondRow {
  t: number;
  scenarioId: string;
  fps: number;
  frameMsAvg: number;
  frameMsP95: number;
  instances: number;
  ri: number;
  ci: number;
  /** JS heap used (Chrome only). */
  heapMb: number | null;
  /** Raw formula inputs for ONE instance at sample time. */
  one: ImpactInputs | null;
  /** Mean true GPU render time this second (EXT timer query), or null. */
  gpuMs?: number | null;
  /** Mean CPU spine-update time this second, or null. */
  cpuMs?: number | null;
}

export interface RunCapture {
  frames: { scenarioId: string; dtMs: number[] }[];
  perSecond: PerSecondRow[];
  longTasks: LongTaskSummary | null;
  loaf: LoafSummary | null;
  /** visibility / resize / battery / pressure / error / contextlost timeline */
  events: TimelineEvent[];
  /** spine asset load timings from the resource timing buffer */
  resources: { name: string; durationMs: number; transferSize: number }[];
}

export interface RunUpload {
  clientVersion: string;
  startedAt: string;
  device: DeviceInfo;
  scenarios: ScenarioResult[];
  summary: RunSummary;
  capture: RunCapture;
}

export interface BenchResult {
  scenarios: ScenarioResult[];
  summary: RunSummary;
  capture: RunCapture;
  /** merged into device.runtime by the app shell */
  environment: RuntimeProbes;
}

export type { ImpactInputs };
