/** Mirrors apps/bench-server/src/types.ts - the upload contract. */

export interface DeviceInfo {
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
}

export interface RunSummary {
  totalDurationMs: number;
  totalFrames: number;
  avgFps: number;
  worstFrameMsP99: number;
  hiddenMs: number;
  degraded: boolean;
  quick: boolean;
}

export interface RunCapture {
  frames: { scenarioId: string; dtMs: number[] }[];
  perSecond: {
    t: number;
    scenarioId: string;
    fps: number;
    frameMsAvg: number;
    frameMsP95: number;
    instances: number;
    ri: number;
    ci: number;
  }[];
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
}
