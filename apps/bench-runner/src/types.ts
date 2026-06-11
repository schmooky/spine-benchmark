/** Mirrors apps/bench-server/src/types.ts - the upload contract. */

import type { ImpactInputs } from "./bench/impact";

export interface GlInfo {
  context: "webgl2" | "webgl" | null;
  version: string;
  shadingLanguageVersion: string;
  vendor: string;
  renderer: string;
  antialias: boolean | null;
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

export interface ScenarioResult {
  id: string;
  label: string;
  spine: string;
  kind: "solo" | "ramp" | "swarm";
  startMs: number;
  durationMs: number;
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
