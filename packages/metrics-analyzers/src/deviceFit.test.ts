import { describe, expect, it } from "vitest";

import { type CaptureRow, toTrainingRows } from "./deviceFit.js";
import { FEATURE_KEYS, type ImpactFeatures } from "@spine-benchmark/metrics-impact-formula";

function features(overrides: Partial<ImpactFeatures> = {}): ImpactFeatures {
  const f = {} as ImpactFeatures;
  for (const k of FEATURE_KEYS) f[k] = 0;
  return { ...f, ...overrides };
}

describe("toTrainingRows - compute (CPU) axis target", () => {
  it("uses frameCpuMs as the cpuMs target when present (honest compute)", () => {
    const rows: CaptureRow[] = [
      { instances: 1, features: features({ totalVertices: 10 }), gpuMs: 2, cpuMs: 5, frameCpuMs: 25 },
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

  it("scales count features by instances but keeps overdrawFactor intensive", () => {
    const rows: CaptureRow[] = [
      { instances: 4, features: features({ totalVertices: 10, overdrawFactor: 2 }), gpuMs: 1, cpuMs: 1, frameCpuMs: 8 },
    ];
    const [tr] = toTrainingRows("device", rows);
    expect(tr.features.totalVertices).toBe(40); // x instances
    expect(tr.features.overdrawFactor).toBe(2); // intensive, unscaled
    expect(tr.cpuMs).toBe(8);
  });
});
