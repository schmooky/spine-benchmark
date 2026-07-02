/**
 * MemoryCollector - process-level memory via `performance.measureUserAgentSpecificMemory()`.
 *
 * More complete than `performance.memory.usedJSHeapSize` (our `readHeapMb`): the UA
 * API reports the WHOLE memory footprint attributed to the page - JavaScript heap,
 * DOM, workers, shared memory - broken down by memory type, standardized across UAs.
 *
 * Constraints that shape the design:
 *  - REQUIRES cross-origin isolation (`crossOriginIsolated`, i.e. COOP `same-origin`
 *    + COEP `require-corp` response headers). Without it the call throws SecurityError.
 *  - ASYNC and SLOW: the UA performs the measurement opportunistically (waits for a
 *    GC), so a call can take seconds and the UA rate-limits frequent calls. -> called
 *    on a SLOW interval, never per-frame. Latest snapshot is cached.
 *
 * Gating: a one-shot probe at `start()` attempts a real measurement; only on success
 * does the polling loop begin. Any failure (no isolation, API absent, SecurityError,
 * UA build with the feature disabled) -> `supported=false`, no-op, single warn.
 */

export interface MemoryMeasurement {
  /** Total bytes attributed to the page, MB. */
  totalMb: number;
  /** Per memory-type totals (e.g. JavaScript / DOM / Shared / Canvas), desc by MB. */
  byType: { type: string; mb: number }[];
  /** performance.now() when this snapshot was taken. */
  sampledAtMs: number;
}

interface UAMemoryBreakdownEntry {
  bytes: number;
  types?: string[];
  attribution?: { url?: string; scope?: string; container?: unknown }[];
}
interface UAMemoryResult {
  bytes: number;
  breakdown?: UAMemoryBreakdownEntry[];
}
type MeasureFn = () => Promise<UAMemoryResult>;

function getMeasureFn(): MeasureFn | undefined {
  if (!globalThis.crossOriginIsolated) return undefined;
  const fn = (
    performance as Performance & { measureUserAgentSpecificMemory?: MeasureFn }
  ).measureUserAgentSpecificMemory;
  return typeof fn === "function" ? fn.bind(performance) : undefined;
}

export interface MemoryCollectorOptions {
  /** Poll interval (ms). The UA also rate-limits + paces measurements, so this is
   *  a floor, not a guarantee. Default 10s. */
  intervalMs?: number;
}

export class MemoryCollector {
  private readonly intervalMs: number;
  private readonly measure: MeasureFn | undefined;
  private supported = false;
  private running = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private latest: MemoryMeasurement | undefined;

  constructor(opts: MemoryCollectorOptions = {}) {
    this.intervalMs = opts.intervalMs ?? 10_000;
    this.measure = getMeasureFn();
  }

  /** True only after a probe measurement succeeds. False until then / when the
   *  context can't use the API. */
  isSupported(): boolean {
    return this.supported;
  }

  start(): void {
    if (this.running || !this.measure) {
      if (!this.measure)
        console.warn(
          "[Crawler] memoryProfile enabled but measureUserAgentSpecificMemory unavailable (needs cross-origin isolation: COOP same-origin + COEP require-corp)."
        );
      return;
    }
    this.running = true;
    void this._tick(true);
  }

  private async _tick(isProbe: boolean): Promise<void> {
    if (!this.running || !this.measure) return;
    try {
      const result = await this.measure();
      this.supported = true;
      this.latest = aggregate(result);
    } catch (e) {
      if (isProbe) {
        // Probe failed - feature genuinely unavailable in this context (e.g.
        // SecurityError despite headers on a UA build with it disabled).
        console.warn(
          "[Crawler] measureUserAgentSpecificMemory probe failed; memory metrics off:",
          String(e)
        );
        this.running = false;
        return;
      }
      // Transient failure mid-run (rate-limit) - keep prior snapshot, retry next tick.
    }
    if (this.running)
      this.timer = setTimeout(() => {
        void this._tick(false);
      }, this.intervalMs);
  }

  /** Latest snapshot, or undefined before the first successful measurement. */
  getLatest(): MemoryMeasurement | undefined {
    return this.latest;
  }

  teardown(): void {
    this.running = false;
    if (this.timer !== undefined) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    this.latest = undefined;
  }
}

function aggregate(result: UAMemoryResult): MemoryMeasurement {
  const byTypeBytes = new Map<string, number>();
  for (const entry of result.breakdown ?? []) {
    if (!entry.bytes) continue;
    const type =
      entry.types && entry.types.length > 0
        ? entry.types.join("+")
        : "(unattributed)";
    byTypeBytes.set(type, (byTypeBytes.get(type) ?? 0) + entry.bytes);
  }
  const byType = [...byTypeBytes.entries()]
    .map(([type, bytes]) => ({ type, mb: bytes / 1048576 }))
    .sort((a, b) => b.mb - a.mb);
  return {
    totalMb: result.bytes / 1048576,
    byType,
    sampledAtMs: performance.now(),
  };
}
