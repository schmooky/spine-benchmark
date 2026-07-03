import { describe, it, expect } from "vitest";
import { initRamp, rampStep, type RampConfig, type RampState } from "./ramp.js";

const CFG: RampConfig = {
  stressMax: 8192,
  sustainFps: 55, // 0.92 * 60
  ceilingBudgetMs: 16.67,
  maxBisects: 4,
  minGap: 4,
};

/** Drive the ramp against a "device" whose true sustain knee is `trueKnee`
 * (fps path): fps is 60 while count <= trueKnee, then falls off. Returns the
 * finished state. */
function runFps(trueKnee: number, cfg = CFG): RampState {
  let s = initRamp(4);
  for (let guard = 0; guard < 40 && s.phase !== "done"; guard++) {
    const n = s.next;
    // simple model: fps = 60 up to the knee, then ~ knee/n * 60 (inverse load)
    const fps = n <= trueKnee ? 60 : Math.max(5, (trueKnee / n) * 60);
    s = rampStep(s, { count: n, fps, gpuP95: null }, cfg);
  }
  return s;
}

describe("ramp controller (fps / no-timer path)", () => {
  it("doubles up to the knee then pins it by bisection", () => {
    const s = runFps(300);
    expect(s.phase).toBe("done");
    expect(s.sustainInstances).not.toBeNull();
    // within the tightened bracket of the true knee
    expect(Math.abs(s.sustainInstances! - 300) / 300).toBeLessThan(0.2);
  });

  it("pins a low knee", () => {
    const s = runFps(50);
    expect(s.sustainInstances!).toBeGreaterThan(30);
    expect(s.sustainInstances!).toBeLessThan(70);
  });

  it("reports the ceiling when the device never drops below refresh", () => {
    const s = runFps(1e9, { ...CFG, stressMax: 1024 });
    expect(s.phase).toBe("done");
    expect(s.sustainInstances).toBe(1024);
    expect(s.reason).toContain("safety ceiling");
  });

  it("bisection tightens the bracket vs plain doubling", () => {
    // plain doubling would only know the knee is in (256, 512]; bisection should
    // land much closer to 400.
    const s = runFps(400);
    expect(s.sustainInstances!).toBeGreaterThan(340);
    expect(s.sustainInstances!).toBeLessThan(460);
  });
});

describe("ramp controller (GPU-timer path)", () => {
  const cfg = { ...CFG };
  it("uses gpuP95 vs the frame budget to judge sustain", () => {
    // gpuP95 = 0.05 ms per instance -> crosses 16.67ms at ~333 instances
    let s = initRamp(4);
    for (let guard = 0; guard < 40 && s.phase !== "done"; guard++) {
      const n = s.next;
      s = rampStep(s, { count: n, fps: 60, gpuP95: 0.05 * n }, cfg);
    }
    expect(s.phase).toBe("done");
    expect(Math.abs(s.sustainInstances! - 333) / 333).toBeLessThan(0.2);
  });

  it("detects CPU-bound collapse even while the GPU stays under budget", () => {
    // Spine workloads are dominantly CPU-bound: gpuP95 flat at 2ms (healthy),
    // fps collapses past 300 instances. A gpu-only sustain check would double
    // to stressMax and never report a knee.
    let s = initRamp(4);
    for (let guard = 0; guard < 40 && s.phase !== "done"; guard++) {
      const n = s.next;
      const fps = n <= 300 ? 60 : Math.max(5, (300 / n) * 60);
      s = rampStep(s, { count: n, fps, gpuP95: 2 }, cfg);
    }
    expect(s.phase).toBe("done");
    expect(s.sustainInstances).not.toBeNull();
    expect(Math.abs(s.sustainInstances! - 300) / 300).toBeLessThan(0.2);
  });
});

describe("ramp controller (degenerate cases)", () => {
  it("reports NO knee (null) when the device fails at the minimum density", () => {
    // reporting the failed count as capacity would overstate it
    let s = initRamp(4);
    s = rampStep(s, { count: 4, fps: 12, gpuP95: null }, CFG);
    expect(s.phase).toBe("done");
    expect(s.sustainInstances).toBeNull();
    expect(s.collapseInstances).toBe(4);
    expect(s.reason).toContain("minimum tested density");
  });
});
