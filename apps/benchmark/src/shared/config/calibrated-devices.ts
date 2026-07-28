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
  sceneTotalFeatures,
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

/**
 * MARGINAL cost of adding one more of this spine - the model's content terms
 * with the intercept dropped. This is the number that composes: N copies cost
 * N x marginal, on top of the scene's fixed overhead. It is also the honest
 * per-spine figure, since the intercept is a whole BOARD's frame overhead and
 * charging it to a single symbol is what made single-spine estimates mis-order
 * devices. Typically well under 1ms for one idle symbol.
 */
export function predictMarginalMs(
  device: CalibratedDevice,
  features: ImpactFeatures,
  instances = 1,
): number {
  const x = sceneTotalFeatures(toCalInputs(features), instances);
  let ms = 0;
  for (let i = 1; i < device.model.weights.length; i++) ms += device.model.weights[i] * (x[i] ?? 0);
  return Math.max(0, ms);
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
  /** ONE of this spine: marginal ms across the tier's trusted devices. Sub-ms
   * for a typical idle symbol - this is the number that composes. */
  perSpineMinMs: number;
  perSpineMaxMs: number;
  /** A whole board of BOARD_SIZE of them, including the scene's fixed frame
   * overhead - the "a few ms" figure. */
  boardMinMs: number;
  boardMaxMs: number;
  /** typical held-out model error across the group (0..1), or null. */
  band: number | null;
  /** how many trusted devices back this. 0 = no clean calibration yet. */
  trustedCount: number;
  deviceCount: number;
}

/**
 * Per-tier cost for this spine: the MARGINAL cost of one (sub-ms, additive)
 * and the total for a full board (a few ms, includes fixed frame overhead).
 * Only trusted devices count; `band` is the models' held-out error.
 */
export function predictGroups(features: ImpactFeatures): GroupPrediction[] {
  const inputs = toCalInputs(features);
  return DEVICE_GROUPS.map((g) => {
    const trusted = g.devices.filter((d) => d.trusted);
    const per = trusted.map((d) => predictMarginalMs(d, features, 1));
    const board = trusted.map((d) => predictDeviceMs(d.model, inputs, BOARD_SIZE));
    const bands = trusted.map((d) => d.errorBand).filter((b): b is number => b != null);
    return {
      name: g.name,
      perSpineMinMs: per.length ? Math.min(...per) : 0,
      perSpineMaxMs: per.length ? Math.max(...per) : 0,
      boardMinMs: board.length ? Math.min(...board) : 0,
      boardMaxMs: board.length ? Math.max(...board) : 0,
      band: bands.length ? bands.reduce((a, b) => a + b, 0) / bands.length : null,
      trustedCount: trusted.length,
      deviceCount: g.devices.length,
    };
  });
}
