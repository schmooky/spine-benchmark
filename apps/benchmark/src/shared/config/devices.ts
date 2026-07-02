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
}

/**
 * Frame-time budget target, ms, split GPU / CPU (thesis #6/#7). Replaces
 * "RI+CI units" and "fps < Hz": a scene is "over" when its predicted GPU or CPU
 * time exceeds this, independent of refresh rate. Overridable from the fitted
 * /api/model, but this is a sane default (half a 60fps frame each).
 */
export const DEFAULT_BUDGET_MS = { gpu: 8, cpu: 8 } as const;

export const DEVICES: DeviceProfile[] = [
  {
    id: "phone-low",
    name: "Budget phone",
    example: "Redmi 9A · Mali-G52",
    kind: "phone",
    capacity: 12,
    gpuFamily: "Mali",
  },
  {
    id: "phone-mid",
    name: "Mid-range phone",
    example: "iPhone 11 / Pixel 6a",
    kind: "phone",
    capacity: 22,
    gpuFamily: "Apple GPU",
  },
  {
    id: "phone-high",
    name: "Flagship phone",
    example: "iPhone 15 Pro class",
    kind: "phone",
    capacity: 40,
    gpuFamily: "Apple GPU",
  },
  {
    id: "tablet-low",
    name: "Entry tablet",
    example: "iPad 9th gen",
    kind: "tablet",
    capacity: 26,
    gpuFamily: "Apple GPU",
  },
  {
    id: "tablet-high",
    name: "Pro tablet",
    example: "iPad Pro M2",
    kind: "tablet",
    capacity: 55,
    gpuFamily: "Apple GPU",
  },
  {
    id: "desktop-low",
    name: "Office laptop",
    example: "integrated GPU",
    kind: "desktop",
    capacity: 45,
    gpuFamily: "Intel",
  },
  {
    id: "desktop-high",
    name: "Gaming desktop",
    example: "discrete GPU",
    kind: "desktop",
    capacity: 90,
    gpuFamily: "NVIDIA RTX",
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
