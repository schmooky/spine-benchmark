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
/** A single rendered frame slower than this means the GPU is choking on this
 * level (weak devices at the heavy fill/vertex levels). Stop ramping that
 * driver - pushing further risks a context-loss/tab-kill that loses the whole
 * run. The levels already recorded are kept. */
const CHOKE_MS = 2500;
/** Cap the framebuffer so the fullscreen fill sweep doesn't render at a phone's
 * full 3x DPI (a 1080p phone would otherwise blend 64 layers at ~2700x6000 -
 * instant death on a budget GPU). Same cap the scene engine uses. */
const MAX_FRAMEBUFFER_AREA = 2_600_000;

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
  shouldStop: () => boolean,
): Promise<{ gpu: number[]; cpu: number[]; choked: boolean; dead: boolean }> {
  return new Promise((resolve) => {
    const gpu: number[] = [];
    const cpu: number[] = [];
    let lastResolvedIdx = -1;
    const start = performance.now();
    let lastNow = start;

    const tick = () => {
      if (shouldStop()) {
        resolve({ gpu, cpu, choked: false, dead: true });
        return;
      }
      // a render throw = lost/broken context on a weak GPU; bail with what we
      // have rather than rejecting the whole sweep.
      try {
        crawler.frameStart();
        workload.update?.(app);
        app.render();
        crawler.frameEnd();
      } catch {
        resolve({ gpu, cpu, choked: false, dead: true });
        return;
      }

      const now = performance.now();
      const dt = now - lastNow;
      lastNow = now;
      // a frame this slow means the GPU is choking on this level - stop before
      // it dies entirely and takes the run with it.
      if (dt > CHOKE_MS && now - start > SETTLE_MS) {
        resolve({ gpu, cpu, choked: true, dead: false });
        return;
      }

      const elapsed = now - start;
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
        resolve({ gpu, cpu, choked: false, dead: false });
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
  let contextLost = false;
  let app: Application | null = null;
  let crawler: Crawler | null = null;
  const cancel = () => {
    cancelled = true;
  };

  const result = (async (): Promise<SweepRunResult> => {
    // cap resolution so the fullscreen fill sweep can't render at a phone's
    // full DPI (see MAX_FRAMEBUFFER_AREA).
    const logicalArea = Math.max(1, window.innerWidth * window.innerHeight);
    const resolution = Math.min(
      window.devicePixelRatio || 1,
      2,
      Math.max(1, Math.sqrt(MAX_FRAMEBUFFER_AREA / logicalArea)),
    );
    app = new Application();
    await app.init({
      background: 0x101317,
      resizeTo: window,
      antialias: false,
      autoDensity: true,
      resolution,
    });
    if (cancelled) {
      app.destroy(true);
      throw new SweepCancelled();
    }
    host.appendChild(app.canvas);
    // a lost WebGL context on a weak GPU must abort gracefully with partial
    // results, not reject the whole run (which uploads nothing).
    app.canvas.addEventListener("webglcontextlost", (e) => {
      e.preventDefault();
      contextLost = true;
    });
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
      if (cancelled || contextLost) break;
      const wl = workloads[wi]!;
      const scenStart = performance.now();
      const pairs: NonNullable<ScenarioResult["sweep"]>["pairs"] = [];

      for (let li = 0; li < wl.levels.length; li++) {
        if (cancelled || contextLost) break;
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
        const { gpu, cpu, choked, dead } = await holdLevel(
          app,
          crawler,
          wl,
          () => cancelled || contextLost,
        );
        pairs.push({
          level,
          driverValue,
          gpuMsMedian: median(gpu),
          frameCpuMsMedian: median(cpu),
        });
        // this level choked the GPU (or the context died) - stop ramping this
        // driver rather than push into the level that kills the run.
        if (choked || dead) break;
      }
      // teardown can throw once the context is gone; keep the partial pairs.
      try {
        await crawler.flushPendingGpu(150);
        wl.teardown(app);
      } catch {
        /* context already lost - pairs are already captured */
      }

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
        degraded: contextLost,
        quick: false,
        displayHz: 0,
        longTaskCount: 0,
        longTaskTotalMs: 0,
        ...(cancelled
          ? { aborted: true, abortReason: "cancelled" }
          : contextLost
            ? { aborted: true, abortReason: "webgl context lost (GPU overwhelmed by sweep)" }
            : {}),
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
