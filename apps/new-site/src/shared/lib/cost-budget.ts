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
  const budget = model?.budgetMs ?? DEFAULT_BUDGET_MS;
  const gpuPct = gpuMs / budget.gpu;
  const cpuPct = cpuMs / budget.cpu;
  const worst = Math.max(gpuPct, cpuPct);
  return {
    gpuMs,
    cpuMs,
    gpuPct,
    cpuPct,
    binding: gpuPct >= cpuPct ? "gpu" : "cpu",
    status: worst > 1 ? "over" : worst > 0.8 ? "warn" : "ok",
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
