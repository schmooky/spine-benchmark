import { Smartphone, Tablet, Monitor, type LucideIcon } from "lucide-react";

/**
 * Target-device profiles for the budget meter. `capacity` is the total
 * impact budget (RI + CI, in canonical @spine-benchmark/metrics-impact-formula
 * units) the device is assumed to sustain at full frame rate.
 *
 * Capacities are first-pass estimates from the formula's bracket guidance
 * (mobile very-high ~18, default ~25, desktop ~50) - they are placeholders
 * to be calibrated against real device measurements later.
 */

export type DeviceKind = "phone" | "tablet" | "desktop";

export interface DeviceProfile {
  id: string;
  name: string;
  /** Representative hardware, shown as the secondary line in the picker. */
  example: string;
  kind: DeviceKind;
  /** Legacy RI+CI budget in impact units (kept for the old meter). */
  capacity: number;
  /** GPU family key used to pick the fitted cost model (thesis #9). */
  gpuFamily: string;
  /** Typical framebuffer size in device px (portrait). GPU fill cost depends
   * on how many real pixels the skeleton rasterizes to on THAT device, so
   * coverage is normalized to this screen before prediction. */
  screenPx: { w: number; h: number };
}

/**
 * The stated on-screen size assumption behind every fill/GPU prediction: the
 * skeleton is assumed rendered at this fraction of the target device's screen
 * HEIGHT. Without a stated basis the GPU axis is meaningless - the same
 * skeleton is 4x the fill at 2x the size. Surfaced in the meter tooltip.
 */
export const ASSUMED_SCREEN_HEIGHT_FRACTION = 0.4;

/**
 * Frame-time budget target, ms, split GPU / CPU (thesis #6/#7). Replaces
 * "RI+CI units" and "fps < Hz": a scene is "over" when its predicted GPU or CPU
 * time exceeds this, independent of refresh rate. Overridable from the fitted
 * /api/model, but this is a sane default (half a 60fps frame each).
 */
export const DEFAULT_BUDGET_MS = { gpu: 8, cpu: 8 } as const;

export const DEVICES: DeviceProfile[] = [
  // gpuFamily MUST equal what deviceFit's gpuFamily() classifier emits for the
  // device's WebGL RENDERER, or the per-family fit never reaches this profile
  // (it falls back to the pooled fleet model). Keys below match the classifier
  // output exactly: "Apple GPU", "Mali-G57", "Adreno 7xx", "Samsung Xclipse 9xx".
  {
    id: "phone-mali",
    name: "Budget Android",
    example: "Redmi Note / Galaxy A · Mali-G57",
    kind: "phone",
    capacity: 12,
    gpuFamily: "Mali-G57",
    screenPx: { w: 1080, h: 2400 },
  },
  {
    id: "phone-mid",
    name: "Mid iPhone",
    example: "iPhone 11 / SE",
    kind: "phone",
    capacity: 22,
    gpuFamily: "Apple GPU",
    screenPx: { w: 1080, h: 2340 },
  },
  {
    id: "phone-high",
    name: "Flagship iPhone",
    example: "iPhone 15 Pro class",
    kind: "phone",
    capacity: 40,
    gpuFamily: "Apple GPU",
    screenPx: { w: 1179, h: 2556 },
  },
  {
    id: "phone-adreno",
    name: "Snapdragon flagship",
    example: "S24 US / Pixel 8 · Adreno 7xx",
    kind: "phone",
    capacity: 42,
    gpuFamily: "Adreno 7xx",
    screenPx: { w: 1080, h: 2400 },
  },
  {
    id: "phone-xclipse",
    name: "Galaxy S24 (Exynos)",
    example: "SM-S921B · Samsung Xclipse 940",
    kind: "phone",
    capacity: 40,
    gpuFamily: "Samsung Xclipse 9xx",
    screenPx: { w: 1080, h: 2340 },
  },
  {
    id: "tablet-low",
    name: "Entry tablet",
    example: "iPad 9th gen",
    kind: "tablet",
    capacity: 26,
    gpuFamily: "Apple GPU",
    screenPx: { w: 1620, h: 2160 },
  },
  {
    id: "tablet-high",
    name: "Pro tablet",
    example: "iPad Pro M2",
    kind: "tablet",
    capacity: 55,
    gpuFamily: "Apple GPU",
    screenPx: { w: 2048, h: 2732 },
  },
  {
    id: "desktop-low",
    name: "Office laptop",
    example: "integrated GPU",
    kind: "desktop",
    capacity: 45,
    gpuFamily: "Intel",
    screenPx: { w: 1920, h: 1080 },
  },
  {
    id: "desktop-high",
    name: "Gaming desktop",
    example: "discrete GPU",
    kind: "desktop",
    capacity: 90,
    gpuFamily: "NVIDIA RTX",
    screenPx: { w: 2560, h: 1440 },
  },
];

export const DEFAULT_DEVICE_ID = "phone-mid";

export function deviceById(id: string): DeviceProfile {
  return DEVICES.find((d) => d.id === id) ?? DEVICES[1];
}

export const DEVICE_KIND_ICON: Record<DeviceKind, LucideIcon> = {
  phone: Smartphone,
  tablet: Tablet,
  desktop: Monitor,
};

export const DEVICE_KIND_LABEL: Record<DeviceKind, string> = {
  phone: "Phones",
  tablet: "Tablets",
  desktop: "Desktops",
};

/**
 * The portable device families the budget meter targets. Desktop PCs are
 * deliberately excluded - the calibration study, and the "is this okay on the
 * devices players actually use" question, are about phones and tablets, where
 * the frame budget bites. Desktops have huge headroom and only dilute the view.
 */
export const PORTABLE_KINDS: DeviceKind[] = ["phone", "tablet"];

/** Traffic-light status of a budget fraction (impact / capacity). */
export type BudgetStatus = "ok" | "warn" | "over";

/** Below this fraction of capacity the device reads green. */
export const WARN_AT = 0.7;
/** At or above full capacity the device reads red. */
export const OVER_AT = 1.0;

export function budgetStatus(fraction: number): BudgetStatus {
  if (fraction >= OVER_AT) return "over";
  if (fraction >= WARN_AT) return "warn";
  return "ok";
}
