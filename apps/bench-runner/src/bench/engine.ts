import { Application, Assets } from "pixi.js";
import { Spine } from "@esotericsoftware/spine-pixi-v8";

import type { BenchResult } from "@/types";
import { Recorder } from "./recorder";
import { measureFrameImpact } from "./impact";
import { loadManifest, buildPlan, type Manifest, type Scenario } from "./plan";

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

    app = new Application();
    await app.init({
      background: 0x161616,
      resizeTo: window,
      antialias: false,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
    });
    if (cancelled) {
      app.destroy(true);
      throw new BenchCancelled();
    }
    host.appendChild(app.canvas);

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
    const onVisibility = () => {
      if (document.hidden) {
        hiddenAt = performance.now();
      } else if (hiddenAt != null) {
        recorder.hiddenMs += performance.now() - hiddenAt;
        hiddenAt = null;
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
      const W = app.renderer.width / app.renderer.resolution;
      const H = app.renderer.height / app.renderer.resolution;
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

    const runScenario = (sc: Scenario, index: number) =>
      new Promise<void>((resolve, reject) => {
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
        let swarmTimer = 0;
        let swarmIdx = 0;
        let impactAge = Infinity;
        let lastImpact = { ri: 0, ci: 0 };
        const stepDur = sc.rampSteps
          ? sc.durationMs / sc.rampSteps.length
          : Infinity;

        const tickFn = () => {
          if (!app) return;
          if (cancelled) {
            app.ticker.remove(tickFn);
            reject(new BenchCancelled());
            return;
          }
          const dt = app.ticker.deltaMS;
          elapsed += dt;
          runElapsed += dt;

          // RI/CI: sample one instance at 2 Hz, scale by instance count
          impactAge += dt;
          if (impactAge >= IMPACT_SAMPLE_MS && pool.active.length > 0) {
            const one = measureFrameImpact(pool.active[0].spine.skeleton);
            lastImpact = { ri: one.ri, ci: one.ci };
            impactAge = 0;
          }
          const count = pool.active.length;
          recorder.tick(dt, count, lastImpact.ri * count, lastImpact.ci * count);

          if (sc.kind === "ramp") {
            stepDts.push(dt);
            const boundary = (stepIdx + 1) * stepDur;
            if (elapsed >= boundary && stepIdx < sc.rampSteps!.length - 1) {
              recorder.closeStep(sc.rampSteps![stepIdx], stepDts);
              stepDts = [];
              stepIdx++;
              setInstanceCount(sc.spines[0], sc.rampSteps![stepIdx]);
            }
          }

          if (sc.kind === "swarm") {
            swarmTimer += dt;
            if (swarmTimer >= 1000 && pool.active.length < SWARM_CAP) {
              swarmTimer = 0;
              addInstance(spineFor(swarmIdx++));
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
            if (sc.kind === "ramp" && stepDts.length > 0) {
              recorder.closeStep(sc.rampSteps![stepIdx], stepDts);
            }
            app.ticker.remove(tickFn);
            resolve();
          }
        };

        app.ticker.add(tickFn);
      });

    try {
      for (let i = 0; i < plan.length; i++) {
        await runScenario(plan[i], i);
      }
      recorder.endScenario();
      return recorder.finalize(totalSeconds < 120);
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
