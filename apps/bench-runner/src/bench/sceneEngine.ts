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
import { estimatePoseCoverage, FEATURE_KEYS, type WalkableSkeleton } from "@spine-benchmark/metrics-impact-formula";
import { mountCrawler, type Crawler, type FrameRecord } from "@spine-benchmark/pixi-crawler";

import type {
  FrameMetrics,
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
import { initRamp, rampStep, type RampConfig, type RampState } from "./ramp";

const IMPACT_SAMPLE_MS = 500;
const STALL_FRAME_MS = 200;
const STALL_ABORT_MS = 3000;
const HEAP_ABORT_RATIO = 0.85;
const MAX_FRAMEBUFFER_AREA = 2_600_000;
/** Blank gap between scenes: lets GC + GPU settle so metrics stay clean. */
const SETTLE_MS = 700;
/**
 * Measured window per scene. A per-frame median stabilizes in seconds, not
 * minutes: this covers JIT warmup + at least one full animation cycle (so the
 * heaviest pose is caught) + a stable median window. The old 5-minute run was
 * sized to feed a regression; a direct measurement needs none of that.
 */
const SCENE_MEASURE_MS = 3500;
/** Cap stress density on mobile GPUs (iOS Safari loses the WebGL context well
 * before fps gates if you pile on hundreds of heavy mesh spines). */
const MOBILE_STRESS_CAP = 80;
/** Hard safety ceiling for the adaptive ramp on desktop. */
const DESKTOP_STRESS_MAX = 8192;
/** Time held at each ramp density before doubling. */
const STRESS_STEP_MS = 1100;
/** Fraction of native refresh below which a ramp step is "not sustaining" - the
 * sustain knee (capacity ceiling) is where fps first drops under this. */
const SUSTAIN_FRAC = 0.92;
/** Bisection probes spent pinning the sustain knee once the doubling ramp has
 * bracketed it (thesis #5). */
const KNEE_BISECTS = 4;
/** Stop bisecting once the last-good / first-bad bracket is this tight. */
const KNEE_MIN_GAP = 4;

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

/** Combined on-screen scale of a spine (its world transform x renderer
 * resolution) - what a skeleton-local px maps to in framebuffer px. */
function worldScaleOf(s: Spine, resolution: number): number {
  const m = s.worldTransform;
  const det = Math.abs(m.a * m.d - m.b * m.c);
  return Math.sqrt(det) * resolution;
}

/** Above this pool size, sample ONE spine and scale (only huge DESKTOP stress
 * ramps reach here - up to 8192 - and walking thousands every sample would be
 * prohibitive; representative x count is unbiased in expectation). At or below
 * it - EVERY real scene (16-32 different skeletons) AND every mobile stress
 * pool (capped at 80, and a MIX of 9 different symbols) - walk every spine.
 * Mobile stress is NOT homogeneous, so one-representative x count was wrong for
 * it too; that is the bug this cap now covers. */
const SCENE_SUM_CAP = 256;

/** Feature vector of one posed skeleton (walker + geometric coverage). Coverage
 * is returned pre-folded into painted kpx (coveredKpx x overdraw, overdraw 1)
 * so summing across heterogeneous spines is correct - mean-of-products errors
 * don't creep into the fill term. */
function spineFeatures(s: Spine, resolution: number): ImpactInputs {
  const d = measureFrameImpactDetailed(s.skeleton);
  const cov = estimatePoseCoverage(s.skeleton as unknown as WalkableSkeleton, {
    scale: worldScaleOf(s, resolution),
  });
  return {
    ...d.inputs,
    coveredKpx: cov.coveredKpx * Math.max(1, cov.overdrawFactor),
    overdrawFactor: 1,
  };
}

/** The scene's live RI/CI + the per-instance feature vector the fit trains on.
 *
 * For a heterogeneous scene the feature vector is the MEAN over EVERY spine, so
 * the fit's `mean x instances` equals the true scene total (which is what
 * frameCpuMs measures). The old "one representative x count" is only valid for
 * a homogeneous pool and silently wrecks the fit on real multi-skeleton scenes
 * (per-family R2 ~0.2). RI/CI are the true sum across all spines. */
function sampleSceneImpact(
  spines: Spine[],
  rotate: number,
  resolution: number,
): { ri: number; ci: number; one: ImpactInputs | null } {
  const n = spines.length;
  if (n === 0) return { ri: 0, ci: 0, one: null };

  // Only a huge desktop stress pool is too big to walk; there, one
  // representative x count is unbiased in expectation. Everything else - real
  // scenes AND mobile stress (a mix of symbols) - is walked in full.
  if (n > SCENE_SUM_CAP) {
    const rep = spines[rotate % n];
    const d = measureFrameImpactDetailed(rep.skeleton);
    return { ri: d.ri * n, ci: d.ci * n, one: spineFeatures(rep, resolution) };
  }

  let ri = 0;
  let ci = 0;
  const sum = {} as Record<(typeof FEATURE_KEYS)[number], number>;
  for (const k of FEATURE_KEYS) sum[k] = 0;
  for (const s of spines) {
    const d = measureFrameImpactDetailed(s.skeleton);
    ri += d.ri;
    ci += d.ci;
    const f = spineFeatures(s, resolution);
    for (const k of FEATURE_KEYS) sum[k] += f[k] ?? 0;
  }
  const one = {} as ImpactInputs;
  for (const k of FEATURE_KEYS) one[k] = sum[k] / n;
  one.overdrawFactor = 1; // already folded into coveredKpx per spine
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

/** Flatten a crawler FrameRecord into the runner's captured measurement set. */
function toFrameMetrics(r: FrameRecord): FrameMetrics {
  const c = r.counters;
  const rs = r.renderSplit;
  const t = r.textures;
  return {
    drawCalls: c.drawCalls,
    verticesDrawn: c.verticesDrawn,
    stencilMasks: c.stencilMaskPasses,
    renderTargets: c.renderTargetSwitches,
    batchBreaks: c.batchBreaks,
    instructions: c.instructions,
    renderablesUpdated: c.renderablesUpdated,
    renderGroupsRebuilt: c.renderGroupsRebuilt,
    stateChanges: c.stateChanges,
    shaderCompiles: c.shaderCompiles,
    bufferUploads: c.bufferUploads,
    bufferKb: c.bufferBytesUploaded / 1024,
    buildMs: rs?.buildInstructionsMs ?? 0,
    updateRendMs: rs?.updateRenderablesMs ?? 0,
    batchUploadMs: rs?.batchUploadMs ?? 0,
    transformsMs: rs?.transformsMs ?? 0,
    executeMs: rs?.executeInstructionsMs ?? 0,
    renderOtherMs: rs?.renderOtherMs ?? 0,
    gcMs: r.phases.gcMs,
    texUploads: t.uploadsThisFrame,
    texUnloads: t.unloadsThisFrame,
    texBytesKb: t.bytesUploadedThisFrame / 1024,
    activeTextures: t.activeGpuCount,
    filterPasses: r.filter?.passes ?? 0,
  };
}

export function startSceneBenchmark(
  host: HTMLElement,
  scenes: SceneDescriptor[],
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
    // The probe resolves 0 when rAF never fires (hidden-tab start) and can read
    // absurdly low on a throttled tab. A 0 here would make the ramp unfailable
    // (sustainFps 0, budget Infinity) - budget on a sane floor, report raw.
    const hzForBudget = displayHz >= 20 ? displayHz : 60;
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
    // The crawler is the measurement instrument: it hooks the renderer for the
    // true per-frame GPU time (EXT_disjoint_timer_query, null on Safari/mobile)
    // plus the CPU phase split and workload counters. The ticker is stopped, so
    // we bracket each rendered frame manually with frameStart()/frameEnd(). A
    // small ring buffer is all we need (we only read the latest resolved gpuMs).
    // Full measurement, honest cpuMs. We capture EVERYTHING the crawler exposes
    // per frame (device-invariant counters, CPU render-phase split, textures,
    // filter passes, true GPU ms) so the offline fit has ground-truth drivers on
    // every device. The ONE thing left off is spineProfile: it prototype-patches
    // Skeleton.update / AnimationState.apply, which run INSIDE the s.update() loop
    // we time as cpuMs - leaving it on would fold probe overhead into that number.
    // The other hooks run in the render path (after cpuMs) and off the gpuMs
    // (GPU-side) path, so they enrich the data without corrupting the two core
    // signals; their only cost is a small, uniform bump to total frame time.
    const crawler: Crawler = mountCrawler(app, {
      hud: false,
      bufferSize: 32,
      autoDispose: false,
      spineProfile: { enabled: false },
    });

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

    // Fixed short measured window per scene - identical whether it runs now or
    // after a resume, and independent of how many scenes there are. Direct
    // measurement doesn't need a big time budget; a few seconds gives a stable
    // per-frame median.
    const durOf = (_d: SceneDescriptor) => SCENE_MEASURE_MS;
    const totalMs =
      scenes.reduce((a, d) => a + durOf(d), 0) + SETTLE_MS * (scenes.length - 1);
    // seed elapsed with the time already covered by scenes done/skipped in
    // earlier segments, so the progress bar stays tied to global N/total after
    // a crash-reload instead of jumping back to 0.
    let runElapsed = scenes
      .filter((d) => skip.has(d.id))
      .reduce((a, d) => a + durOf(d) + SETTLE_MS, 0);

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

        // Spines belonging to the base scene (never removed by the ramp).
        // Stress spines are appended after them, so shrinking pops the tail.
        let stressBaseCount = 0;

        /** Grow OR shrink the stress pool to `count` on-stage spines. The
         * bisect phase targets densities BELOW the failed step, so removal must
         * work - a grow-only pool would silently measure the old (higher)
         * density under the new label, fabricating the knee. */
        const spawnTo = (count: number) => {
          if (!stress) return;
          const floor = Math.max(count, stressBaseCount);
          while (spines.length > floor) {
            const s = spines.pop()!;
            root.removeChild(s);
            s.destroy();
          }
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
            stressBaseCount = spines.length;
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
            // what is actually on stage as the scene starts (stress scenes grow
            // from here; the reached density lives in stats.maxInstances)
            spineCount: spines.length,
            tier: d.tier ?? "unknown",
            missingRegions: buildStats.missingRegions,
          },
        });

        // adaptive stress ramp bookkeeping (double-then-bisect capacity curve)
        let currentCount = Math.min(stressStart, stressMax);
        let stepStartMs = 0;
        let stepDts: number[] = [];
        let stepGpu: number[] = [];
        let rampCapped = false;
        const rampCfg: RampConfig = {
          stressMax,
          sustainFps: SUSTAIN_FRAC * hzForBudget,
          ceilingBudgetMs: 1000 / hzForBudget,
          maxBisects: KNEE_BISECTS,
          minGap: KNEE_MIN_GAP,
        };
        let rampState: RampState = initRamp(currentCount);

        let elapsed = 0;
        let impactAge = Infinity;
        let impactRotate = 0;
        let heapAge = Infinity;
        let stallMs = 0;
        let lastNow = performance.now();
        let lastImpact = { ri: 0, ci: 0 };
        let lastInputs: ImpactInputs | null = null;
        let lastHeapMb: number | null = null;
        let lastGpuMs: number | null = null;
        let lastResolvedGpuIdx = -1;
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
          if (stress && stepDts.length > 0) recorder.closeStep(spines.length, stepDts);
          // an abort mid-ramp (stall/heap/context) still carries real capacity
          // info: lo = the largest density that sustained refresh. Persist the
          // partial bracket instead of discarding it with the scene.
          if (stress && !rampCapped) {
            recorder.setKnees(rampState.lo > 0 ? rampState.lo : null, rampState.hi);
          }
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
          crawler.frameStart();
          const cpuStart = performance.now();
          try {
            for (const s of spines) s.update(dtSec);
          } catch (err) {
            console.warn(`[scene] update failed for ${d.id}, skipping: ${(err as Error).message}`);
            finish(null);
            return;
          }
          const cpuMs = performance.now() - cpuStart;
          const ok = safeRender(app);
          crawler.frameEnd();
          // Full measurement of the just-rendered frame (counters, render-split,
          // textures, filter) - available synchronously on flush.
          const rec = crawler.getLastFrame();
          const frameMetrics = rec ? toFrameMetrics(rec) : null;
          // Drain ALL newly resolved GPU queries from the ring (EXT results
          // land a few frames late, in submission order). Each resolved query
          // is ingested exactly once - never carried forward into later ticks,
          // which would duplicate samples, weight each reading by its staleness
          // and fake the gpuFrames coverage counter at ~100%. lastGpuMs remains
          // only as the HUD display value.
          const newGpu: number[] = [];
          let newDisjoints = 0;
          const frames = crawler.getFrames();
          for (const f of frames) {
            if (f.frameIdx <= lastResolvedGpuIdx) continue;
            if (f.gpuMs != null) {
              newGpu.push(f.gpuMs);
              lastGpuMs = f.gpuMs;
              lastResolvedGpuIdx = f.frameIdx;
            } else if (f.gpuDisjoint) {
              newDisjoints++;
              lastResolvedGpuIdx = f.frameIdx;
            } else if (rec && f.frameIdx < rec.frameIdx - 8) {
              // a query this old will never resolve (evicted/lost) - skip past
              // it so one dead query can't block ingestion for the whole scene.
              lastResolvedGpuIdx = f.frameIdx;
            } else {
              // queries resolve in order: the first still-pending frame ends
              // the resolved prefix; later entries can't be resolved yet.
              break;
            }
          }
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
            const s = sampleSceneImpact(spines, impactRotate++, app.renderer.resolution);
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
          }

          recorder.tick(dt, spines.length, {
            ri: lastImpact.ri,
            ci: lastImpact.ci,
            one: lastInputs,
            heapMb: lastHeapMb,
            gpuSamples: newGpu,
            cpuMs,
            frame: frameMetrics,
            gpuDisjoints: newDisjoints,
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
          // its cost, then let the ramp controller (ramp.ts) decide the next
          // density - doubling until the device first drops below refresh, then
          // bisecting to pin the sustain knee (its capacity). thesis #5/#6.
          if (stress && !rampCapped) {
            stepDts.push(dt);
            // only newly-resolved GPU readings; carrying the stale lastGpuMs
            // each frame would duplicate samples into the step's p95
            stepGpu.push(...newGpu);
            if (elapsed - stepStartMs >= STRESS_STEP_MS) {
              // label the step with what was ACTUALLY on stage (spawnTo can
              // undershoot when symbol construction fails), never the target
              recorder.closeStep(spines.length, stepDts);
              const p95Dt = percentile95(stepDts);
              const stepFps = p95Dt > 0 ? 1000 / (stepDts.reduce((a, b) => a + b, 0) / stepDts.length) : 0;
              const gpuP95 = stepGpu.length ? percentile95(stepGpu) : null;
              stepDts = [];
              stepGpu = [];
              stepStartMs = elapsed;
              // double until the device first drops below refresh, then bisect
              // the bracket to pin the sustain knee (its capacity). See ramp.ts.
              rampState = rampStep(
                rampState,
                { count: spines.length, fps: stepFps, gpuP95 },
                rampCfg,
              );
              if (rampState.phase === "done") {
                rampCapped = true;
                recorder.markAborted(rampState.reason ?? "ramp complete");
                recorder.setKnees(rampState.sustainInstances, rampState.collapseInstances);
              } else {
                currentCount = rampState.next;
                spawnTo(currentCount);
                // the spawn/destroy work + first paint of the new density all
                // land in the NEXT frame's dt - skip that frame so step stats
                // only ever contain steady-state frames of the labeled density
                resumeSkip = true;
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
      void crawler.dispose();
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
