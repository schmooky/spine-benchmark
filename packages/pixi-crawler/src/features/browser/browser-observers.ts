export class LongTaskCollector {
  private msSum = 0;
  private count = 0;
  private observer: PerformanceObserver | undefined;

  start(): void {
    if (typeof PerformanceObserver === "undefined") return;
    const supported = PerformanceObserver.supportedEntryTypes;
    if (!supported?.includes("longtask")) return;
    const obs = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        this.msSum += entry.duration;
        this.count++;
      }
    });
    try {
      obs.observe({ entryTypes: ["longtask"] });
      this.observer = obs;
    } catch {}
  }

  stop(): void {
    this.observer?.disconnect();
    this.observer = undefined;
  }

  harvest(): { msSum: number; count: number } {
    const out = { msSum: this.msSum, count: this.count };
    this.msSum = 0;
    this.count = 0;
    return out;
  }
}

interface PerformanceLongAnimationFrameTimingLike extends PerformanceEntry {
  duration: number;
  startTime: number;
  blockingDuration: number;
  renderStart: number;
  styleAndLayoutStart: number;
  scripts: readonly unknown[];
}

export interface LoafSnapshot {
  durationMs: number;
  blockingMs: number;
  scriptMs: number;
  styleAndLayoutMs: number;
  renderMs: number;
  scriptsCount: number;
  count: number;
}

export class LoafCollector {
  private acc: LoafSnapshot = makeLoafSnapshot();
  private observer: PerformanceObserver | undefined;

  start(): void {
    if (typeof PerformanceObserver === "undefined") return;
    const supported = PerformanceObserver.supportedEntryTypes;
    if (!supported?.includes("long-animation-frame")) return;
    const obs = new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as PerformanceLongAnimationFrameTimingLike[]) {
        this.acc.durationMs += entry.duration;
        this.acc.blockingMs += entry.blockingDuration;
        if (entry.renderStart > 0) {
          const scriptMs = Math.max(0, entry.renderStart - entry.startTime);
          const renderMs = Math.max(
            0,
            entry.startTime + entry.duration - entry.renderStart
          );
          this.acc.scriptMs += scriptMs;
          this.acc.renderMs += renderMs;
          if (entry.styleAndLayoutStart > 0) {
            this.acc.styleAndLayoutMs += Math.max(
              0,
              entry.renderStart - entry.styleAndLayoutStart
            );
          }
        } else {
          this.acc.scriptMs += entry.duration;
        }
        this.acc.scriptsCount += entry.scripts?.length ?? 0;
        this.acc.count++;
      }
    });
    try {
      obs.observe({ type: "long-animation-frame", buffered: true });
      this.observer = obs;
    } catch {}
  }

  stop(): void {
    this.observer?.disconnect();
    this.observer = undefined;
  }

  harvest(): LoafSnapshot | undefined {
    if (this.acc.count === 0) return undefined;
    const out = this.acc;
    this.acc = makeLoafSnapshot();
    return out;
  }
}

function makeLoafSnapshot(): LoafSnapshot {
  return {
    durationMs: 0,
    blockingMs: 0,
    scriptMs: 0,
    styleAndLayoutMs: 0,
    renderMs: 0,
    scriptsCount: 0,
    count: 0,
  };
}

interface ChromePerformanceMemory {
  readonly usedJSHeapSize: number;
  readonly totalJSHeapSize: number;
  readonly jsHeapSizeLimit: number;
}

export function readHeapMb(): number | undefined {
  const mem = (
    performance as Performance & { memory?: ChromePerformanceMemory }
  ).memory;
  if (!mem || typeof mem.usedJSHeapSize !== "number") return undefined;
  return mem.usedJSHeapSize / (1024 * 1024);
}
