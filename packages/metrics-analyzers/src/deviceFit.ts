/**
 * Turns uploaded runs into a per-GPU-family cost model. The fleet spans ~4-16x
 * in capacity, so a single universal formula can't fit it; we cluster by GPU
 * family and fit each (thesis #9), with leave-one-family-out CV so the numbers
 * are trusted, not asserted.
 */
import {
  fitFleetTwoStage,
  type FamilyAxisQuality,
  type FleetModel,
  type PinnedWeights,
  type TrainingRow,
} from "@spine-benchmark/metrics-model";
import {
  predictCostMs,
  toDesignFeatures,
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

// The design-space fold (painted kpx) is part of the model contract and lives
// in the canonical formula package; re-exported here for existing consumers.
export { toDesignFeatures };

/** Build training rows: composite features = per-instance x instances, paired
 * with the measured composite ms for that second. */
export function toTrainingRows(family: string, rows: CaptureRow[]): TrainingRow[] {
  const out: TrainingRow[] = [];
  for (const row of rows) {
    if (row.instances <= 0) continue;
    const design = toDesignFeatures(row.features);
    const scaled = {} as ImpactFeatures;
    (Object.keys(design) as (keyof ImpactFeatures)[]).forEach((k) => {
      scaled[k] = design[k] * row.instances;
    });
    // CPU-axis target = frameCpuMs (honest compute), fallback to cpuMs.
    out.push({ features: scaled, gpuMs: row.gpuMs, cpuMs: row.frameCpuMs ?? row.cpuMs, family });
  }
  return out;
}

/** One isolation-sweep measurement: an analytic driver value paired with the
 * measured cost at that level (see bench-runner SweepReport). */
export interface SweepPoint {
  /** sweep driver id: "fill" | "vertices" | "stencilMasks" | ... */
  driver: string;
  driverValue: number;
  gpuMs: number | null;
  cpuMs: number | null;
}

/** ms-per-unit slope of (value, ms) pairs through least squares. The sweep's
 * base level carries the fixed frame overhead, so a free intercept is fit and
 * discarded - only the marginal slope pins a weight. */
function slopeOf(pairs: { v: number; ms: number }[]): number | null {
  if (pairs.length < 3) return null;
  const n = pairs.length;
  const mv = pairs.reduce((s, p) => s + p.v, 0) / n;
  const mm = pairs.reduce((s, p) => s + p.ms, 0) / n;
  let num = 0;
  let den = 0;
  for (const p of pairs) {
    num += (p.v - mv) * (p.ms - mm);
    den += (p.v - mv) * (p.v - mv);
  }
  if (den <= 0) return null;
  const slope = num / den;
  return slope > 0 ? slope : null;
}

/**
 * Stage 1: turn a family's sweep measurements into pinned per-driver weights
 * in FEATURE units (the design-space columns of the fit):
 *
 * - fill sweep: driverValue is shaded px; the design column is painted kpx
 *   (coveredKpx x overdraw), so weight = slope x 1000.
 * - vertex sweep: driverValue is INDICES (n rects x 6); the feature counts
 *   pose vertices (a quad = 4 verts = 6 indices), so weight ~ slope x 1.5.
 *   Stage 2's scale absorbs the approximation.
 *
 * The stencil-mask sweep is deliberately NOT mapped to clippingMasks: spine
 * clipping is CPU-side software clipping (SkeletonClipping), not a stencil
 * pass - that weight must come from scene regression.
 */
export function sweepPins(points: SweepPoint[]): { gpu?: PinnedWeights } {
  const gpu: PinnedWeights = {};
  const fill = slopeOf(
    points
      .filter((p) => p.driver === "fill" && p.gpuMs != null)
      .map((p) => ({ v: p.driverValue, ms: p.gpuMs as number })),
  );
  if (fill != null) gpu.coveredKpx = fill * 1000;
  const verts = slopeOf(
    points
      .filter((p) => p.driver === "vertices" && p.gpuMs != null)
      .map((p) => ({ v: p.driverValue, ms: p.gpuMs as number })),
  );
  if (verts != null) gpu.vertices = verts * 1.5;
  return Object.keys(gpu).length > 0 ? { gpu } : {};
}

export interface DeviceFitResult {
  fleet: FleetModel;
  /** rows used, per family. */
  familyCounts: Record<string, number>;
  /** families whose GPU axis was pinned by isolation sweeps (stage 1). */
  sweepPinned: string[];
}

/** Fit pooled + per-family models from grouped capture rows (+ optional
 * per-family isolation-sweep points for the two-stage fit). */
export function fitDevices(
  byFamily: Record<string, CaptureRow[]>,
  sweepsByFamily: Record<string, SweepPoint[]> = {},
): DeviceFitResult {
  const rows: TrainingRow[] = [];
  const familyCounts: Record<string, number> = {};
  for (const [fam, capRows] of Object.entries(byFamily)) {
    const tr = toTrainingRows(fam, capRows);
    familyCounts[fam] = tr.length;
    rows.push(...tr);
  }
  const pinned: Record<string, { gpu?: PinnedWeights }> = {};
  const sweepPinnedFams: string[] = [];
  for (const [fam, pts] of Object.entries(sweepsByFamily)) {
    const pins = sweepPins(pts);
    if (pins.gpu) {
      pinned[fam] = pins;
      sweepPinnedFams.push(fam);
    }
  }
  return { fleet: fitFleetTwoStage(rows, pinned), familyCounts, sweepPinned: sweepPinnedFams };
}

/** Families with fewer training rows than this don't get a published model -
 * they fall back to the pooled fleet model (and say so). A family fit on a
 * handful of seconds is noise wearing a coefficient table. */
export const MIN_FAMILY_ROWS = 30;

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
  /** the fitted composite-regression intercepts (per-frame SCENE overhead:
   * renderer fixed cost, not attributable to any one spine). Stored for
   * diagnostics; the published models carry intercept 0 so predictions are
   * MARGINAL per-instance cost. */
  sceneOverheadMs?: {
    fleet: { gpu: number; cpu: number };
    byFamily: Record<string, { gpu: number; cpu: number }>;
  };
  /** families whose GPU axis was pinned by isolation sweeps. */
  sweepPinned?: string[];
}

/** Strip the composite-fit intercept out of a model: predictions must be the
 * spine's MARGINAL cost, not spine cost + the training scene's fixed
 * per-frame overhead (which a single-skeleton workbench doesn't pay N times). */
function marginal(model: LinearCostModel | null): {
  model: LinearCostModel | null;
  overheadMs: number;
} {
  if (!model) return { model: null, overheadMs: 0 };
  return {
    model: { ...model, intercept: 0 },
    overheadMs: Math.round(model.intercept * 1000) / 1000,
  };
}

export function toCoefficientTable(
  fit: DeviceFitResult,
  budgetMs = { gpu: 8, cpu: 8 },
  budgetByFamily?: Record<string, { gpu: number; cpu: number }>,
): CoefficientTable {
  const fleetGpu = marginal(fit.fleet.gpu);
  const fleetCpu = marginal(fit.fleet.cpu);
  const byFamily: CoefficientTable["byFamily"] = {};
  const overheadByFamily: Record<string, { gpu: number; cpu: number }> = {};
  for (const [fam, models] of Object.entries(fit.fleet.byFamily)) {
    const rows = fit.familyCounts[fam] ?? 0;
    if (rows < MIN_FAMILY_ROWS) continue; // gate: too little data to publish
    const g = marginal(models.gpu);
    const c = marginal(models.cpu);
    byFamily[fam] = { gpu: g.model, cpu: c.model };
    overheadByFamily[fam] = { gpu: g.overheadMs, cpu: c.overheadMs };
  }
  return {
    version: 2,
    generatedAt: new Date().toISOString(),
    fleet: { gpu: fleetGpu.model, cpu: fleetCpu.model },
    byFamily,
    budgetMs,
    ...(budgetByFamily ? { budgetByFamily } : {}),
    quality: fit.fleet.quality,
    byFamilyQuality: fit.fleet.byFamilyQuality,
    sceneOverheadMs: {
      fleet: { gpu: fleetGpu.overheadMs, cpu: fleetCpu.overheadMs },
      byFamily: overheadByFamily,
    },
    sweepPinned: fit.sweepPinned,
  };
}

export interface FamilyPrediction {
  gpuMs: number;
  cpuMs: number;
  totalMs: number;
  /** which model answered: the family itself, "fleet" (pooled fallback), or
   * "default" (placeholder weights - nothing fitted at all). */
  usedFamily: string;
  /** fit quality of the model that answered (null for "default"): relMae is
   * the error-band fraction to show as "+-N%". */
  quality: { gpu: FamilyAxisQuality | null; cpu: FamilyAxisQuality | null } | null;
}

/** Predict MARGINAL GPU/CPU ms for one instance's features on a family,
 * resolving family -> pooled fleet -> placeholder defaults, and reporting
 * which one answered plus its fit quality (provenance for the trust UI).
 * Features are folded into design space here - the same fold the fit used. */
export function predictForFamily(
  table: CoefficientTable,
  family: string,
  features: ImpactFeatures,
): FamilyPrediction {
  const design = toDesignFeatures(features);
  const fam = table.byFamily[family];
  const gpu = fam?.gpu ?? table.fleet.gpu ?? undefined;
  const cpu = fam?.cpu ?? table.fleet.cpu ?? undefined;
  const { gpuMs, cpuMs, totalMs } = predictCostMs(design, gpu, cpu);
  const usedFamily = fam ? family : table.fleet.gpu || table.fleet.cpu ? "fleet" : "default";
  const quality =
    usedFamily === "default"
      ? null
      : usedFamily === "fleet"
        ? {
            gpu: table.quality.gpu ? { ...table.quality.gpu } : null,
            cpu: table.quality.cpu ? { ...table.quality.cpu } : null,
          }
        : (table.byFamilyQuality[family] ?? null);
  return { gpuMs, cpuMs, totalMs, usedFamily, quality };
}
