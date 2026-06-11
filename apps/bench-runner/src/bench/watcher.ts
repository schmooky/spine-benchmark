import type { LoafSummary, LongTaskSummary, TimelineEvent } from "@/types";

/**
 * Continuous performance observation while the benchmark runs:
 *
 * - longtask entries: main-thread blocks > 50 ms (count, total, timeline)
 * - long-animation-frame entries (Chrome 123+): per janky frame, how much
 *   was blocking and which script caused it
 * - Compute Pressure API (Chrome 125+): cpu pressure state changes
 *   (nominal / fair / serious / critical) - a direct throttling signal
 * - webglcontextlost, visibilitychange, resize, orientationchange,
 *   window errors and unhandled rejections - all on one timeline
 */

const MAX_EVENTS = 500;
const MAX_TASKS = 200;
const MAX_LOAF_WORST = 20;

interface LoafEntryLike extends PerformanceEntry {
  blockingDuration?: number;
  scripts?: { invoker?: string; duration?: number }[];
}

export class PerfWatcher {
  private t0 = performance.now();
  private events: TimelineEvent[] = [];

  private ltCount = 0;
  private ltTotal = 0;
  private ltMax = 0;
  private ltTasks: { t: number; ms: number }[] = [];

  private loafCount = 0;
  private loafBlocking = 0;
  private loafWorst: { t: number; ms: number; blockingMs: number; script?: string }[] = [];

  private observers: PerformanceObserver[] = [];
  private pressureObserver: { disconnect: () => void } | null = null;
  private cleanup: (() => void)[] = [];

  contextLost = false;

  private push(type: string, detail?: string): void {
    if (this.events.length >= MAX_EVENTS) return;
    this.events.push({
      t: Math.round(performance.now() - this.t0),
      type,
      ...(detail ? { detail } : {}),
    });
  }

  start(canvas: HTMLCanvasElement | null): void {
    this.t0 = performance.now();

    try {
      const lt = new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          this.ltCount++;
          this.ltTotal += e.duration;
          this.ltMax = Math.max(this.ltMax, e.duration);
          if (this.ltTasks.length < MAX_TASKS) {
            this.ltTasks.push({
              t: Math.round(e.startTime - this.t0),
              ms: Math.round(e.duration),
            });
          }
        }
      });
      lt.observe({ type: "longtask", buffered: false });
      this.observers.push(lt);
    } catch {
      // longtask unsupported
    }

    try {
      const loaf = new PerformanceObserver((list) => {
        for (const e of list.getEntries() as LoafEntryLike[]) {
          this.loafCount++;
          const blocking = e.blockingDuration ?? 0;
          this.loafBlocking += blocking;
          const worstScript = (e.scripts ?? []).reduce<{
            invoker?: string;
            duration?: number;
          } | null>(
            (a, s) => ((s.duration ?? 0) > (a?.duration ?? 0) ? s : a),
            null,
          );
          const entry = {
            t: Math.round(e.startTime - this.t0),
            ms: Math.round(e.duration),
            blockingMs: Math.round(blocking),
            ...(worstScript?.invoker ? { script: worstScript.invoker.slice(0, 80) } : {}),
          };
          this.loafWorst.push(entry);
          this.loafWorst.sort((a, b) => b.blockingMs - a.blockingMs);
          if (this.loafWorst.length > MAX_LOAF_WORST) this.loafWorst.length = MAX_LOAF_WORST;
        }
      });
      loaf.observe({ type: "long-animation-frame", buffered: false });
      this.observers.push(loaf);
    } catch {
      // LoAF unsupported
    }

    try {
      const PressureObserverCtor = (
        globalThis as { PressureObserver?: new (cb: (records: { state: string }[]) => void) => {
          observe: (source: string) => Promise<void>;
          disconnect: () => void;
        } }
      ).PressureObserver;
      if (PressureObserverCtor) {
        const po = new PressureObserverCtor((records) => {
          for (const r of records) this.push("pressure", r.state);
        });
        void po.observe("cpu").catch(() => undefined);
        this.pressureObserver = po;
      }
    } catch {
      // compute pressure unsupported
    }

    const on = <K extends keyof WindowEventMap>(
      target: Window | Document | HTMLCanvasElement,
      type: string,
      fn: (ev: Event) => void,
    ) => {
      target.addEventListener(type, fn);
      this.cleanup.push(() => target.removeEventListener(type, fn));
    };

    on(document, "visibilitychange", () =>
      this.push("visibility", document.visibilityState),
    );
    on(window, "resize", () =>
      this.push("resize", `${window.innerWidth}x${window.innerHeight}`),
    );
    on(window, "orientationchange", () => this.push("orientation"));
    on(window, "error", (ev) =>
      this.push("error", String((ev as ErrorEvent).message ?? "").slice(0, 120)),
    );
    on(window, "unhandledrejection", (ev) =>
      this.push(
        "rejection",
        String((ev as PromiseRejectionEvent).reason ?? "").slice(0, 120),
      ),
    );
    if (canvas) {
      on(canvas, "webglcontextlost", () => {
        this.contextLost = true;
        this.push("contextlost");
      });
    }
  }

  stop(): {
    longTasks: LongTaskSummary;
    loaf: LoafSummary;
    events: TimelineEvent[];
  } {
    for (const o of this.observers) o.disconnect();
    this.pressureObserver?.disconnect();
    for (const fn of this.cleanup) fn();
    return {
      longTasks: {
        count: this.ltCount,
        totalMs: Math.round(this.ltTotal),
        maxMs: Math.round(this.ltMax),
        tasks: this.ltTasks,
      },
      loaf: {
        count: this.loafCount,
        totalBlockingMs: Math.round(this.loafBlocking),
        worst: this.loafWorst,
      },
      events: this.events,
    };
  }
}

/** Spine asset entries from the resource timing buffer. */
export function spineResourceTimings(): {
  name: string;
  durationMs: number;
  transferSize: number;
}[] {
  try {
    return (performance.getEntriesByType("resource") as PerformanceResourceTiming[])
      .filter((e) => e.name.includes("/spines/"))
      .slice(0, 100)
      .map((e) => ({
        name: e.name.split("/spines/")[1] ?? e.name,
        durationMs: Math.round(e.duration),
        transferSize: e.transferSize,
      }));
  } catch {
    return [];
  }
}
