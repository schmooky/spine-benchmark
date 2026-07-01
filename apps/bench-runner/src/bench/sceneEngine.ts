/**
 * Scene benchmark: plays each reconstructed game scene (real spines, real
 * layout) for a slice while recording frame timing + live RI/CI, with a settle
 * gap between scenes so one heavy scene doesn't bleed into the next. All scene
 * assets are preloaded up front (visible gate) before any measuring starts.
 *
 * Reuses the Recorder / impact formula / probes / crash-stash from the
 * instance-ramp engine; differs only in what's on screen (a composed scene vs.
 * grids of one spine) and in the per-scene report detail.
 */
import { Application, Container, Graphics, Text } from "pixi.js";
import type { Spine } from "@esotericsoftware/spine-pixi-v8";
import { GpuTimer, getGl2 } from "@spine-benchmark/gpu-timing";
import { sampleCoverage } from "@spine-benchmark/render-tools";
import type { Renderer } from "pixi.js";

import type {
  ImpactInputs,
  LoafSummary,
  LongTaskSummary,
  PerSecondRow,
  RuntimeProbes,
  ScenarioResult,
  TimelineEvent,
} from "@/types";
import { Recorder } from "./recorder";
import { measureFrameImpactDetailed } from "./impact";
import { cpuScore, heapSnapshot, measureDisplayHz, readBattery } from "./probes";
import { PerfWatcher, spineResourceTimings } from "./watcher";
import {
  buildScene,
  buildStats,
  fitContainer,
  makeStressSpine,
  preloadAllScenes,
  sceneAssetAliases,
  sceneSpines,
  unloadAliases,
  type FitResult,
} from "@/scenes/reconstruct";
import type { SceneDescriptor } from "@/scenes/types";
import type { HudState } from "./engine";
import { BenchCancelled } from "./engine";

const IMPACT_SAMPLE_MS = 500;
const STALL_FRAME_MS = 200;
const STALL_ABORT_MS = 3000;
const HEAP_ABORT_RATIO = 0.85;
const MAX_FRAMEBUFFER_AREA = 2_600_000;
/** Blank gap between scenes: lets GC + GPU settle so metrics stay clean. */
const SETTLE_MS = 700;
/** Stress ramp stops raising the density once a step drops below this fps -
 * that instance count is the device's breaking point for that spine mix. */
const RAMP_GATE_FPS = 15;
/** Stress scenes get more of the time budget (they carry the capacity curve). */
const STRESS_WEIGHT = 2.5;
/** Cap stress density on mobile GPUs (iOS Safari loses the WebGL context well
 * before fps gates if you pile on hundreds of heavy mesh spines). */
const MOBILE_STRESS_CAP = 80;
/** Hard safety ceiling for the adaptive ramp on desktop. */
const DESKTOP_STRESS_MAX = 8192;
/** Time held at each ramp density before doubling. */
const STRESS_STEP_MS = 1100;
/** Breaking point (thesis #6): a step whose true GPU time exceeds this is
 * "over budget", independent of vsync. Used when the timer query is available. */
const GPU_KNEE_MS = 14;

function isMobileDevice(): boolean {
  const ua = navigator as Navigator & { userAgentData?: { mobile?: boolean } };
  if (typeof ua.userAgentData?.mobile === "boolean") return ua.userAgentData.mobile;
  return /iPhone|iPad|iPod|Android|Mobile/i.test(navigator.userAgent);
}

export interface SceneHooks {
  onHud: (hud: HudState) => void;
  /** Preload progress as a 0..1 fraction (the load-all gate). */
  onProgress: (fraction: number) => void;
  /** Fired once the gate is fully loaded and measuring is about to begin. */
  onMeasureStart: () => void;
  /** Fired right BEFORE a scene is measured (persist "in progress" = crash marker). */
  onSceneEnter: (sceneId: string) => void;
  /** Fired when a scene finishes (result) or is skipped (result null). */
  onSceneDone: (
    sceneId: string,
    result: ScenarioResult | null,
    perSecond: PerSecondRow[],
  ) => void;
}

/** What a single measuring segment (one page load) reports back for the final
 * assembled upload. Per-scene data arrives via onSceneDone. */
export interface SegmentResult {
  environment: RuntimeProbes;
  contextLost: boolean;
  longTasks: LongTaskSummary | null;
  loaf: LoafSummary | null;
  events: TimelineEvent[];
  resources: { name: string; durationMs: number; transferSize: number }[];
  hiddenMs: number;
}

/** Sum the live RI/CI across every spine in the scene (real composite cost). */
function sampleSceneImpact(spines: Spine[]): { ri: number; ci: number; one: ImpactInputs | null } {
  let ri = 0;
  let ci = 0;
  let one: ImpactInputs | null = null;
  for (const s of spines) {
    const d = measureFrameImpactDetailed(s.skeleton);
    ri += d.ri;
    ci += d.ci;
    if (!one) one = d.inputs;
  }
  return { ri, ci, one };
}

/** p95 of a small unsorted sample. */
function percentile95(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil(0.95 * s.length) - 1))];
}

/** Render app.stage, swallowing a broken-attachment crash. Returns false when
 * the render threw (so the caller can skip the offending scene). */
function safeRender(app: Application): boolean {
  try {
    app.render();
    return true;
  } catch {
    return false;
  }
}

/**
 * On-canvas loading indicator: an animated arc + progress text, so it's obvious
 * the app is fetching assets (not frozen/broken). Spins itself via rAF and
 * renders each frame; call setProgress as assets settle, stop when done.
 */
function createLoader(app: Application): {
  setProgress: (frac: number) => void;
  stop: () => void;
} {
  const layer = new Container();
  const cx = app.screen.width / 2;
  const cy = app.screen.height / 2;
  const ring = new Graphics();
  const label = new Text({
    text: "Loading scene assets  0%",
    style: { fill: 0xe6e6e6, fontSize: 20, fontFamily: "ui-monospace, monospace" },
  });
  label.anchor.set(0.5);
  label.position.set(cx, cy + 64);
  const sub = new Text({
    text: "preparing all scenes - this is not an error, just loading",
    style: { fill: 0x8a8a8a, fontSize: 12, fontFamily: "ui-monospace, monospace" },
  });
  sub.anchor.set(0.5);
  sub.position.set(cx, cy + 92);
  layer.addChild(ring, label, sub);
  app.stage.addChild(layer);

  let frac = 0;
  let angle = -Math.PI / 2;
  let raf = 0;
  let alive = true;
  const draw = () => {
    ring.clear();
    ring.circle(cx, cy, 42).stroke({ width: 6, color: 0x2c2c30 });
    ring.arc(cx, cy, 42, angle, angle + Math.max(0.25, frac * Math.PI * 2)).stroke({
      width: 6,
      color: 0xffffff,
      cap: "round",
    });
    label.text = `Loading scene assets  ${Math.round(frac * 100)}%`;
  };
  const loop = () => {
    if (!alive) return;
    angle += 0.14;
    draw();
    safeRender(app);
    raf = requestAnimationFrame(loop);
  };
  draw();
  safeRender(app);
  raf = requestAnimationFrame(loop);

  return {
    setProgress: (f) => {
      frac = f;
    },
    stop: () => {
      alive = false;
      if (raf) cancelAnimationFrame(raf);
      app.stage.removeChild(layer);
      layer.destroy({ children: true });
    },
  };
}

export function startSceneBenchmark(
  host: HTMLElement,
  scenes: SceneDescriptor[],
  totalSeconds: number,
  skip: Set<string>,
  hooks: SceneHooks,
): { result: Promise<SegmentResult>; cancel: () => void } {
  let cancelled = false;
  let app: Application | null = null;
  let wakeLock: { release: () => Promise<void> } | null = null;

  const cancel = () => {
    cancelled = true;
  };

  const result = (async (): Promise<SegmentResult> => {
    // pre-run probes
    const displayHz = await measureDisplayHz();
    const cpuScoreStart = cpuScore();
    const heapStart = heapSnapshot();

    const logicalArea = Math.max(1, window.innerWidth * window.innerHeight);
    const resolution = Math.min(
      window.devicePixelRatio || 1,
      2,
      Math.max(1, Math.sqrt(MAX_FRAMEBUFFER_AREA / logicalArea)),
    );

    app = new Application();
    await app.init({
      background: 0x0d0d10,
      resizeTo: window,
      antialias: false,
      autoDensity: true,
      resolution,
    });
    if (cancelled) {
      app.destroy(true);
      throw new BenchCancelled();
    }
    host.appendChild(app.canvas);
    // The measure loop is the single source of truth: it advances every spine
    // and renders each frame itself. Stop Pixi's own ticker so the two don't
    // fight (and so animation can't stall while the run keeps timing).
    app.ticker.stop();
    // true GPU render cost per frame (vsync-independent). Null on Safari/mobile
    // where the extension is missing - CPU timing still works.
    const gpuTimer = new GpuTimer(getGl2(app.renderer));

    const watcher = new PerfWatcher();
    watcher.start(app.canvas);

    try {
      wakeLock = await (
        navigator as Navigator & {
          wakeLock?: { request: (t: string) => Promise<{ release: () => Promise<void> }> };
        }
      ).wakeLock?.request("screen") ?? null;
    } catch {
      wakeLock = null;
    }

    // scenes we still need to measure this segment (skip already-done / crashed).
    const toMeasure = scenes.filter((d) => !skip.has(d.id));

    // ── load stuff: preload only the scenes this segment will measure, with an
    // on-canvas spinner + progress. Loading less on a resume also lowers the
    // memory that killed the tab last time. ──
    const loader = createLoader(app);
    await preloadAllScenes(toMeasure, (frac) => {
      loader.setProgress(frac);
      hooks.onProgress(frac);
    });
    loader.stop();
    if (cancelled) throw new BenchCancelled();
    hooks.onMeasureStart();

    let hiddenMs = 0;
    let hiddenAt: number | null = null;
    let resumeSkip = false;
    const onVisibility = () => {
      if (document.hidden) {
        hiddenAt = performance.now();
      } else if (hiddenAt != null) {
        hiddenMs += performance.now() - hiddenAt;
        hiddenAt = null;
        resumeSkip = true;
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    // weighted time budget computed over the FULL run (stress scenes get more
    // time) so a scene's duration is identical whether it runs now or after a
    // resume. We only MEASURE toMeasure, but weight over all `scenes`.
    const weightOf = (d: SceneDescriptor) => (d.stress ? STRESS_WEIGHT : 1);
    const sumWeight = scenes.reduce((a, d) => a + weightOf(d), 0);
    const budgetMs = Math.max(1, totalSeconds * 1000 - SETTLE_MS * (scenes.length - 1));
    const durOf = (d: SceneDescriptor) =>
      Math.max(3000, Math.floor((budgetMs * weightOf(d)) / sumWeight));
    const totalMs =
      scenes.reduce((a, d) => a + durOf(d), 0) + SETTLE_MS * (scenes.length - 1);
    let runElapsed = 0;

    /** Play + measure one scene for sceneDur ms. Emits onSceneDone (result, or
     * null when skipped) and resolves with the abort reason or null. Uses its
     * own recorder so each scene is an atomic, independently-uploadable unit. */
    const runScene = (d: SceneDescriptor, index: number, sceneDur: number) =>
      new Promise<string | null>((resolve, reject) => {
        if (!app) return reject(new BenchCancelled());

        const recorder = new Recorder();
        /** Skip this scene (bad assets / crash-in-render) - no result. */
        const skipScene = (why: string) => {
          console.warn(`[scene] ${why} for ${d.id}, skipping`);
          hooks.onSceneDone(d.id, null, []);
          resolve(null);
        };

        buildStats.missingRegions = 0;
        buildStats.spines = 0;
        const stress = d.stress;
        // ADAPTIVE ramp (thesis #5): start small and DOUBLE each step until the
        // measured cost crosses a fixed ms knee - so every device, however
        // strong, actually reaches its breaking point instead of topping out at
        // a fixed ceiling. Mobile keeps a hard safety cap (context loss).
        const stressStart = stress ? Math.max(4, stress.steps[0]) : 0;
        const stressMax = isMobileDevice() ? MOBILE_STRESS_CAP : DESKTOP_STRESS_MAX;
        let root: Container;
        let fit: FitResult;
        // the live pool. For a grid scene it's the built spines; for a stress
        // scene it starts with the background and grows as the ramp climbs.
        const spines: Spine[] = [];

        /** Add random symbols (random pos/size/anim - "not normalized") until
         * the pool reaches `count`. */
        const spawnTo = (count: number) => {
          if (!stress) return;
          let attempts = 0;
          while (spines.length < count && attempts < count * 4 + 8) {
            attempts++;
            const sym = stress.symbols[Math.floor(Math.random() * stress.symbols.length)];
            const s = makeStressSpine(sym, stress.anims ?? "mix");
            if (!s) continue;
            s.x = (Math.random() - 0.5) * d.refWidth;
            s.y = (Math.random() - 0.5) * d.refHeight;
            s.scale.set(0.45 + Math.random() * 0.5);
            root.addChild(s);
            spines.push(s);
          }
        };

        try {
          root = buildScene(d); // bg (+ overlays) only when grid is undefined
          app.stage.addChild(root);
          if (stress) {
            // fixed reference-frame fit - the content grows as the ramp climbs,
            // so we must NOT refit to the (ever-larger) content bounds.
            const sc = Math.min(
              (app.screen.width * 0.94) / d.refWidth,
              (app.screen.height * 0.94) / d.refHeight,
            );
            root.scale.set(sc);
            root.position.set(app.screen.width / 2, app.screen.height / 2);
            fit = { scale: sc, areaPx: d.refWidth * sc * (d.refHeight * sc), bounds: { w: d.refWidth, h: d.refHeight } };
            for (const s of sceneSpines(root)) {
              s.autoUpdate = false;
              spines.push(s);
            }
            spawnTo(Math.min(stressStart, stressMax));
          } else {
            fit = fitContainer(root, app.screen.width, app.screen.height, d.refWidth, d.refHeight);
            for (const s of sceneSpines(root)) {
              s.autoUpdate = false;
              spines.push(s);
            }
          }
        } catch (err) {
          skipScene(`build failed (${(err as Error).message})`);
          return;
        }
        if (spines.length === 0) {
          app.stage.removeChild(root);
          root.destroy({ children: true });
          skipScene("nothing rendered (assets failed)");
          return;
        }
        // first paint - if a broken attachment crashes render here, skip scene
        if (!safeRender(app)) {
          app.stage.removeChild(root);
          root.destroy({ children: true });
          skipScene("first render failed");
          return;
        }

        // measure fill coverage/overdraw ONCE for a representative instance -
        // the RI term the formula was missing. Cheap (one offscreen read) and
        // roughly animation-stable, so we reuse it for every per-frame sample.
        let coverage = { coveredKpx: 0, overdrawFactor: 1 };
        try {
          const rep = spines[spines.length - 1] ?? spines[0];
          if (rep) {
            const c = sampleCoverage(app.renderer as Renderer, rep);
            coverage = { coveredKpx: c.coveredKpx, overdrawFactor: c.overdrawFactor };
          }
        } catch {
          /* coverage is best-effort */
        }

        recorder.beginScenario({
          id: d.id,
          label: `${d.game} / ${d.state}`,
          spine: spines.length ? `${spines.length} spines` : d.id,
          kind: "scene",
          scene: {
            game: d.game,
            state: d.state,
            description: d.description,
            fitScale: Math.round(fit.scale * 10000) / 10000,
            onScreenAreaPx: Math.round(fit.areaPx),
            spineCount: stress ? stressMax : buildStats.spines,
            tier: d.tier ?? "unknown",
            missingRegions: buildStats.missingRegions,
          },
        });

        // adaptive stress ramp bookkeeping (density-doubling capacity curve)
        let currentCount = Math.min(stressStart, stressMax);
        let stepStartMs = 0;
        let stepDts: number[] = [];
        let stepGpu: number[] = [];
        let rampCapped = false;

        let elapsed = 0;
        let impactAge = Infinity;
        let heapAge = Infinity;
        let stallMs = 0;
        let lastNow = performance.now();
        let lastImpact = { ri: 0, ci: 0 };
        let lastInputs: ImpactInputs | null = null;
        let lastHeapMb: number | null = null;
        let lastGpuMs: number | null = null;
        let lastHud = 0;
        const recentDts: number[] = [];

        let rafId = 0;
        let done = false;
        const cleanup = () => {
          done = true;
          if (rafId) cancelAnimationFrame(rafId);
          app!.stage.removeChild(root);
          root.destroy({ children: true });
        };
        const finish = (reason: string | null) => {
          // record the final (open) ramp step so the last density is captured
          if (stress && stepDts.length > 0) recorder.closeStep(currentCount, stepDts);
          if (reason) recorder.markAborted(reason);
          cleanup();
          const fin = recorder.finalize(false);
          hooks.onSceneDone(d.id, fin.scenarios[0] ?? null, fin.perSecond);
          resolve(reason);
        };

        const tickFn = () => {
          if (done || !app) return;
          rafId = requestAnimationFrame(tickFn);
          if (cancelled) {
            cleanup();
            reject(new BenchCancelled());
            return;
          }
          const now = performance.now();
          const dt = now - lastNow;
          lastNow = now;
          if (resumeSkip || dt > 10_000) {
            resumeSkip = false;
            return;
          }
          elapsed += dt;
          runElapsed += dt;

          // WebGL context lost (iOS Safari GPU OOM): every render from here on
          // is black even though the loop keeps timing. Stop this scene; the run
          // loop sees watcher.contextLost and ends the run cleanly.
          if (watcher.contextLost) {
            finish("webgl context lost (GPU out of memory)");
            return;
          }

          // advance every spine and paint - this is what actually animates the
          // scene (spine.update takes seconds), independent of any Pixi ticker.
          // A blank attachment (missing region) can throw in render; skip that
          // scene rather than wedge the whole run. We time the CPU (update) and
          // GPU (render) separately - that separation is what lets us fit the
          // computational vs rendering cost and dodge the vsync floor.
          const dtSec = dt / 1000;
          const cpuStart = performance.now();
          try {
            for (const s of spines) s.update(dtSec);
          } catch (err) {
            console.warn(`[scene] update failed for ${d.id}, skipping: ${(err as Error).message}`);
            finish(null);
            return;
          }
          const cpuMs = performance.now() - cpuStart;
          gpuTimer.begin();
          const ok = safeRender(app);
          gpuTimer.end();
          gpuTimer.poll((ms) => {
            lastGpuMs = ms;
          });
          if (!ok) {
            console.warn(`[scene] render failed for ${d.id}, skipping`);
            finish(null);
            return;
          }

          if (dt >= STALL_FRAME_MS) {
            stallMs += dt;
            if (stallMs >= STALL_ABORT_MS) {
              finish(`stalled below 5 fps for ${Math.round(stallMs / 1000)}s`);
              return;
            }
          } else {
            stallMs = 0;
          }

          impactAge += dt;
          if (impactAge >= IMPACT_SAMPLE_MS && spines.length > 0) {
            const s = sampleSceneImpact(spines);
            lastImpact = { ri: s.ri, ci: s.ci };
            // attach the measured fill term so the captured feature vector
            // carries coverage/overdraw for the offline fit
            lastInputs = s.one
              ? { ...s.one, coveredKpx: coverage.coveredKpx, overdrawFactor: coverage.overdrawFactor }
              : null;
            impactAge = 0;
          }
          heapAge += dt;
          if (heapAge >= 1000) {
            const heap = heapSnapshot();
            lastHeapMb = heap.usedMb;
            heapAge = 0;
            if (
              heap.usedMb != null &&
              heap.limitMb != null &&
              heap.usedMb > heap.limitMb * HEAP_ABORT_RATIO
            ) {
              finish(`heap at ${heap.usedMb}/${heap.limitMb} MB`);
              return;
            }
          }

          recorder.tick(dt, spines.length, {
            ri: lastImpact.ri,
            ci: lastImpact.ci,
            one: lastInputs,
            heapMb: lastHeapMb,
            gpuMs: gpuTimer.supported ? lastGpuMs : null,
            cpuMs,
          });

          recentDts.push(dt);
          if (recentDts.length > 30) recentDts.shift();
          lastHud += dt;
          if (lastHud >= 200) {
            lastHud = 0;
            const avg = recentDts.reduce((a, b) => a + b, 0) / recentDts.length;
            hooks.onHud({
              scenarioLabel: `${d.game} / ${d.state}`,
              scenarioIndex: index,
              scenarioCount: scenes.length,
              elapsedMs: runElapsed,
              totalMs,
              fps: avg > 0 ? 1000 / avg : 0,
              instances: spines.length,
            });
          }

          // adaptive density ramp: hold each density for STRESS_STEP_MS, record
          // its cost, then DOUBLE - until the true GPU time (vsync-independent)
          // crosses GPU_KNEE_MS, or fps collapses when no timer is available, or
          // we hit the safety ceiling. That crossing IS the device's breaking
          // point (thesis #5/#6).
          if (stress && !rampCapped) {
            stepDts.push(dt);
            if (lastGpuMs != null) stepGpu.push(lastGpuMs);
            if (elapsed - stepStartMs >= STRESS_STEP_MS) {
              recorder.closeStep(currentCount, stepDts);
              const p95Dt = percentile95(stepDts);
              const stepFps = p95Dt > 0 ? 1000 / (stepDts.reduce((a, b) => a + b, 0) / stepDts.length) : 0;
              const gpuP95 = stepGpu.length ? percentile95(stepGpu) : null;
              stepDts = [];
              stepGpu = [];
              stepStartMs = elapsed;
              const overGpu = gpuP95 != null && gpuP95 > GPU_KNEE_MS;
              const overCpu = gpuP95 == null && stepFps < RAMP_GATE_FPS;
              if (overGpu || overCpu || currentCount >= stressMax) {
                rampCapped = true;
                recorder.markAborted(
                  overGpu
                    ? `knee at ${currentCount} instances (GPU ${gpuP95!.toFixed(1)}ms > ${GPU_KNEE_MS}ms)`
                    : currentCount >= stressMax
                      ? `reached safety ceiling ${stressMax} instances (still ${stepFps.toFixed(0)} fps)`
                      : `knee at ${currentCount} instances (${stepFps.toFixed(0)} fps < ${RAMP_GATE_FPS})`,
                );
              } else {
                currentCount = Math.min(currentCount * 2, stressMax);
                spawnTo(currentCount);
              }
            }
          }

          if (elapsed >= sceneDur) finish(null);
        };

        lastNow = performance.now();
        rafId = requestAnimationFrame(tickFn);
      });

    const settle = (ms: number) =>
      new Promise<void>((r) => window.setTimeout(r, ms));

    // free GPU textures of the finished scene so they don't accumulate across
    // 18 games (the main driver of iOS context loss). Best-effort.
    const gpuGc = () => {
      try {
        (app?.renderer as unknown as { textureGC?: { run?: () => void } })?.textureGC?.run?.();
      } catch {
        /* renderer may lack a texture GC - ignore */
      }
    };

    // when each alias is last needed, so we can free a game's textures as soon
    // as its scenes are done (bounds resident GPU memory to the working set).
    const aliasLastUse = new Map<string, number>();
    toMeasure.forEach((d, i) => {
      for (const a of sceneAssetAliases(d)) aliasLastUse.set(a, i);
    });

    try {
      // iterate the FULL scene list (so the global index is stable); measure the
      // ones not already done/crashed. Each scene emits onSceneEnter/onSceneDone
      // so the run survives a tab crash and resumes on reload.
      let measuredIndex = -1;
      for (let i = 0; i < scenes.length; i++) {
        const d = scenes[i];
        if (skip.has(d.id)) continue;
        measuredIndex++;
        hooks.onSceneEnter(d.id);
        await runScene(d, i, durOf(d));
        // a tab crash never reaches here; context loss does - end the segment.
        if (watcher.contextLost) break;
        // release textures no later scene needs, then GC, so games' atlases
        // don't pile up on the GPU (iOS context loss).
        const doneAliases = [...aliasLastUse]
          .filter(([, last]) => last === measuredIndex)
          .map(([a]) => a);
        if (doneAliases.length) void unloadAliases(doneAliases);
        gpuGc();
        await settle(SETTLE_MS);
      }

      const cpuScoreEnd = cpuScore();
      const heapEnd = heapSnapshot();
      const batteryEnd = await readBattery();
      const watched = watcher.stop();

      const rendererType =
        (app.renderer as unknown as { name?: string }).name ??
        String(app.renderer.type);

      return {
        contextLost: watcher.contextLost,
        longTasks: watched.longTasks,
        loaf: watched.loaf,
        events: watched.events,
        resources: spineResourceTimings(),
        hiddenMs,
        environment: {
          displayHz,
          cpuScoreStart,
          cpuScoreEnd,
          cpuDriftPct:
            cpuScoreStart > 0
              ? Math.round(((cpuScoreEnd - cpuScoreStart) / cpuScoreStart) * 1000) / 10
              : 0,
          rendererType,
          pixiResolution: app.renderer.resolution,
          heapStart,
          heapEnd,
          batteryEnd,
          contextLost: watcher.contextLost,
        },
      };
    } finally {
      document.removeEventListener("visibilitychange", onVisibility);
      void wakeLock?.release().catch(() => undefined);
      gpuTimer.dispose();
      try {
        app?.destroy(true, { children: true });
      } catch {
        /* destroying a lost GL context can throw - the report is already built */
      }
      app = null;
    }
  })();

  return { result, cancel };
}
