/**
 * The current cost-model coefficient table served to clients (thesis #9). Starts
 * as the formula defaults; the offline fit (metrics-analyzers) POSTs a fitted
 * table (per-GPU-family weights + ms budgets) which then feeds every client's
 * budget meter. Kept in-process (small); persist later if needed.
 */
import {
  DEFAULT_CPU_COST_MODEL,
  DEFAULT_GPU_COST_MODEL,
  type LinearCostModel,
} from "@spine-benchmark/metrics-impact-formula";

export interface CoefficientTable {
  version: number;
  generatedAt: string;
  fleet: { gpu: LinearCostModel | null; cpu: LinearCostModel | null };
  byFamily: Record<string, { gpu: LinearCostModel | null; cpu: LinearCostModel | null }>;
  budgetMs: { gpu: number; cpu: number };
  /** measured per-family frame ceiling (ms); anchors the client meter's "%". */
  budgetByFamily?: Record<string, { gpu: number; cpu: number }>;
  quality?: unknown;
  /** per-family fit quality (r2/mae/n per axis), if published by a refit. */
  byFamilyQuality?: Record<
    string,
    {
      gpu: { r2: number; mae: number; n: number } | null;
      cpu: { r2: number; mae: number; n: number } | null;
    }
  >;
}

const DEFAULT_TABLE: CoefficientTable = {
  version: 1,
  generatedAt: new Date().toISOString(),
  fleet: { gpu: DEFAULT_GPU_COST_MODEL, cpu: DEFAULT_CPU_COST_MODEL },
  byFamily: {},
  budgetMs: { gpu: 8, cpu: 8 },
};

let current: CoefficientTable = DEFAULT_TABLE;

export function getModel(): CoefficientTable {
  return current;
}

export function setModel(table: CoefficientTable): void {
  current = table;
}
