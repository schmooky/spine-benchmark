/**
 * Runs the isolation sweeps (@/bench/sweeps): for each workload, ramp through
 * its levels, hold each level, and record (driverValue, gpuMs) - the pairs an
 * offline fit regresses to turn the crawler's placeholder gpuCost weights into
 * measured ones. Uses the crawler as the measurement instrument (manual frame
 * loop, same frameStart/frameEnd + newest-resolved-gpuMs pattern as
 * sceneEngine), with spineProfile off (no spines here, but keeps the config
 * consistent with the honest-measurement contract).
 */
import { Application } from "pixi.js";
import { mountCrawler, type Crawler } from "@spine-benchmark/pixi-crawler";

import { createSweeps, type SweepWorkload } from "./sweeps";
import type { RunSummary, ScenarioResult } from "@/types";

/** How long to hold each level before moving to the next, ms. */
const HOLD_MS = 900;
/** Skip this much of the hold at the start (transient after setLevel), ms. */
const SETTLE_MS = 150;

export interface SweepProgress {
  driverIndex: number;
  driverCount: number;
  driverLabel: string;
  levelIndex: number;
  levelCount: number;
}

export interface SweepHooks {
  onProgress: (p: SweepProgress) => void;
}

export interface SweepRunResult {
  scenarios: ScenarioResult[];
  summary: RunSummary;
}

export class SweepCancelled extends Error {
  constructor() {
    super("sweep cancelled");
  }
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** Hold the workload at its current level for HOLD_MS, sampling the crawler
 * each rendered frame. Returns (gpu, cpu) samples collected after SETTLE_MS. */
function holdLevel(
  app: Application,
  crawler: Crawler,
  workload: SweepWorkload,
  isCancelled: () => boolean,
): Promise<{ gpu: number[]; cpu: number[] }> {
  return new Promise((resolve) => {
    const gpu: number[] = [];
    const cpu: number[] = [];
    let lastResolvedIdx = -1;
    const start = performance.now();

    const tick = () => {
      if (isCancelled()) {
        resolve({ gpu, cpu });
        return;
      }
      crawler.frameStart();
      workload.update?.(app);
      app.render();
      crawler.frameEnd();

      const elapsed = performance.now() - start;
      if (elapsed >= SETTLE_MS) {
        // newest RESOLVED gpu query (EXT results land a few frames late) -
        // same pattern sceneEngine uses to avoid double-counting a frameIdx.
        const frames = crawler.getFrames();
        for (let i = frames.length - 1; i >= 0; i--) {
          const f = frames[i]!;
          if (f.gpuMs != null || f.gpuDisjoint) {
            if (f.frameIdx > lastResolvedIdx) {
              lastResolvedIdx = f.frameIdx;
              if (f.gpuMs != null) gpu.push(f.gpuMs);
            }
            break;
          }
        }
        const last = crawler.getLastFrame();
        if (last) {
          const rs = last.renderSplit;
          // no spine.update in a sweep - the render-side CPU IS the frame cost.
          const renderCpu = rs
            ? rs.buildInstructionsMs +
              rs.updateRenderablesMs +
              rs.batchUploadMs +
              rs.transformsMs +
              rs.executeInstructionsMs +
              rs.renderOtherMs +
              last.phases.gcMs
            : 0;
          cpu.push(renderCpu);
        }
      }

      if (elapsed >= HOLD_MS) {
        resolve({ gpu, cpu });
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

/**
 * Runs all isolation sweeps inside a fullscreen pixi Application mounted on
 * `host`. Resolves with the captured result; rejects with SweepCancelled when
 * `cancel()` is called.
 */
export function startSweeps(
  host: HTMLElement,
  hooks: SweepHooks,
): { result: Promise<SweepRunResult>; cancel: () => void } {
  let cancelled = false;
  let app: Application | null = null;
  let crawler: Crawler | null = null;
  const cancel = () => {
    cancelled = true;
  };

  const result = (async (): Promise<SweepRunResult> => {
    app = new Application();
    await app.init({
      background: 0x101317,
      resizeTo: window,
      antialias: false,
    });
    if (cancelled) {
      app.destroy(true);
      throw new SweepCancelled();
    }
    host.appendChild(app.canvas);
    // manual loop, ticker stopped - same contract as sceneEngine.
    app.ticker.stop();

    crawler = mountCrawler(app, {
      hud: false,
      bufferSize: 16,
      autoDispose: false,
      spineProfile: { enabled: false },
    });

    const workloads = createSweeps();
    const scenarios: ScenarioResult[] = [];
    const startedAll = performance.now();

    for (let wi = 0; wi < workloads.length; wi++) {
      if (cancelled) break;
      const wl = workloads[wi]!;
      const scenStart = performance.now();
      const pairs: NonNullable<ScenarioResult["sweep"]>["pairs"] = [];

      for (let li = 0; li < wl.levels.length; li++) {
        if (cancelled) break;
        const level = wl.levels[li]!;
        hooks.onProgress({
          driverIndex: wi,
          driverCount: workloads.length,
          driverLabel: wl.label,
          levelIndex: li,
          levelCount: wl.levels.length,
        });
        wl.setLevel(app, level);
        const driverValue = wl.driverValue(level, app);
        const { gpu, cpu } = await holdLevel(app, crawler, wl, () => cancelled);
        pairs.push({
          level,
          driverValue,
          gpuMsMedian: median(gpu),
          frameCpuMsMedian: median(cpu),
        });
      }
      await crawler.flushPendingGpu(150);
      wl.teardown(app);

      scenarios.push({
        id: `sweep-${wl.id}`,
        label: `Sweep: ${wl.label}`,
        spine: "",
        kind: "sweep",
        startMs: Math.round(scenStart - startedAll),
        durationMs: Math.round(performance.now() - scenStart),
        sweep: { driver: wl.id, unit: wl.unit, pairs },
        stats: {
          frames: pairs.length,
          avgFps: 0,
          frameMsAvg: 0,
          frameMsP95: 0,
          frameMsP99: 0,
          longFrames: 0,
          maxInstances: Math.max(...wl.levels),
          riPeak: 0,
          ciPeak: 0,
        },
      });
    }

    const totalDurationMs = Math.round(performance.now() - startedAll);
    return {
      scenarios,
      summary: {
        totalDurationMs,
        totalFrames: scenarios.reduce((a, s) => a + s.stats.frames, 0),
        avgFps: 0,
        worstFrameMsP99: 0,
        hiddenMs: 0,
        degraded: false,
        quick: false,
        displayHz: 0,
        longTaskCount: 0,
        longTaskTotalMs: 0,
        ...(cancelled ? { aborted: true, abortReason: "cancelled" } : {}),
      },
    };
  })();

  return {
    result: result.finally(() => {
      void crawler?.dispose();
    }),
    cancel,
  };
}
