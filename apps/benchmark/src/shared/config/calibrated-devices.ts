/**
 * The REAL devices we benchmarked, loaded from the measured calibration
 * (packages/metrics-analyzers/data -> bundled copy here). Each carries an OLS
 * model refit against its own measured frameCpuMs, so the workbench can show a
 * real predicted ms per device instead of a wall of "uncalibrated".
 *
 * Honest scope: CPU compute only (no in-browser GPU timer); the number is
 * predicted at the model's held-out error band. Untrusted devices (pre-clamp
 * runs, or held-out error over the ceiling) are kept but flagged - for those the
 * locally-measured ms is the number to trust.
 */
import {
  predictDeviceMs,
  type CalFeatureInputs,
  type DeviceCalibration,
  type DeviceCalModel,
} from "@spine-benchmark/metrics-analyzers";
import type { ImpactFeatures } from "@spine-benchmark/metrics-impact-formula";

import raw from "./device-calibration.json";

export const CALIBRATION = raw as unknown as DeviceCalibration;

/** Prettier labels for the raw runner device strings we recognise. */
const FRIENDLY: Record<string, string> = {
  "TECNO AD8 (Mali-G710 MC10)": "TECNO Phantom X2",
  "SM-A155F (ARM, Mali-G57 MC2, OpenGL ES 3.2)": "Samsung Galaxy A15",
  "SM-S921B (Samsung Xclipse 940) on Vulkan 1.3.231)": "Samsung Galaxy S24",
  "RMX3760 (Mali-G57)": "Realme (RMX3760)",
};

export interface CalibratedDevice {
  /** exact runner label - the calibration key. */
  label: string;
  /** short name for the UI. */
  name: string;
  gpu: string;
  model: DeviceCalModel;
  trusted: boolean;
  /** held-out MAPE as a 0..1 fraction, or null. */
  errorBand: number | null;
}

function gpuOf(label: string): string {
  const m = label.match(/\(([^)]*)\)/);
  return m ? m[1] : "";
}
function nameOf(label: string): string {
  return FRIENDLY[label] ?? label.replace(/\s*\(.*$/, "").trim();
}

/** All benchmarked devices, trusted first, then by tightest error band. */
export const CALIBRATED_DEVICES: CalibratedDevice[] = CALIBRATION.devices
  .map((m) => ({
    label: m.deviceLabel,
    name: nameOf(m.deviceLabel),
    gpu: gpuOf(m.deviceLabel),
    model: m,
    trusted: m.trusted,
    errorBand: m.heldOutMape,
  }))
  .sort(
    (a, b) =>
      Number(b.trusted) - Number(a.trusted) || (a.errorBand ?? 1) - (b.errorBand ?? 1),
  );

export const DEFAULT_DEVICE_LABEL =
  CALIBRATED_DEVICES.find((d) => d.trusted)?.label ?? CALIBRATED_DEVICES[0]?.label ?? "";

export function deviceByLabel(label: string): CalibratedDevice | undefined {
  return CALIBRATED_DEVICES.find((d) => d.label === label);
}

/** Map the workbench's live pose features to the calibration's inputs. */
export function toCalInputs(f: ImpactFeatures): CalFeatureInputs {
  return {
    vertices: f.vertices,
    deformedMeshes: f.deformedMeshes,
    weightedMeshes: f.weightedMeshes,
    coveredKpx: f.coveredKpx,
    drawCallEst: f.drawCallEst,
  };
}

/**
 * Predicted frameCpuMs for one spine on a device.
 * `instances` lets the animator ask "a full board of N of these" - the models
 * were fit on multi-spine scenes, so a board-scale N is the calibration's home
 * turf; a single spine (N=1) leans on the intercept and is rougher.
 */
export function predictMs(
  device: CalibratedDevice,
  features: ImpactFeatures,
  instances = 1,
): number {
  return predictDeviceMs(device.model, toCalInputs(features), instances);
}

// ── Device GROUPS (tiers) ──────────────────────────────────────────────
// Individual devices are noisy; a tier RANGE is the honest, shippable unit.
// NOT grouped by GPU family - the same GPU spans 2x compute across SoCs - but by
// measured performance class, which is what the animator actually targets.

function groupOf(label: string, gpu: string): string {
  if (/iphone|ipad|apple/i.test(label)) return "iPhone / iPad";
  if (/Mali-G57\b/i.test(gpu) || /Mali-G5[0-9]/i.test(gpu)) return "Budget Android";
  return "Flagship Android"; // Mali-G710/G715, Xclipse, Adreno 7xx/8xx
}

/**
 * The calibration was fit on multi-spine boards (~16-32 symbols), so its
 * intercept is a BOARD's fixed frame overhead. Predicting a single spine leans
 * on that intercept and mis-orders devices; predicting a board is its home turf
 * and orders correctly (Budget ~2x Flagship). This is the representative board
 * the meter estimates - a typical slot grid.
 */
export const BOARD_SIZE = 20;

export interface DeviceGroup {
  name: string;
  devices: CalibratedDevice[];
}

/** Groups in a sensible display order, each with its member devices. */
export const DEVICE_GROUPS: DeviceGroup[] = (() => {
  const order = ["iPhone / iPad", "Flagship Android", "Budget Android"];
  const byName = new Map<string, CalibratedDevice[]>();
  for (const d of CALIBRATED_DEVICES) {
    const g = groupOf(d.label, d.gpu);
    (byName.get(g) ?? byName.set(g, []).get(g)!).push(d);
  }
  return order
    .filter((n) => byName.has(n))
    .map((name) => ({ name, devices: byName.get(name)! }));
})();

export interface GroupPrediction {
  name: string;
  /** predicted frameCpuMs range across the group's TRUSTED devices. */
  minMs: number;
  maxMs: number;
  /** typical held-out model error across the group (0..1), or null. */
  band: number | null;
  /** how many trusted devices back this. 0 = no clean calibration yet. */
  trustedCount: number;
  deviceCount: number;
}

/**
 * Predict this spine's per-frame CPU cost as a RANGE across each device tier.
 * Uses only trusted devices; the range is the real device spread, and `band`
 * is the models' held-out error to widen it by. This is the "goes live with
 * +/- some ms" number.
 */
export function predictGroups(features: ImpactFeatures, instances = 1): GroupPrediction[] {
  const inputs = toCalInputs(features);
  return DEVICE_GROUPS.map((g) => {
    const trusted = g.devices.filter((d) => d.trusted);
    const preds = trusted.map((d) => predictDeviceMs(d.model, inputs, instances));
    const bands = trusted.map((d) => d.errorBand).filter((b): b is number => b != null);
    return {
      name: g.name,
      minMs: preds.length ? Math.min(...preds) : 0,
      maxMs: preds.length ? Math.max(...preds) : 0,
      band: bands.length ? bands.reduce((a, b) => a + b, 0) / bands.length : null,
      trustedCount: trusted.length,
      deviceCount: g.devices.length,
    };
  });
}
