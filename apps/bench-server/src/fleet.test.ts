import { describe, expect, it } from "vitest";

import { buildFleet } from "./fleet.js";
import type { RunDeviceItem } from "./db.js";

interface RunOpts {
  device: Record<string, unknown>;
  id?: string;
  createdAt?: string;
  clientVersion?: string;
  avgFps?: number;
}

function run(opts: RunOpts): RunDeviceItem {
  return {
    id: opts.id ?? Math.random().toString(36).slice(2),
    createdAt: opts.createdAt ?? "2026-07-01T00:00:00.000Z",
    clientVersion: opts.clientVersion ?? "0.3.1",
    avgFps: opts.avgFps ?? 60,
    device: opts.device as unknown as RunDeviceItem["device"],
    captureKey: null,
  };
}

const iphone = {
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X)",
  platform: "iPhone",
  uaModel: "iPhone15,3",
  maxTouchPoints: 5,
  media: { pointerCoarse: true, hoverNone: true },
  screen: { width: 393, height: 852, dpr: 3 },
  gpu: { renderer: "Apple GPU" },
  label: "iPhone (Apple GPU)",
};

const pixel = {
  userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 7)",
  platform: "Linux armv8l",
  mobile: true,
  uaModel: "Pixel 7",
  maxTouchPoints: 5,
  media: { pointerCoarse: true, hoverNone: true },
  screen: { width: 412, height: 915, dpr: 2.6 },
  gpu: { renderer: "Mali-G710" },
  label: "Pixel 7 (Mali-G710)",
};

const windowsPc = {
  userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
  platform: "Win32",
  mobile: false,
  formFactor: "Desktop",
  maxTouchPoints: 0,
  media: { pointerCoarse: false, hoverNone: false },
  screen: { width: 2560, height: 1440, dpr: 1 },
  gpu: { renderer: "ANGLE (NVIDIA, NVIDIA GeForce RTX 3060)" },
  label: "Windows (RTX 3060)",
};

describe("buildFleet", () => {
  it("groups portables by family and excludes desktops", () => {
    const f = buildFleet([
      run({ device: iphone, avgFps: 60 }),
      run({ device: iphone, avgFps: 58 }),
      run({ device: pixel, avgFps: 55 }),
      run({ device: windowsPc }), // excluded
    ]);

    expect(f.totalRuns).toBe(4);
    expect(f.portableRuns).toBe(3);
    expect(f.excludedDesktopRuns).toBe(1);
    expect(f.families.map((x) => x.family)).toEqual(["iPhone", "Google Pixel"]);

    const ip = f.families.find((x) => x.family === "iPhone")!;
    expect(ip.runs).toBe(2);
    expect(ip.fittableRuns).toBe(2);
    expect(ip.medianAvgFps).toBe(59);
    expect(ip.gpuFamilies).toEqual(["Apple GPU"]);
    expect(ip.models[0]).toEqual({ model: "iPhone15,3", runs: 2 });
  });

  it("counts legacy (pre-0.3.0) runs as portable but not fittable", () => {
    const f = buildFleet([run({ device: pixel, clientVersion: "0.2.0" })]);
    expect(f.families[0]!.runs).toBe(1);
    expect(f.families[0]!.fittableRuns).toBe(0);
  });

  it("handles an empty fleet", () => {
    const f = buildFleet([]);
    expect(f.portableRuns).toBe(0);
    expect(f.families).toEqual([]);
  });
});
