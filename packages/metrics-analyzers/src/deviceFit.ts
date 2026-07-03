/**
 * Turns uploaded runs into a per-GPU-family cost model. The fleet spans ~4-16x
 * in capacity, so a single universal formula can't fit it; we cluster by GPU
 * family and fit each (thesis #9), with leave-one-family-out CV so the numbers
 * are trusted, not asserted.
 */
import {
  fitFleet,
  type FleetModel,
  type TrainingRow,
} from "@spine-benchmark/metrics-model";
import {
  predictCostMs,
  type ImpactFeatures,
  type LinearCostModel,
} from "@spine-benchmark/metrics-impact-formula";

/** First client version whose measurements are trusted by the fit.
 *
 * 0.5.0 = the measurement-audit remediation (2026-07-03). Everything below is
 * QUARANTINED: earlier captures were recorded with (a) ramp bisect steps
 * labeled with densities that were never on screen (grow-only spawnTo), (b)
 * GPU samples duplicated via carry-forward (fake ~100% gpuFrames coverage,
 * staleness-weighted percentiles), (c) skeleton re-parse spikes inside the
 * measured window on doubling steps, and (d) feature vectors that dropped all
 * non-mesh (region/sequence) vertices. Fitting on them launders those errors
 * into the model weights. */
export const MIN_FIT_VERSION = "0.5.0";

/** Semver-ish >= compare (major.minor.patch). */
export function isFittableVersion(clientVersion: string | null | undefined): boolean {
  if (!clientVersion) return false;
  const parse = (v: string) => v.split(".").map((n) => parseInt(n, 10) || 0);
  const a = parse(clientVersion);
  const b = parse(MIN_FIT_VERSION);
  for (let i = 0; i < 3; i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  }
  return true;
}

/** Normalize a WebGL `RENDERER` string to a coarse GPU family for clustering. */
export function gpuFamily(renderer: string | null | undefined): string {
  const r = (renderer ?? "").toLowerCase();
  if (!r) return "unknown";
  if (r.includes("apple")) return "Apple GPU";
  if (r.includes("adreno")) {
    const m = r.match(/adreno.*?(\d)\d\d/);
    return m ? `Adreno ${m[1]}xx` : "Adreno";
  }
  if (r.includes("mali")) {
    const m = r.match(/mali-?g?(\d+)/);
    return m ? `Mali-G${m[1]}` : "Mali";
  }
  if (r.includes("powervr")) return "PowerVR";
  if (r.includes("rtx")) return "NVIDIA RTX";
  if (r.includes("gtx")) return "NVIDIA GTX";
  if (r.includes("nvidia") || r.includes("geforce")) return "NVIDIA";
  if (r.includes("arc")) return "Intel Arc";
  if (r.includes("iris")) return "Intel Iris";
  if (r.includes("intel")) return "Intel";
  if (r.includes("radeon") || r.includes("amd")) return "AMD Radeon";
  return "unknown";
}

/** A per-second capture row carrying the per-INSTANCE feature vector + measured
 * cost (as recorded by the runner: gpuMs/cpuMs, instances). */
export interface CaptureRow {
  instances: number;
  features: ImpactFeatures;
  gpuMs: number | null;
  cpuMs: number | null;
  /** Total per-frame CPU (spine.update + render-side); the honest compute
   * target, preferred over cpuMs which undercounts Spine. */
  frameCpuMs?: number | null;
}

/** Build training rows: composite features = per-instance x instances, paired
 * with the measured composite ms for that second. */
export function toTrainingRows(family: string, rows: CaptureRow[]): TrainingRow[] {
  const out: TrainingRow[] = [];
  for (const row of rows) {
    if (row.instances <= 0) continue;
    const scaled = {} as ImpactFeatures;
    (Object.keys(row.features) as (keyof ImpactFeatures)[]).forEach((k) => {
      // overdrawFactor is intensive (per-pixel), not multiplied by count
      scaled[k] = k === "overdrawFactor" ? row.features[k] : row.features[k] * row.instances;
    });
    // CPU-axis target = frameCpuMs (honest compute), fallback to cpuMs.
    out.push({ features: scaled, gpuMs: row.gpuMs, cpuMs: row.frameCpuMs ?? row.cpuMs, family });
  }
  return out;
}

export interface DeviceFitResult {
  fleet: FleetModel;
  /** rows used, per family. */
  familyCounts: Record<string, number>;
}

/** Fit pooled + per-family models from grouped capture rows. */
export function fitDevices(byFamily: Record<string, CaptureRow[]>): DeviceFitResult {
  const rows: TrainingRow[] = [];
  const familyCounts: Record<string, number> = {};
  for (const [fam, capRows] of Object.entries(byFamily)) {
    const tr = toTrainingRows(fam, capRows);
    familyCounts[fam] = tr.length;
    rows.push(...tr);
  }
  return { fleet: fitFleet(rows), familyCounts };
}

/** The published coefficient table + per-device frame-time budgets (ms). */
export interface CoefficientTable {
  version: number;
  generatedAt: string;
  fleet: { gpu: LinearCostModel | null; cpu: LinearCostModel | null };
  byFamily: Record<string, { gpu: LinearCostModel | null; cpu: LinearCostModel | null }>;
  /** frame-time budget target, ms, split GPU/CPU (thesis #6). */
  budgetMs: { gpu: number; cpu: number };
  /** measured per-family frame ceiling (ms) so consumers can anchor "%" to the
   * real device capacity instead of the global default. */
  budgetByFamily?: Record<string, { gpu: number; cpu: number }>;
  quality: FleetModel["quality"];
  /** per-family fit quality - lets consumers (the fleet page) flag which
   * families are still poorly explained and need more/better data. */
  byFamilyQuality: FleetModel["byFamilyQuality"];
}

export function toCoefficientTable(
  fit: DeviceFitResult,
  budgetMs = { gpu: 8, cpu: 8 },
  budgetByFamily?: Record<string, { gpu: number; cpu: number }>,
): CoefficientTable {
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    fleet: { gpu: fit.fleet.gpu, cpu: fit.fleet.cpu },
    byFamily: fit.fleet.byFamily,
    budgetMs,
    ...(budgetByFamily ? { budgetByFamily } : {}),
    quality: fit.fleet.quality,
    byFamilyQuality: fit.fleet.byFamilyQuality,
  };
}

/** Predict GPU/CPU ms for a feature load on a given family, using the family
 * model if present else the pooled fleet model. */
export function predictForFamily(
  table: CoefficientTable,
  family: string,
  features: ImpactFeatures,
): { gpuMs: number; cpuMs: number; totalMs: number; usedFamily: string } {
  const fam = table.byFamily[family];
  const gpu = fam?.gpu ?? table.fleet.gpu ?? undefined;
  const cpu = fam?.cpu ?? table.fleet.cpu ?? undefined;
  const { gpuMs, cpuMs, totalMs } = predictCostMs(features, gpu, cpu);
  return { gpuMs, cpuMs, totalMs, usedFamily: fam ? family : "fleet" };
}
