/**
 * Runtime probes that make cross-device analysis possible:
 *
 * - displayHz: without the panel's refresh rate, fps numbers are not
 *   comparable across devices (60 fps on a 120 Hz phone = throttled half).
 * - cpuScore: a fixed deterministic integer workload timed in ops/us.
 *   Measured before and after the run; the drift between the two is a
 *   thermal-throttling signal.
 */

let sink = 0;

/** Deterministic xorshift workload, ~10-40 ms depending on device. */
export function cpuScore(): number {
  const N = 4_000_000;
  const t0 = performance.now();
  let x = 123456789 >>> 0;
  let acc = 0;
  for (let i = 0; i < N; i++) {
    x ^= x << 13;
    x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    acc = (acc + (x & 1023)) | 0;
  }
  sink = acc;
  const ms = Math.max(0.001, performance.now() - t0);
  return Math.round(N / ms / 1000); // kilo-ops per ms
}

export function probeSink(): number {
  return sink;
}

/**
 * Median rAF cadence over ~50 frames, snapped to common panel rates.
 * Falls back to 0 ("unknown") after 3 s - rAF does not fire in hidden
 * tabs and the benchmark must not hang on a backgrounded start.
 */
export function measureDisplayHz(): Promise<number> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (hz: number) => {
      if (!done) {
        done = true;
        resolve(hz);
      }
    };
    window.setTimeout(() => finish(0), 3000);

    const deltas: number[] = [];
    let last = performance.now();
    const tick = (t: number) => {
      if (done) return;
      deltas.push(t - last);
      last = t;
      if (deltas.length >= 50) {
        const sorted = deltas.slice(5).sort((a, b) => a - b);
        const median = sorted[Math.floor(sorted.length / 2)];
        const hz = 1000 / Math.max(1, median);
        const common = [30, 60, 75, 90, 120, 144, 165, 240];
        let best = common.reduce((a, b) =>
          Math.abs(b - hz) < Math.abs(a - hz) ? b : a,
        );
        if (Math.abs(best - hz) / best > 0.15) best = Math.round(hz);
        finish(best);
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

export interface HeapSnapshot {
  limitMb: number | null;
  usedMb: number | null;
}

export function heapSnapshot(): HeapSnapshot {
  const mem = (
    performance as Performance & {
      memory?: { jsHeapSizeLimit: number; usedJSHeapSize: number };
    }
  ).memory;
  if (!mem) return { limitMb: null, usedMb: null };
  return {
    limitMb: Math.round(mem.jsHeapSizeLimit / 1048576),
    usedMb: Math.round(mem.usedJSHeapSize / 1048576),
  };
}

export async function readBattery(): Promise<{
  level: number;
  charging: boolean;
} | null> {
  try {
    const nav = navigator as Navigator & {
      getBattery?: () => Promise<{ level: number; charging: boolean }>;
    };
    if (!nav.getBattery) return null;
    const b = await nav.getBattery();
    return { level: b.level, charging: b.charging };
  } catch {
    return null;
  }
}
