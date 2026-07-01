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

import type { BenchResult, ImpactInputs } from "@/types";
import { Recorder } from "./recorder";
import { measureFrameImpactDetailed } from "./impact";
import { cpuScore, heapSnapshot, measureDisplayHz, readBattery } from "./probes";
import { PerfWatcher, spineResourceTimings } from "./watcher";
import { saveStash } from "@/lib/stash";
import { CLIENT_VERSION } from "@/config";
import {
  buildScene,
  buildStats,
  fitContainer,
  preloadAllScenes,
  sceneSpines,
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

export interface SceneHooks {
  onHud: (hud: HudState) => void;
  /** Preload progress as a 0..1 fraction (the load-all gate). */
  onProgress: (fraction: number) => void;
  /** Fired once the gate is fully loaded and measuring is about to begin. */
  onMeasureStart: () => void;
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
  hooks: SceneHooks,
): { result: Promise<BenchResult>; cancel: () => void } {
  let cancelled = false;
  let app: Application | null = null;
  let wakeLock: { release: () => Promise<void> } | null = null;

  const cancel = () => {
    cancelled = true;
  };

  const result = (async (): Promise<BenchResult> => {
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

    // ── load stuff: ONE dedup'd preload of every scene's assets, with an
    // on-canvas spinner + progress so it's clearly loading (not broken). The
    // gate only resolves when all assets have settled. ──
    const loader = createLoader(app);
    await preloadAllScenes(scenes, (frac) => {
      loader.setProgress(frac);
      hooks.onProgress(frac);
    });
    loader.stop();
    if (cancelled) throw new BenchCancelled();
    const playable = scenes; // build-time resilience handles any bad scene
    hooks.onMeasureStart();

    const recorder = new Recorder();
    let hiddenAt: number | null = null;
    let resumeSkip = false;
    const onVisibility = () => {
      if (document.hidden) {
        hiddenAt = performance.now();
      } else if (hiddenAt != null) {
        recorder.hiddenMs += performance.now() - hiddenAt;
        hiddenAt = null;
        resumeSkip = true;
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    const sceneMs = Math.max(
      3000,
      Math.floor((totalSeconds * 1000) / playable.length) - SETTLE_MS,
    );
    const totalMs = (sceneMs + SETTLE_MS) * playable.length;
    const startedAt = new Date().toISOString();
    let runElapsed = 0;

    /** Play + measure one scene for sceneMs; resolves with abort reason or null. */
    const runScene = (d: SceneDescriptor, index: number) =>
      new Promise<string | null>((resolve, reject) => {
        if (!app) return reject(new BenchCancelled());

        buildStats.missingRegions = 0;
        buildStats.spines = 0;
        let root;
        let fit;
        let spines: Spine[];
        try {
          root = buildScene(d);
          app.stage.addChild(root);
          fit = fitContainer(root, app.screen.width, app.screen.height, d.refWidth, d.refHeight);
          spines = sceneSpines(root);
        } catch (err) {
          console.warn(`[scene] build failed for ${d.id}, skipping: ${(err as Error).message}`);
          resolve(null);
          return;
        }
        if (spines.length === 0) {
          // nothing rendered (all assets for this scene failed) - skip
          app.stage.removeChild(root);
          root.destroy({ children: true });
          resolve(null);
          return;
        }
        // we drive updates ourselves (autoUpdate rides Pixi's shared ticker,
        // which we stopped) so animation never stalls independently of timing
        for (const s of spines) s.autoUpdate = false;
        // first paint - if a broken attachment crashes render here, skip scene
        if (!safeRender(app)) {
          console.warn(`[scene] first render failed for ${d.id}, skipping`);
          app.stage.removeChild(root);
          root.destroy({ children: true });
          resolve(null);
          return;
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
            spineCount: buildStats.spines,
            tier: d.tier ?? "unknown",
            missingRegions: buildStats.missingRegions,
          },
        });

        let elapsed = 0;
        let impactAge = Infinity;
        let heapAge = Infinity;
        let stallMs = 0;
        let lastNow = performance.now();
        let lastImpact = { ri: 0, ci: 0 };
        let lastInputs: ImpactInputs | null = null;
        let lastHeapMb: number | null = null;
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
          if (reason) recorder.markAborted(reason);
          cleanup();
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

          // advance every spine and paint - this is what actually animates the
          // scene (spine.update takes seconds), independent of any Pixi ticker.
          // A blank attachment (missing region) can throw in render; skip that
          // scene rather than wedge the whole run.
          const dtSec = dt / 1000;
          try {
            for (const s of spines) s.update(dtSec);
          } catch (err) {
            console.warn(`[scene] update failed for ${d.id}, skipping: ${(err as Error).message}`);
            finish(null);
            return;
          }
          if (!safeRender(app)) {
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
            lastInputs = s.one;
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
            saveStash({
              startedAt,
              updatedAt: new Date().toISOString(),
              clientVersion: CLIENT_VERSION,
              scenarioId: d.id,
              scenarioIndex: index,
              scenarioCount: playable.length,
              elapsedMs: Math.round(runElapsed),
              instances: spines.length,
              fps: recentDts.length
                ? Math.round((1000 / (recentDts.reduce((a, b) => a + b, 0) / recentDts.length)) * 10) / 10
                : 0,
              heapMb: lastHeapMb,
              displayHz,
              cpuScoreStart,
              recentSeconds: recorder.recentPerSecond(30),
            });
          }

          recorder.tick(dt, spines.length, {
            ri: lastImpact.ri,
            ci: lastImpact.ci,
            one: lastInputs,
            heapMb: lastHeapMb,
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
              scenarioCount: playable.length,
              elapsedMs: runElapsed,
              totalMs,
              fps: avg > 0 ? 1000 / avg : 0,
              instances: spines.length,
            });
          }

          if (elapsed >= sceneMs) finish(null);
        };

        lastNow = performance.now();
        rafId = requestAnimationFrame(tickFn);
      });

    const settle = (ms: number) =>
      new Promise<void>((r) => window.setTimeout(r, ms));

    let runAbortReason: string | null = null;
    try {
      let consecutiveAborts = 0;
      for (let i = 0; i < playable.length; i++) {
        const aborted = await runScene(playable[i], i);
        if (aborted) {
          consecutiveAborts++;
          if (consecutiveAborts >= 2) {
            runAbortReason = `device floor reached: ${aborted}`;
            break;
          }
        } else {
          consecutiveAborts = 0;
        }
        if (i < playable.length - 1) await settle(SETTLE_MS);
      }
      recorder.endScenario();

      const cpuScoreEnd = cpuScore();
      const heapEnd = heapSnapshot();
      const batteryEnd = await readBattery();
      const watched = watcher.stop();
      const base = recorder.finalize(totalSeconds < 120);

      const rendererType =
        (app.renderer as unknown as { name?: string }).name ??
        String(app.renderer.type);

      return {
        scenarios: base.scenarios,
        summary: {
          ...base.summary,
          displayHz,
          longTaskCount: watched.longTasks.count,
          longTaskTotalMs: watched.longTasks.totalMs,
          ...(runAbortReason ? { aborted: true, abortReason: runAbortReason } : {}),
        },
        capture: {
          frames: base.frames,
          perSecond: base.perSecond,
          longTasks: watched.longTasks,
          loaf: watched.loaf,
          events: watched.events,
          resources: spineResourceTimings(),
        },
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
      app?.destroy(true, { children: true });
      app = null;
    }
  })();

  return { result, cancel };
}
