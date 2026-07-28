/**
 * On-demand GPU/CPU cost measurement for a single Spine in the workbench.
 *
 * The live stage auto-renders (great for editing, useless for timing). This
 * runs a short, manually-driven burst: advance the skeleton, render it, and
 * read the TRUE GPU time via a timer query (vsync-independent) plus the CPU
 * time spent in spine.update. It's the same signal the bench-runner records,
 * so the workbench meter can show real ms instead of a formula guess.
 */
import { Application } from "pixi.js";
import type { Spine } from "@esotericsoftware/spine-pixi-v8";
import { GpuTimer, getGl2 } from "@spine-benchmark/gpu-timing";

export interface RenderCost {
  /** median true GPU render time (ms), or null when the timer query is absent. */
  gpuMs: number | null;
  /** median CPU spine-update time (ms). */
  cpuMs: number;
  frames: number;
  gpuSupported: boolean;
}

const median = (xs: number[]): number => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

/**
 * Measure `spine` in an offscreen Pixi app for ~`frames` frames. Offscreen +
 * manual render sidesteps vsync entirely. The spine is temporarily reparented;
 * it is returned to its original parent on completion.
 */
export async function measureRenderCost(
  spine: Spine,
  frames = 90,
): Promise<RenderCost> {
  const app = new Application();
  await app.init({ width: 1024, height: 1024, antialias: false, autoDensity: false });
  app.ticker.stop();
  const timer = new GpuTimer(getGl2(app.renderer));

  const prevParent = spine.parent;
  const prevAuto = spine.autoUpdate;
  spine.autoUpdate = false;
  app.stage.addChild(spine);

  const gpu: number[] = [];
  const cpu: number[] = [];
  try {
    for (let i = 0; i < frames; i++) {
      const t0 = performance.now();
      spine.update(1 / 60);
      cpu.push(performance.now() - t0);
      timer.begin();
      app.render();
      timer.end();
      timer.poll((ms) => gpu.push(ms));
      // let the GPU actually finish + queries resolve
      await new Promise((r) => requestAnimationFrame(() => r(null)));
    }
    // final drain
    for (let i = 0; i < 4; i++) {
      timer.poll((ms) => gpu.push(ms));
      await new Promise((r) => requestAnimationFrame(() => r(null)));
    }
  } finally {
    if (prevParent) prevParent.addChild(spine);
    spine.autoUpdate = prevAuto;
    timer.dispose();
    app.destroy(true);
  }

  return {
    gpuMs: timer.supported && gpu.length ? median(gpu) : null,
    cpuMs: median(cpu),
    frames,
    gpuSupported: timer.supported,
  };
}
