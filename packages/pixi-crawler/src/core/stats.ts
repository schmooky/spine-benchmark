import type { FrameRecord } from "../types";

export interface FrameStats {
  samples: number;
  min: number;
  max: number;
  avg: number;
  p50: number;
  p95: number;
  p99: number;
}

export type FrameAccessor = (f: FrameRecord) => number | undefined;

export interface ProfilerLike {
  getFrames(): readonly FrameRecord[];
}

export class StatsAggregator {
  constructor(private readonly profiler: ProfilerLike) {}

  quantiles(accessor: FrameAccessor, lastN?: number): FrameStats | undefined {
    const frames = this.profiler.getFrames();
    if (frames.length === 0) return undefined;
    const start = lastN === undefined ? 0 : Math.max(0, frames.length - lastN);
    const samples: number[] = [];
    let sum = 0;
    for (let i = start; i < frames.length; i++) {
      const f = frames[i];
      if (!f) continue;
      const v = accessor(f);
      if (v === undefined || Number.isNaN(v)) continue;
      samples.push(v);
      sum += v;
    }
    if (samples.length === 0) return undefined;
    samples.sort((a, b) => a - b);
    return {
      samples: samples.length,
      min: samples[0]!,
      max: samples[samples.length - 1]!,
      avg: sum / samples.length,
      p50: percentile(samples, 0.5),
      p95: percentile(samples, 0.95),
      p99: percentile(samples, 0.99),
    };
  }

  path(path: string): FrameAccessor {
    const segs = path.split(".");
    return (f) => {
      let v: unknown = f;
      for (const s of segs) {
        if (v === null || typeof v !== "object") return undefined;
        v = (v as Record<string, unknown>)[s];
      }
      return typeof v === "number" ? v : undefined;
    };
  }
}

function percentile(samples: number[], q: number): number {
  const n = samples.length;
  if (n === 1) return samples[0]!;
  const pos = (n - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return samples[lo]!;
  const frac = pos - lo;
  return samples[lo]! * (1 - frac) + samples[hi]! * frac;
}
