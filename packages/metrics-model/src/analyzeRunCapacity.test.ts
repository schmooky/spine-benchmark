import { describe, it, expect } from "vitest";
import {
  analyzeRunCapacity,
  type CapacityRow,
  type CapacityScenarioMeta,
} from "./analyzeRunCapacity.js";

// Ground-truth per-unit costs the synthetic device "obeys":
const RI_UNIT = 0.004; // ms per RI unit
const CI_UNIT = 0.01; // ms per CI unit
const HZ = 60;
const VSYNC = 1000 / HZ; // 16.667 ms

/**
 * One scenario's ramp. Each instance costs perInstMs = RI_UNIT*riPer +
 * CI_UNIT*ciPer; frame time floors at the vsync period, so fps only drops once
 * the work exceeds one frame. gpuMs carries the true work when the timer is on.
 */
function scenario(
  id: string,
  riPer: number,
  ciPer: number,
  instances: number[],
  gpuTimer: boolean,
): CapacityRow[] {
  const perInstMs = RI_UNIT * riPer + CI_UNIT * ciPer;
  return instances.map((n) => {
    const work = perInstMs * n;
    const frameMs = Math.max(VSYNC, work);
    return {
      scenarioId: id,
      instances: n,
      fps: Math.round((1000 / frameMs) * 10) / 10,
      frameMsP95: Math.round(frameMs * 100) / 100,
      ri: riPer * n,
      ci: ciPer * n,
      one: { coveredKpx: riPer, physics: ciPer },
      gpuMs: gpuTimer ? Math.round(work * 100) / 100 : null,
      cpuMs: null,
    };
  });
}

const META: CapacityScenarioMeta[] = [
  { id: "calib-fill-heavy", label: "Calibration RI-heavy" },
  { id: "calib-compute-heavy", label: "Calibration CI-heavy" },
  { id: "game-a--stress", label: "Game A / base" },
  { id: "game-b--stress", label: "Game B / base" },
  { id: "game-c--stress", label: "Game C / base" },
];

function build(gpuTimer: boolean, extendedRamps = false): CapacityRow[] {
  const fillN = extendedRamps ? [32, 64, 128, 256] : [8, 16, 32, 64];
  const compN = extendedRamps ? [32, 64, 128, 256] : [8, 16, 32, 64];
  const gameN = extendedRamps ? [64, 96, 128, 160, 192, 256] : [8, 16, 32, 64, 128, 192];
  const gameNb = extendedRamps ? [48, 64, 96, 128, 160, 192] : [8, 16, 32, 48, 64, 96];
  return [
    ...scenario("calib-fill-heavy", 50, 0, fillN, gpuTimer),
    ...scenario("calib-compute-heavy", 0, 20, compN, gpuTimer),
    ...scenario("game-a--stress", 30, 10, gameN, gpuTimer),
    ...scenario("game-b--stress", 10, 30, gameNb, gpuTimer),
    ...scenario("game-c--stress", 20, 20, gameNb, gpuTimer),
  ];
}

describe("analyzeRunCapacity - GPU timer path", () => {
  const report = analyzeRunCapacity({
    perSecond: build(true),
    scenarios: META,
    displayHz: HZ,
    gpuTimerSupported: true,
  });

  it("recovers per-unit RI and CI cost from the primitives", () => {
    expect(report.perUnit.riUnitMs).not.toBeNull();
    expect(report.perUnit.ciUnitMs).not.toBeNull();
    expect(report.perUnit.riUnitMs!).toBeCloseTo(RI_UNIT, 3);
    expect(report.perUnit.ciUnitMs!).toBeCloseTo(CI_UNIT, 3);
  });

  it("derives ceiling units from the budget and per-unit cost", () => {
    expect(report.ceilingBudgetMs).toBeCloseTo(VSYNC, 2);
    expect(report.ceilingUnits.ri!).toBeCloseTo(VSYNC / RI_UNIT, 0);
    expect(report.ceilingUnits.ci!).toBeCloseTo(VSYNC / CI_UNIT, 0);
  });

  it("predicts real-scene breaking points close to the measured knee", () => {
    expect(report.knees.medianErrPct).not.toBeNull();
    expect(report.knees.medianErrPct!).toBeLessThan(20);
    // every scene should have both a measured and predicted knee
    for (const s of report.knees.scenes) {
      expect(s.measured).not.toBeNull();
      expect(s.predicted).not.toBeNull();
    }
  });

  it("fits the full feature vector to true GPU ms with high R2", () => {
    expect(report.fit.gpu).not.toBeNull();
    expect(report.fit.gpu!.r2).toBeGreaterThan(0.9);
    expect(report.fit.combined).toBeNull(); // timer present -> no fallback fit
  });

  it("reports the binding axis and a capacity statement for the mean scene", () => {
    // mean scene RI=20, CI=20 -> CI load (0.01*20) beats RI load (0.004*20)
    expect(report.binding).toBe("ci");
    expect(report.capacity).not.toBeNull();
    expect(report.capacity!.maxConcurrent!).toBeCloseTo(VSYNC / 0.28, -1);
    expect(report.gpuTimerAvailable).toBe(true);
  });

  it("gives a 'good' verdict when RI/CI predict well", () => {
    expect(report.verdict).toBe("good");
  });
});

describe("analyzeRunCapacity - no GPU timer path (Safari/iOS)", () => {
  const report = analyzeRunCapacity({
    perSecond: build(false, true),
    scenarios: META,
    displayHz: HZ,
    gpuTimerSupported: false,
  });

  it("flags the missing timer and uses the frame-time fallback", () => {
    expect(report.gpuTimerAvailable).toBe(false);
    expect(report.note.toLowerCase()).toContain("no gpu timer");
    expect(report.fit.gpu).toBeNull();
    expect(report.fit.combined).not.toBeNull();
    expect(report.fit.combined!.r2).toBeGreaterThan(0.8);
  });

  it("still recovers per-unit cost from the frame-time slope", () => {
    expect(report.perUnit.riUnitMs).not.toBeNull();
    expect(report.perUnit.riUnitMs!).toBeCloseTo(RI_UNIT, 2);
    expect(report.perUnit.ciUnitMs!).toBeCloseTo(CI_UNIT, 2);
  });

  it("still measures real-scene knees from fps and validates", () => {
    expect(report.knees.medianErrPct).not.toBeNull();
    expect(["good", "marginal"]).toContain(report.verdict);
  });
});

describe("analyzeRunCapacity - degenerate input", () => {
  it("returns 'insufficient' with no ramp data", () => {
    const report = analyzeRunCapacity({ perSecond: [], scenarios: [], displayHz: 60 });
    expect(report.verdict).toBe("insufficient");
    expect(report.perUnit.riUnitMs).toBeNull();
    expect(report.capacity).toBeNull();
  });
});
