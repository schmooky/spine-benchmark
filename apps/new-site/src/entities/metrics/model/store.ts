import { create } from "zustand";

/** A single measured metric, produced by one background task. */
export interface Metric {
  key: string;
  label: string;
  value: number | string;
  unit?: string;
}

interface MetricsState {
  /** which measuring tasks have finished, by key */
  metrics: Record<string, Metric>;
  /** 0..1 progress across all measuring tasks */
  progress: number;
  pushMetric: (metric: Metric) => void;
  setProgress: (progress: number) => void;
  reset: () => void;
}

export const useMetricsStore = create<MetricsState>((set) => ({
  metrics: {},
  progress: 0,
  pushMetric: (metric) =>
    set((s) => ({ metrics: { ...s.metrics, [metric.key]: metric } })),
  setProgress: (progress) => set({ progress }),
  reset: () => set({ metrics: {}, progress: 0 }),
}));
