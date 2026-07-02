/**
 * Predicts a frame's GPU and CPU cost in MILLISECONDS for a target device and
 * compares it to that device's ms budget (thesis #6/#7). Replaces "% of RI+CI
 * units". Uses the fitted per-GPU-family model when available (fetched from
 * /api/model), else the formula's default cost model.
 */
import {
  predictCostMs,
  type ImpactFeatures,
  type LinearCostModel,
} from "@spine-benchmark/metrics-impact-formula";
import { DEFAULT_BUDGET_MS, type DeviceProfile } from "@/shared/config/devices";

export interface CostModelTable {
  fleet: { gpu: LinearCostModel | null; cpu: LinearCostModel | null };
  byFamily: Record<string, { gpu: LinearCostModel | null; cpu: LinearCostModel | null }>;
  budgetMs: { gpu: number; cpu: number };
  /** measured per-family frame ceiling (ms); when present the meter anchors the
   * "%" to the real device capacity instead of the fixed default budget. */
  budgetByFamily?: Record<string, { gpu: number; cpu: number }>;
}

export type CostStatus = "ok" | "warn" | "over";

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
   *  callers can score a DIFFERENT ms value (e.g. the crawler's actually
   *  measured frame cost) against the same denominator. */
  budgetMs: { gpu: number; cpu: number };
}

/** Score an arbitrary (gpuMs, cpuMs) pair against a resolved budget - the
 *  same status/binding/pct logic predictDeviceCost uses, factored out so a
 *  REAL measured frame can be scored the same way as a predicted one. */
export function scoreAgainstBudget(
  gpuMs: number,
  cpuMs: number,
  budget: { gpu: number; cpu: number },
): Pick<DeviceCost, "gpuPct" | "cpuPct" | "binding" | "status"> {
  const gpuPct = gpuMs / budget.gpu;
  const cpuPct = cpuMs / budget.cpu;
  const worst = Math.max(gpuPct, cpuPct);
  return {
    gpuPct,
    cpuPct,
    binding: gpuPct >= cpuPct ? "gpu" : "cpu",
    status: worst > 1 ? "over" : worst > 0.8 ? "warn" : "ok",
  };
}

export function predictDeviceCost(
  features: ImpactFeatures,
  device: DeviceProfile,
  model?: CostModelTable,
): DeviceCost {
  const fam = model?.byFamily?.[device.gpuFamily];
  const gpu = fam?.gpu ?? model?.fleet.gpu ?? undefined;
  const cpu = fam?.cpu ?? model?.fleet.cpu ?? undefined;
  const { gpuMs, cpuMs } = predictCostMs(features, gpu, cpu);
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
  };
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
