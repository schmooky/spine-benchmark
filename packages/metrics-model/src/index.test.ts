import { describe, it, expect } from "vitest";
import { solveRidge, fitQuality } from "./ridge.js";
import { fitAxis, type TrainingRow } from "./index.js";
import type { ImpactFeatures } from "@spine-benchmark/metrics-impact-formula";

const zero: ImpactFeatures = {
  vertices: 0, nonNormalBlends: 0, clippingMasks: 0, meshes: 0, weightedMeshes: 0,
  deformedMeshes: 0, ik: 0, transform: 0, path: 0, physics: 0, drawCallEst: 0,
  coveredKpx: 0, overdrawFactor: 0,
};

describe("ridge solver", () => {
  it("recovers a known linear relationship", () => {
    // y = 2 + 3*x0 + 0.5*x1
    const X = [[0, 0], [1, 0], [0, 2], [2, 1], [3, 3], [1, 4]];
    const y = X.map(([a, b]) => 2 + 3 * a + 0.5 * b);
    const beta = solveRidge(X, y, 1e-6);
    expect(beta[0]).toBeCloseTo(2, 1);
    expect(beta[1]).toBeCloseTo(3, 1);
    expect(beta[2]).toBeCloseTo(0.5, 1);
  });

  it("fitQuality reports R2=1 for a perfect fit", () => {
    const a = [1, 2, 3, 4];
    expect(fitQuality(a, a).r2).toBeCloseTo(1, 5);
    expect(fitQuality(a, a).mae).toBeCloseTo(0, 5);
  });
});

describe("fitAxis", () => {
  it("recovers per-feature ms coefficients from synthetic rows", () => {
    // gpuMs = 0.5 + 0.002*vertices + 0.01*coveredKpx  (single-axis: vary only these)
    const rows: TrainingRow[] = [];
    for (let i = 0; i < 40; i++) {
      const vertices = i * 50;
      const coveredKpx = (i % 8) * 30;
      rows.push({
        family: "test",
        features: { ...zero, vertices, coveredKpx },
        gpuMs: 0.5 + 0.002 * vertices + 0.01 * coveredKpx,
        cpuMs: null,
      });
    }
    const fit = fitAxis(rows, "gpuMs", "test", 1e-6);
    expect(fit).not.toBeNull();
    expect(fit!.r2).toBeGreaterThan(0.99);
    expect(fit!.model.weights.vertices).toBeCloseTo(0.002, 2);
    expect(fit!.model.weights.coveredKpx).toBeCloseTo(0.01, 2);
  });

  it("returns null when there are too few rows to fit", () => {
    expect(fitAxis([], "gpuMs", "test")).toBeNull();
  });
});
