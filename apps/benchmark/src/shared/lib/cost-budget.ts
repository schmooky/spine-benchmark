/**
 * Predicts a frame's GPU and CPU cost in MILLISECONDS for a target device and
 * compares it to that device's ms budget (thesis #6/#7). Uses the fitted
 * per-GPU-family model when available (fetched from /api/model), resolving
 * family -> pooled fleet -> placeholder defaults, and reports WHICH model
 * answered plus its fit quality - the trust layer of the meter: a prediction
 * without provenance and an error band is just a number wearing confidence.
 *
 * Features are folded into the model's design space (painted kpx =
 * coveredKpx x overdraw) via the canonical toDesignFeatures - the same fold
 * the fit applied to its training rows. Published fitted models are MARGINAL
 * (intercept 0): they price the spine itself, not the training scene's fixed
 * per-frame overhead.
 */
import {
  predictCostMs,
  toDesignFeatures,
  type ImpactFeatures,
  type LinearCostModel,
} from "@spine-benchmark/metrics-impact-formula";
import { DEFAULT_BUDGET_MS, type DeviceProfile } from "@/shared/config/devices";

export interface AxisQuality {
  r2: number;
  mae: number;
  /** mae relative to the mean target - the "+-N%" error band. */
  relMae?: number;
  n: number;
  /** stage-2 scale applied to sweep-pinned weights, when the family had them. */
  pinnedScale?: number;
}

export interface CostModelTable {
  fleet: { gpu: LinearCostModel | null; cpu: LinearCostModel | null };
  byFamily: Record<string, { gpu: LinearCostModel | null; cpu: LinearCostModel | null }>;
  budgetMs: { gpu: number; cpu: number };
  /** measured per-family frame ceiling (ms); when present the meter anchors the
   * "%" to the real device capacity instead of the fixed default budget. */
  budgetByFamily?: Record<string, { gpu: number; cpu: number }>;
  quality?: { gpu: AxisQuality | null; cpu: AxisQuality | null } | null;
  byFamilyQuality?: Record<string, { gpu: AxisQuality | null; cpu: AxisQuality | null }>;
  sweepPinned?: string[];
}

export type CostStatus = "ok" | "warn" | "over";

/** A model is a REAL fit only if it exists and isn't the seed placeholder. */
function isRealFit(m?: LinearCostModel | null): boolean {
  return !!m && m.fitFor !== "placeholder";
}

/** A fitted prediction is only trustworthy enough to show as an authoritative
 * number when its held-out error band is at or below this. Above it, the
 * number is a rough guess and must NOT be presented with a ms value, %, or
 * traffic-light colour - only the honestly-measured local cost may be. */
export const TRUST_RELMAE_MAX = 0.35;

/** Can we put an authoritative per-device ms in front of a person? Only when a
 * REAL fit exists (not the placeholder) AND its error band is tight. This is
 * the single gate for "truth people can rely on": everything else falls back
 * to the measured-on-this-machine number, clearly labelled as such. */
export function isCostTrusted(cost: Pick<DeviceCost, "source" | "quality">): boolean {
  if (cost.source === "default") return false;
  const q = cost.quality?.cpu ?? cost.quality?.gpu;
  return q?.relMae != null && q.relMae <= TRUST_RELMAE_MAX;
}

/** Where a prediction's weights came from - the provenance the meter shows. */
export type ModelSource = "family" | "fleet" | "default";

export interface DeviceCost {
  gpuMs: number;
  cpuMs: number;
  gpuPct: number;
  cpuPct: number;
  /** which axis is the binding constraint. */
  binding: "gpu" | "cpu";
  status: CostStatus;
  /** whether the % is anchored to a measured device ceiling or the default. */
  budgetSource: "measured" | "default";
  /** the resolved ms budget this prediction was scored against - exposed so
   *  callers can score a DIFFERENT ms value against the same denominator. */
  budgetMs: { gpu: number; cpu: number };
  /** provenance: which model answered (family fit / pooled fleet /
   * uncalibrated placeholder) and its fit quality when known. */
  source: ModelSource;
  quality: { gpu: AxisQuality | null; cpu: AxisQuality | null } | null;
}

/** Score an arbitrary (gpuMs, cpuMs) pair against a resolved budget - the
 *  same status/binding/pct logic predictDeviceCost uses, factored out so a
 *  REAL measured frame can be scored the same way as a predicted one.
 *
 *  `gpuMs: null` means "no GPU timer on this device" (not "0ms of GPU cost")
 *  - binding must never resolve to "gpu" in that case, even if cpuMs also
 *  happens to read 0 that sample (it otherwise would, since 0 >= 0). */
export function scoreAgainstBudget(
  gpuMs: number | null,
  cpuMs: number,
  budget: { gpu: number; cpu: number },
): Pick<DeviceCost, "gpuPct" | "cpuPct" | "binding" | "status"> {
  const gpuPct = gpuMs != null ? gpuMs / budget.gpu : 0;
  const cpuPct = cpuMs / budget.cpu;
  const worst = Math.max(gpuPct, cpuPct);
  return {
    gpuPct,
    cpuPct,
    binding: gpuMs != null && gpuPct >= cpuPct ? "gpu" : "cpu",
    status: worst > 1 ? "over" : worst > 0.8 ? "warn" : "ok",
  };
}

export function predictDeviceCost(
  features: ImpactFeatures,
  device: DeviceProfile,
  model?: CostModelTable,
): DeviceCost {
  const design = toDesignFeatures(features);
  const fam = model?.byFamily?.[device.gpuFamily];
  const gpu = fam?.gpu ?? model?.fleet.gpu ?? undefined;
  const cpu = fam?.cpu ?? model?.fleet.cpu ?? undefined;
  const { gpuMs, cpuMs } = predictCostMs(design, gpu, cpu);
  // A REAL fit is one that isn't the seed placeholder. Before any fleet data
  // exists the server serves DEFAULT_*_COST_MODEL (fitFor: "placeholder") - we
  // still predict with it so the meter shows a number, but it must report as
  // "uncalibrated", never masquerade as a "fleet fit".
  const source: ModelSource = fam
    ? "family"
    : isRealFit(model?.fleet.gpu) || isRealFit(model?.fleet.cpu)
      ? "fleet"
      : "default";
  const quality =
    source === "family"
      ? (model?.byFamilyQuality?.[device.gpuFamily] ?? null)
      : source === "fleet"
        ? (model?.quality ?? null)
        : null;
  // prefer the measured per-family ceiling (thesis: 100% = that device's frame
  // budget), else the published global budget, else the default.
  const famBudget = model?.budgetByFamily?.[device.gpuFamily];
  const budget = famBudget ?? model?.budgetMs ?? DEFAULT_BUDGET_MS;
  const scored = scoreAgainstBudget(gpuMs, cpuMs, budget);
  return {
    gpuMs,
    cpuMs,
    ...scored,
    budgetSource: famBudget ? "measured" : "default",
    budgetMs: budget,
    source,
    quality,
  };
}

/** Human line for the meter's provenance chip: what answered + how far to
 * trust it. "default" is the honest "uncalibrated" state. */
export function provenanceLabel(cost: Pick<DeviceCost, "source" | "quality">): string {
  if (cost.source === "default") return "uncalibrated estimate - no fleet fit yet";
  const q = cost.quality?.cpu ?? cost.quality?.gpu;
  const band = q?.relMae != null ? ` +-${Math.round(q.relMae * 100)}%` : "";
  const n = q?.n != null ? ` - ${q.n} samples` : "";
  return cost.source === "family" ? `family fit${band}${n}` : `fleet fit (no family data)${band}${n}`;
}

/** Fetch the fitted coefficient table; null on failure (callers fall back to
 * the formula defaults, which predictDeviceCost handles). */
export async function fetchCostModel(apiBase: string): Promise<CostModelTable | null> {
  try {
    const res = await fetch(`${apiBase}/api/model`, { headers: { accept: "application/json" } });
    if (!res.ok) return null;
    return (await res.json()) as CostModelTable;
  } catch {
    return null;
  }
}
