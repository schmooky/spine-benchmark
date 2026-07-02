export interface AudioCounters {
  decodeCount: number;
  sourceCreated: number;
  sourceStarted: number;
  sourceStopped: number;
  automationOps: number;
  contextStateTransitions: number;
}

export interface AudioFrameMetrics {
  decodeMs: number;
  activeSourceCount: number;
  peakSourceCount: number;
  contextCount: number;
  currentTimeDriftMs: number;
  counters: AudioCounters;
}

export interface AudioCollectorOptions {
  enabled?: boolean;
}
