import { Application, Assets } from "pixi.js";
import { Spine } from "@esotericsoftware/spine-pixi-v8";

import type { BenchResult, ImpactInputs } from "@/types";
import { Recorder } from "./recorder";
import { measureFrameImpactDetailed } from "./impact";
import { loadManifest, buildPlan, type Scenario } from "./plan";
import { cpuScore, heapSnapshot, measureDisplayHz, readBattery } from "./probes";
import { PerfWatcher, spineResourceTimings } from "./watcher";
import { saveStash, clearStash } from "@/lib/stash";
import { CLIENT_VERSION } from "@/config";

export interface HudState {
  scenarioLabel: string;
  scenarioIndex: number;
  scenarioCount: number;
  elapsedMs: number;
  totalMs: number;
  fps: number;
  instances: number;
}

export interface EngineHooks {
  onHud: (hud: HudState) => void;
}

const SWARM_CAP = 60;
const IMPACT_SAMPLE_MS = 500;

// Safety rails for weak devices: dying at the breaking point is the
// measurement, crashing the browser loses it.
/** A frame slower than this counts toward the stall streak (5 fps). */
const STALL_FRAME_MS = 200;
/** Abort the scenario after this much consecutive stall time. */
const STALL_ABORT_MS = 3000;
/** Stop raising the ramp below this fps - hold at the breaking point. */
const RAMP_GATE_FPS = 15;
/** Stop adding swarm instances below this fps. */
const SWARM_GATE_FPS = 20;
/** Abort the scenario when the JS heap passes this share of its limit. */
const HEAP_ABORT_RATIO = 0.85;
/** Cap the framebuffer (logical px x resolution^2) to ~2.6 MP. */
const MAX_FRAMEBUFFER_AREA = 2_600_000;

interface InstancePool {
  /** Base local bounds per spine id, measured once at scale 1. */
  base: Map<string, { w: number; h: number; ox: number; oy: number }>;
  active: { spineId: string; spine: Spine }[];
}

export class BenchCancelled extends Error {
  constructor() {
    super("benchmark cancelled");
  }
}

/**
 * Runs the full scenario plan inside a fullscreen pixi Application mounted
 * on `host`. Resolves with the captured result; rejects with
 * BenchCancelled when `cancel()` is called (e.g. component unmount).
 */
export function startBenchmark(
  host: HTMLElement,
  totalSeconds: number,
  hooks: EngineHooks,
): { result: Promise<BenchResult>; cancel: () => void } {
  let cancelled = false;
  let app: Application | null = null;
  let wakeLock: { release: () => Promise<void> } | null = null;

  const cancel = () => {
    cancelled = true;
  };

  const result = (async (): Promise<BenchResult> => {
    const manifest = await loadManifest();
    const plan = buildPlan(manifest, totalSeconds);
    const totalMs = plan.reduce((a, s) => a + s.durationMs, 0);

    // pre-run probes: panel refresh rate + cpu baseline + heap
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
      background: 0x161616,
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

    // preload every spine in the manifest
    for (const s of manifest.spines) {
      Assets.add({ alias: `${s.id}-skel`, src: s.skel });
      Assets.add({ alias: `${s.id}-atlas`, src: s.atlas });
    }
    await Assets.load(
      manifest.spines.flatMap((s) => [`${s.id}-skel`, `${s.id}-atlas`]),
    );
    if (cancelled) throw new BenchCancelled();

    const recorder = new Recorder();
    let hiddenAt: number | null = null;
    // set when the tab returns to foreground: the next frame's delta spans
    // the whole hidden gap and must not be recorded as a frame
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

    const pool: InstancePool = { base: new Map(), active: [] };

    const makeInstance = (spineId: string): Spine => {
      const spine = Spine.from({
        skeleton: `${spineId}-skel`,
        atlas: `${spineId}-atlas`,
      });
      // longest animation reads as the most representative workload
      const anims = spine.skeleton.data.animations;
      if (anims.length > 0) {
        const longest = anims.reduce((a, b) => (b.duration > a.duration ? b : a));
        const entry = spine.state.setAnimation(0, longest.name, true);
        entry.trackTime = Math.random() * Math.max(0.01, longest.duration);
      }
      if (!pool.base.has(spineId)) {
        const b = spine.getLocalBounds();
        pool.base.set(spineId, {
          w: Math.max(1, b.width),
          h: Math.max(1, b.height),
          ox: b.x + b.width / 2,
          oy: b.y + b.height / 2,
        });
      }
      return spine;
    };

    const manifestScale = (spineId: string): number =>
      manifest.spines.find((s) => s.id === spineId)?.scale ?? 1;

    const layout = () => {
      if (!app) return;
      const n = pool.active.length;
      if (n === 0) return;
      const W = app.screen.width;
      const H = app.screen.height;
      const cols = Math.max(1, Math.ceil(Math.sqrt((n * W) / H)));
      const rows = Math.max(1, Math.ceil(n / cols));
      const cellW = W / cols;
      const cellH = H / rows;
      pool.active.forEach((inst, i) => {
        const base = pool.base.get(inst.spineId)!;
        const fit =
          Math.min((cellW * 0.82) / base.w, (cellH * 0.82) / base.h) *
          manifestScale(inst.spineId);
        inst.spine.scale.set(fit);
        inst.spine.pivot.set(base.ox, base.oy);
        const col = i % cols;
        const row = Math.floor(i / cols);
        inst.spine.position.set(
          cellW * col + cellW / 2,
          cellH * row + cellH / 2,
        );
      });
    };

    const addInstance = (spineId: string) => {
      if (!app) return;
      const spine = makeInstance(spineId);
      pool.active.push({ spineId, spine });
      app.stage.addChild(spine);
      layout();
    };

    const setInstanceCount = (spineId: string, target: number) => {
      while (pool.active.length > target) {
        const inst = pool.active.pop()!;
        inst.spine.destroy();
      }
      while (pool.active.length < target) {
        const spine = makeInstance(spineId);
        pool.active.push({ spineId, spine });
        app!.stage.addChild(spine);
      }
      layout();
    };

    const clearInstances = () => {
      for (const inst of pool.active) inst.spine.destroy();
      pool.active = [];
    };

    // hud bookkeeping across the whole run
    let runElapsed = 0;
    let lastHud = 0;
    const recentDts: number[] = [];

    const startedAt = new Date().toISOString();

    /** Resolves with the abort reason, or null when it ran to time. */
    const runScenario = (sc: Scenario, index: number) =>
      new Promise<string | null>((resolve, reject) => {
        if (!app) {
          reject(new BenchCancelled());
          return;
        }
        clearInstances();

        const spineFor = (i: number) => sc.spines[i % sc.spines.length];
        if (sc.kind === "solo") setInstanceCount(sc.spines[0], 1);
        if (sc.kind === "ramp") setInstanceCount(sc.spines[0], sc.rampSteps![0]);
        if (sc.kind === "swarm") {
          for (const id of sc.spines) addInstance(id);
        }

        recorder.beginScenario({
          id: sc.id,
          label: sc.label,
          spine: sc.spines.join("+"),
          kind: sc.kind,
        });

        let elapsed = 0;
        let stepIdx = 0;
        let stepDts: number[] = [];
        let rampCapped = false;
        let swarmTimer = 0;
        let swarmIdx = 0;
        let impactAge = Infinity;
        let heapAge = Infinity;
        let stallMs = 0;
        let lastNow = performance.now();
        let lastImpact = { ri: 0, ci: 0 };
        let lastInputs: ImpactInputs | null = null;
        let lastHeapMb: number | null = null;
        const stepDur = sc.rampSteps
          ? sc.durationMs / sc.rampSteps.length
          : Infinity;

        const rollingFps = (): number => {
          if (recentDts.length === 0) return 60;
          const avg = recentDts.reduce((a, b) => a + b, 0) / recentDts.length;
          return avg > 0 ? 1000 / avg : 60;
        };

        const finish = (reason: string | null) => {
          if (sc.kind === "ramp" && stepDts.length > 0) {
            recorder.closeStep(sc.rampSteps![stepIdx], stepDts);
          }
          if (reason) recorder.markAborted(reason);
          app!.ticker.remove(tickFn);
          resolve(reason);
        };

        const tickFn = () => {
          if (!app) return;
          if (cancelled) {
            app.ticker.remove(tickFn);
            reject(new BenchCancelled());
            return;
          }
          // real frame delta - ticker.deltaMS is capped at 100 ms and would
          // hide exactly the stalls a weak device produces
          const now = performance.now();
          const dt = now - lastNow;
          lastNow = now;
          if (resumeSkip || dt > 10_000) {
            // hidden-tab gap, not a frame
            resumeSkip = false;
            return;
          }
          elapsed += dt;
          runElapsed += dt;

          // stall watchdog: sustained < 5 fps means the OS killing the tab
          // is next - bail out and keep the data
          if (dt >= STALL_FRAME_MS) {
            stallMs += dt;
            if (stallMs >= STALL_ABORT_MS) {
              finish(`stalled below 5 fps for ${Math.round(stallMs / 1000)}s at ${pool.active.length} instances`);
              return;
            }
          } else {
            stallMs = 0;
          }

          // RI/CI: sample one instance at 2 Hz, scale by instance count.
          // Raw formula inputs ride along for offline weight re-fitting.
          impactAge += dt;
          if (impactAge >= IMPACT_SAMPLE_MS && pool.active.length > 0) {
            const one = measureFrameImpactDetailed(pool.active[0].spine.skeleton);
            lastImpact = { ri: one.ri, ci: one.ci };
            lastInputs = one.inputs;
            impactAge = 0;
          }
          heapAge += dt;
          if (heapAge >= 1000) {
            const heap = heapSnapshot();
            lastHeapMb = heap.usedMb;
            heapAge = 0;
            // heap guard: bail before the OOM-killer does
            if (
              heap.usedMb != null &&
              heap.limitMb != null &&
              heap.usedMb > heap.limitMb * HEAP_ABORT_RATIO
            ) {
              finish(`heap at ${heap.usedMb}/${heap.limitMb} MB at ${pool.active.length} instances`);
              return;
            }
            // crash stash: if the browser dies anyway, the next visit
            // uploads this as a crash report
            saveStash({
              startedAt,
              updatedAt: new Date().toISOString(),
              clientVersion: CLIENT_VERSION,
              scenarioId: sc.id,
              scenarioIndex: index,
              scenarioCount: plan.length,
              elapsedMs: Math.round(runElapsed),
              instances: pool.active.length,
              fps: Math.round(rollingFps() * 10) / 10,
              heapMb: lastHeapMb,
              displayHz,
              cpuScoreStart,
              recentSeconds: recorder.recentPerSecond(30),
            });
          }
          const count = pool.active.length;
          recorder.tick(dt, count, {
            ri: lastImpact.ri * count,
            ci: lastImpact.ci * count,
            one: lastInputs,
            heapMb: lastHeapMb,
          });

          if (sc.kind === "ramp") {
            stepDts.push(dt);
            const boundary = (stepIdx + 1) * stepDur;
            if (elapsed >= boundary && stepIdx < sc.rampSteps!.length - 1) {
              recorder.closeStep(sc.rampSteps![stepIdx], stepDts);
              const stepFps = rollingFps();
              stepDts = [];
              if (!rampCapped && stepFps < RAMP_GATE_FPS) {
                // hold at the breaking point instead of marching into a
                // GPU hang - the remaining time keeps sampling this count
                rampCapped = true;
                recorder.markAborted(
                  `ramp capped at ${sc.rampSteps![stepIdx]} instances (${stepFps.toFixed(0)} fps < ${RAMP_GATE_FPS})`,
                );
              }
              if (!rampCapped) {
                stepIdx++;
                setInstanceCount(sc.spines[0], sc.rampSteps![stepIdx]);
              }
            }
          }

          if (sc.kind === "swarm") {
            swarmTimer += dt;
            if (swarmTimer >= 1000 && pool.active.length < SWARM_CAP) {
              swarmTimer = 0;
              if (rollingFps() >= SWARM_GATE_FPS) {
                addInstance(spineFor(swarmIdx++));
              }
            }
          }

          // hud at ~5 Hz
          recentDts.push(dt);
          if (recentDts.length > 30) recentDts.shift();
          lastHud += dt;
          if (lastHud >= 200) {
            lastHud = 0;
            const avg = recentDts.reduce((a, b) => a + b, 0) / recentDts.length;
            hooks.onHud({
              scenarioLabel: sc.label,
              scenarioIndex: index,
              scenarioCount: plan.length,
              elapsedMs: runElapsed,
              totalMs,
              fps: avg > 0 ? 1000 / avg : 0,
              instances: count,
            });
          }

          if (elapsed >= sc.durationMs) {
            finish(null);
          }
        };

        app.ticker.add(tickFn);
      });

    let runAbortReason: string | null = null;
    try {
      let consecutiveAborts = 0;
      for (let i = 0; i < plan.length; i++) {
        const aborted = await runScenario(plan[i], i);
        if (aborted) {
          consecutiveAborts++;
          if (consecutiveAborts >= 2) {
            // two hard aborts in a row: the device floor is found, more
            // scenarios would only risk the tab
            runAbortReason = `device floor reached: ${aborted}`;
            break;
          }
        } else {
          consecutiveAborts = 0;
        }
      }
      recorder.endScenario();

      // post-run probes: cpu drift = throttling, heap growth, battery burn
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
          ...(runAbortReason
            ? { aborted: true, abortReason: runAbortReason }
            : {}),
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
      clearInstances();
      void wakeLock?.release().catch(() => undefined);
      app?.destroy(true, { children: true });
      app = null;
    }
  })();

  return { result, cancel };
}
