import { describe, expect, it } from "vitest";

import {
  MIN_FAMILY_ROWS,
  fitDevices,
  predictForFamily,
  sweepPins,
  toCoefficientTable,
  toDesignFeatures,
  toTrainingRows,
  type CaptureRow,
  type SweepPoint,
} from "./deviceFit.js";
import { FEATURE_KEYS, type ImpactFeatures } from "@spine-benchmark/metrics-impact-formula";

function features(overrides: Partial<ImpactFeatures> = {}): ImpactFeatures {
  const f = {} as ImpactFeatures;
  for (const k of FEATURE_KEYS) f[k] = 0;
  return { ...f, ...overrides };
}

describe("toTrainingRows - compute (CPU) axis target", () => {
  it("uses frameCpuMs as the cpuMs target when present (honest compute)", () => {
    const rows: CaptureRow[] = [
      { instances: 1, features: features({ vertices: 10 }), gpuMs: 2, cpuMs: 5, frameCpuMs: 25 },
    ];
    const [tr] = toTrainingRows("device", rows);
    expect(tr.cpuMs).toBe(25); // frameCpuMs, NOT the undercounted cpuMs (5)
    expect(tr.gpuMs).toBe(2);
  });

  it("falls back to cpuMs for pre-0.4.1 rows without frameCpuMs", () => {
    const rows: CaptureRow[] = [
      { instances: 1, features: features(), gpuMs: 2, cpuMs: 5 },
    ];
    const [tr] = toTrainingRows("device", rows);
    expect(tr.cpuMs).toBe(5);
  });

  it("folds coverage into painted kpx (coveredKpx x overdraw) and scales by instances", () => {
    const rows: CaptureRow[] = [
      {
        instances: 4,
        features: features({ vertices: 10, coveredKpx: 5, overdrawFactor: 3 }),
        gpuMs: 1,
        cpuMs: 1,
        frameCpuMs: 8,
      },
    ];
    const [tr] = toTrainingRows("device", rows);
    expect(tr.features.vertices).toBe(40); // x instances
    expect(tr.features.coveredKpx).toBe(60); // 5 kpx x 3 layers x 4 instances
    expect(tr.features.overdrawFactor).toBe(0); // folded into coveredKpx
    expect(tr.cpuMs).toBe(8);
  });
});

describe("sweepPins - stage 1", () => {
  const fillSweep = (msPerPx: number): SweepPoint[] =>
    [1, 2, 4, 8, 16].map((n) => ({
      driver: "fill",
      driverValue: n * 100_000,
      gpuMs: 0.4 + n * 100_000 * msPerPx, // fixed overhead + linear cost
      cpuMs: 1,
    }));

  it("recovers the fill slope as ms-per-kpx, discarding the base overhead", () => {
    const pins = sweepPins(fillSweep(2e-6));
    expect(pins.gpu?.coveredKpx).toBeCloseTo(2e-6 * 1000, 6);
  });

  it("maps the vertex sweep from indices to pose vertices (x1.5)", () => {
    const pts: SweepPoint[] = [64, 256, 1024, 4096].map((n) => ({
      driver: "vertices",
      driverValue: n * 6,
      gpuMs: 0.2 + n * 6 * 1e-5,
      cpuMs: 1,
    }));
    const pins = sweepPins(pts);
    expect(pins.gpu?.vertices).toBeCloseTo(1e-5 * 1.5, 8);
  });

  it("does not pin from stencil-mask sweeps (spine clipping is CPU-side)", () => {
    const pts: SweepPoint[] = [1, 2, 4].map((n) => ({
      driver: "stencilMasks",
      driverValue: n,
      gpuMs: n * 0.5,
      cpuMs: 1,
    }));
    expect(sweepPins(pts)).toEqual({});
  });

  it("ignores no-timer sweeps (all gpuMs null)", () => {
    const pts: SweepPoint[] = [1, 2, 4].map((n) => ({
      driver: "fill",
      driverValue: n * 1000,
      gpuMs: null,
      cpuMs: 1,
    }));
    expect(sweepPins(pts)).toEqual({});
  });
});

/** Synthetic device: gpuMs = 3e-3/kpx painted + 2e-4/vertex + 1.2ms scene
 * overhead; cpuMs = 5e-4/vertex + 0.03/mesh + 0.8ms overhead. */
function syntheticRows(n: number, noise = 0): CaptureRow[] {
  const rows: CaptureRow[] = [];
  for (let i = 0; i < n; i++) {
    const instances = 1 + (i % 32);
    const vertices = 50 + (i % 7) * 30;
    const coveredKpx = 20 + (i % 5) * 15;
    const overdrawFactor = 1 + (i % 3);
    const meshes = 2 + (i % 4);
    const painted = coveredKpx * overdrawFactor;
    const jitter = noise ? Math.sin(i * 12.9898) * noise : 0;
    rows.push({
      instances,
      features: features({ vertices, coveredKpx, overdrawFactor, meshes }),
      gpuMs: 1.2 + instances * (painted * 3e-3 + vertices * 2e-4) + jitter,
      cpuMs: null,
      frameCpuMs: 0.8 + instances * (vertices * 5e-4 + meshes * 0.03) + jitter,
    });
  }
  return rows;
}

describe("two-stage fit + registry", () => {
  it("publishes MARGINAL models: scene overhead lands in sceneOverheadMs, not the intercept", () => {
    const fit = fitDevices({ "Test GPU": syntheticRows(120) });
    const table = toCoefficientTable(fit);
    const fam = table.byFamily["Test GPU"];
    expect(fam?.gpu?.intercept).toBe(0);
    expect(fam?.cpu?.intercept).toBe(0);
    expect(table.sceneOverheadMs?.byFamily["Test GPU"]?.gpu).toBeCloseTo(1.2, 1);
    expect(table.sceneOverheadMs?.byFamily["Test GPU"]?.cpu).toBeCloseTo(0.8, 1);
  });

  it("prediction is per-instance marginal cost with the design fold applied", () => {
    const fit = fitDevices({ "Test GPU": syntheticRows(120) });
    const table = toCoefficientTable(fit);
    const one = features({ vertices: 100, coveredKpx: 30, overdrawFactor: 2, meshes: 3 });
    const p = predictForFamily(table, "Test GPU", one);
    // truth: gpu = 30*2*3e-3 + 100*2e-4 = 0.2; cpu = 100*5e-4 + 3*0.03 = 0.14
    expect(p.usedFamily).toBe("Test GPU");
    expect(p.gpuMs).toBeCloseTo(0.2, 1);
    expect(p.cpuMs).toBeCloseTo(0.14, 1);
    expect(p.quality?.gpu?.r2).toBeGreaterThan(0.98);
  });

  it("sweep pins survive stage 2 with scale ~1 on consistent data", () => {
    const sweeps: Record<string, SweepPoint[]> = {
      "Test GPU": [1, 2, 4, 8, 16].map((n) => ({
        driver: "fill",
        driverValue: n * 100_000,
        gpuMs: 0.4 + n * 100 * 3e-3, // 3e-3 ms per kpx, same as the scenes
        cpuMs: null,
      })),
    };
    const fit = fitDevices({ "Test GPU": syntheticRows(120, 0.05) }, sweeps);
    expect(fit.sweepPinned).toContain("Test GPU");
    const table = toCoefficientTable(fit);
    const q = table.byFamilyQuality["Test GPU"]?.gpu;
    expect(q?.pinnedScale).toBeGreaterThan(0.7);
    expect(q?.pinnedScale).toBeLessThan(1.4);
    expect(table.byFamily["Test GPU"]?.gpu?.weights.coveredKpx).toBeCloseTo(3e-3, 3);
  });

  it("gates families with too few rows: they fall back to the fleet model", () => {
    const fit = fitDevices({
      "Big Family": syntheticRows(120),
      "Tiny Family": syntheticRows(MIN_FAMILY_ROWS - 10),
    });
    const table = toCoefficientTable(fit);
    expect(table.byFamily["Big Family"]).toBeDefined();
    expect(table.byFamily["Tiny Family"]).toBeUndefined();
    const p = predictForFamily(table, "Tiny Family", features({ vertices: 100 }));
    expect(p.usedFamily).toBe("fleet");
    expect(p.quality).not.toBeNull();
  });

  it("falls back to 'default' with null quality when nothing was fitted", () => {
    const table = toCoefficientTable(fitDevices({}));
    const p = predictForFamily(table, "Unknown GPU", features({ vertices: 100 }));
    expect(p.usedFamily).toBe("default");
    expect(p.quality).toBeNull();
  });
});

describe("toDesignFeatures", () => {
  it("is applied identically at fit and predict time (same fold)", () => {
    const f = features({ coveredKpx: 10, overdrawFactor: 4 });
    const d = toDesignFeatures(f);
    expect(d.coveredKpx).toBe(40);
    expect(d.overdrawFactor).toBe(0);
  });
});
