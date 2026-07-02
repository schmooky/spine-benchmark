/**
 * Device-tier - a UX layer ON TOP of the open workload-cost measure. NOT part of the measure.
 *
 * `cost` is device-independent: one scene -> one number on any hardware (sum of fixed-weight*counter).
 * The tier boundary IS device-dependent: "how many cost units THIS device sustains before
 * the target fps drops". That is the `device` layer (like dropRate/p95), NOT in cost.
 *
 *   tier.ratio = cost / ceiling[device]        // <1 fits, >1 does not
 *
 * Boundary shape = FRACTIONS of ceiling: one per-device ceiling + shared fraction bands
 * ([0.5,0.8,1.0] -> light/medium/heavy/over). Bands are shared; per device you change
 * only the ceiling. The crawler does NOT do device-detection - the app picks `deviceKey`
 * (or passes an explicit `ceiling`); the lib only holds the numbers.
 *
 * NOTE: ceiling MUST be calibrated on real hardware: ramp a scene up through rising cost,
 * the point where dropRate crosses the threshold / p95 rafDelta > targetFrameMs -> that cost =
 * ceiling. That is `sweep.ts`, anchored on a REAL fps drop, NOT `saturate.ts` (which measures
 * absolute choke at ~100x workload - not a budget). The seed values below are a
 * PLACEHOLDER, not measured (same honesty as the WORKLOAD_WEIGHTS seed).
 *
 * NOTE: a single scalar ceiling is mix-dependent: two scenes of equal cost with different mix
 * stress different drivers (fill-heavy chokes the GPU, drawcall-heavy the CPU). The ceiling is
 * honest only within one content band - the same incompleteness as contentBias in gpuCost. For
 * CPU+GPU separately you need a second ceiling on gpuCost (not here).
 */

export interface DeviceCeiling {
  /** Key for config.deviceKey. */
  key: string;
  /** Human-readable label. */
  label: string;
  /** workload-cost ceiling (cpu/workload units) - max sustained before fps drops. */
  ceiling: number;
  /** gpu-cost ceiling (ms-equiv) - SEPARATE: CPU and GPU scale differently across devices
   *  (a Redmi's GPU is weaker relative to its CPU than an iPhone's). One scalar per axis. */
  gpuCeiling: number;
}

/** Ceiling field per measure axis: 'ceiling' (workload) / 'gpuCeiling' (gpu). */
export type CeilingField = "ceiling" | "gpuCeiling";

export const DEVICE_CEILINGS: Record<string, DeviceCeiling> = {
  "redmi-12": {
    key: "redmi-12",
    label: "Redmi 12",
    ceiling: 3.5,
    gpuCeiling: 2,
  },
  "iphone-15-pro-max": {
    key: "iphone-15-pro-max",
    label: "iPhone 15 Pro Max",
    ceiling: 22.2,
    gpuCeiling: 11,
  },
  "oneplus-pad": {
    key: "oneplus-pad",
    label: "OnePlus Pad",
    ceiling: 27,
    gpuCeiling: 13,
  },
  "macbook-pro": {
    key: "macbook-pro",
    label: "M3 Max",
    ceiling: 77.8,
    gpuCeiling: 13,
  },
};

/** Fractions of ceiling (asc), the upper bounds of the bands. Last = 1.0 (= ceiling = over). */
export const DEFAULT_TIER_BANDS: readonly number[] = [0.5, 0.8, 1.0];
/** Band labels; length = bands.length + 1 (the last is above the ceiling). */
export const DEFAULT_TIER_LABELS: readonly string[] = [
  "light",
  "medium",
  "heavy",
  "over",
];

export interface DeviceTier {
  /** From config.deviceKey if the ceiling came from the table (else undefined - explicit ceiling). */
  deviceKey?: string;
  /** The applied ceiling (cost units). */
  ceiling: number;
  /** cost / ceiling: <1 fits, >1 does not. */
  ratio: number;
  /** Band index 0..bands.length. */
  index: number;
  /** Band label (labels[index]). */
  label: string;
}

/** device-tier fields in config (optional - a tier appears iff a ceiling resolves). */
export interface DeviceTierConfig {
  /** Key in DEVICE_CEILINGS. Ignored if an explicit `ceiling` is set. */
  deviceKey?: string;
  /** Explicit ceiling (cost units) - overrides deviceKey. */
  ceiling?: number;
  /** Fraction bands (asc, in (0,inf)). Default DEFAULT_TIER_BANDS. */
  tierBands?: number[];
  /** Labels (length = bands+1). Default DEFAULT_TIER_LABELS. */
  tierLabels?: string[];
}

/** Resolves the ceiling: explicit ceiling > table[deviceKey][field]. undefined -> tier
 *  not computed. `field` picks the axis (workload 'ceiling' / gpu 'gpuCeiling'); an explicit
 *  cfg.ceiling is axis-agnostic (it is the ceiling for THIS measure in its own config). */
export function resolveCeiling(
  cfg: DeviceTierConfig | undefined,
  field: CeilingField = "ceiling"
): number | undefined {
  if (!cfg) return undefined;
  if (typeof cfg.ceiling === "number" && cfg.ceiling > 0) return cfg.ceiling;
  if (cfg.deviceKey) {
    const e = DEVICE_CEILINGS[cfg.deviceKey];
    if (e && e[field] > 0) return e[field];
  }
  return undefined;
}

// Are bands+labels valid (asc in (0,inf), labels of length bands+1)? A bad config ->
// defaults (an app error must not mislabel or crash).
function validBandsLabels(bands: number[], labels: string[]): boolean {
  if (labels.length !== bands.length + 1) return false;
  let prev = 0;
  for (const b of bands) {
    if (!(b > prev)) return false; // not strictly increasing / <=0
    prev = b;
  }
  return true;
}

/** Tier from cost vs ceiling. ceiling is already resolved (>0). */
export function computeTier(
  cost: number,
  ceiling: number,
  cfg: DeviceTierConfig | undefined
): DeviceTier {
  let bands = cfg?.tierBands ?? (DEFAULT_TIER_BANDS as number[]);
  let labels = cfg?.tierLabels ?? (DEFAULT_TIER_LABELS as string[]);
  if (!validBandsLabels(bands, labels)) {
    bands = DEFAULT_TIER_BANDS as number[];
    labels = DEFAULT_TIER_LABELS as string[];
  }

  const ratio = cost / ceiling;
  // First band whose upper bound > ratio; none -> the last (over).
  let index = bands.findIndex((b) => ratio < b);
  if (index < 0) index = bands.length;
  const label = labels[index] ?? labels[labels.length - 1]!;

  const out: DeviceTier = {
    ceiling,
    ratio: +ratio.toFixed(3),
    index,
    label,
  };
  if (cfg?.deviceKey && !(typeof cfg.ceiling === "number" && cfg.ceiling > 0)) {
    out.deviceKey = cfg.deviceKey;
  }
  return out;
}
