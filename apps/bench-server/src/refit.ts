/**
 * Live fleet refit: turns stored runs into a recalibrated per-GPU-family cost
 * table, closing the loop from "gather data on lots of devices" to "the
 * budget meter uses corrected weights". Reads recent runs, pulls each
 * fittable one's capture from S3/memory, and feeds the per-second rows
 * (features + the honest frameCpuMs / true gpuMs) into the TWO-STAGE fit:
 * isolation-sweep scenarios pin the per-driver GPU ratios (fill, vertices),
 * real-game scene rows fit the family scale + everything sweeps don't cover.
 *
 * QUALITY GATES (what keeps the model honest):
 * - client version >= MIN_FIT_VERSION: pre-audit-remediation captures carried
 *   mislabeled ramp densities, duplicated GPU samples and skewed features -
 *   fitting on them launders those errors into the weights;
 * - portable devices only (desktops would dilute the mobile ceilings);
 * - per-row sanity: enough frames behind the row, a plausible frameCpuMs, and
 *   GPU targets only from rows that actually resolved GPU queries;
 * - families with too few rows are not published (MIN_FAMILY_ROWS in
 *   toCoefficientTable) - they fall back to the pooled fleet model.
 */
import {
  fitDevices,
  gpuFamily,
  isFittableVersion,
  toCoefficientTable,
  type CaptureRow,
  type SweepPoint,
} from "@spine-benchmark/metrics-analyzers/deviceFit";
import { isPortable, type ClassifiableDevice } from "@spine-benchmark/metrics-analyzers/deviceClass";
import { FEATURE_KEYS, type ImpactFeatures } from "@spine-benchmark/metrics-impact-formula";

import { runStore, type RunDeviceItem } from "./db.js";
import { captureStore } from "./storage.js";
import { logger } from "./logger.js";
import type { CoefficientTable } from "./model.js";

/** How many runs to scan for fittable candidates. */
const DEFAULT_SCAN_LIMIT = 3000;
/** Hard cap on capture fetches per refit (each is an S3 round trip). */
const MAX_CAPTURES_FETCHED = 500;
/** A per-second row must aggregate at least this many frames to be trusted
 * (a 2-frame "second" during a stall says nothing about steady-state cost). */
const MIN_ROW_FRAMES = 10;
/** Rows with frameCpuMs above this are stall/GC artifacts, not workload cost. */
const MAX_ROW_FRAME_CPU_MS = 500;

function normFeatures(one: Record<string, unknown> | null | undefined): ImpactFeatures {
  const f = {} as ImpactFeatures;
  for (const k of FEATURE_KEYS) f[k] = typeof one?.[k] === "number" ? (one[k] as number) : 0;
  return f;
}

export interface RefitResult {
  table: CoefficientTable;
  /** runs scanned from the store. */
  runsConsidered: number;
  /** runs that passed the version + capture-key + portable-device filter. */
  runsFittable: number;
  /** runs whose capture actually yielded usable rows. */
  runsUsed: number;
  /** total per-second rows fed into the fit. */
  rowsUsed: number;
  /** rows dropped by the per-row sanity gates. */
  rowsGated: number;
  /** isolation-sweep points collected, per GPU family. */
  sweepPointCounts: Record<string, number>;
  /** rows used per GPU family. */
  familyCounts: Record<string, number>;
  durationMs: number;
}

/** Pull recent fittable runs' captures and fit a new coefficient table. */
export async function runRefit(scanLimit = DEFAULT_SCAN_LIMIT): Promise<RefitResult> {
  const started = Date.now();
  const items = await runStore.listDevices(scanLimit);

  const fittable = items.filter(
    (it): it is RunDeviceItem & { captureKey: string } =>
      isFittableVersion(it.clientVersion) &&
      !!it.captureKey &&
      isPortable(it.device as unknown as ClassifiableDevice),
  );
  const toFetch = fittable.slice(0, MAX_CAPTURES_FETCHED);

  const byFamily: Record<string, CaptureRow[]> = {};
  const sweepsByFamily: Record<string, SweepPoint[]> = {};
  let runsUsed = 0;
  let rowsUsed = 0;
  let rowsGated = 0;

  for (const item of toFetch) {
    let capture;
    try {
      capture = await captureStore.get(item.captureKey);
    } catch (err) {
      logger.warn({ err, runId: item.id }, "refit: capture fetch failed, skipping run");
      continue;
    }
    if (!capture) continue;

    const family = gpuFamily(item.device.gl?.renderer ?? item.device.gpu?.renderer);

    // isolation-sweep points (stage 1) live on the run's scenarios
    try {
      const rec = await runStore.get(item.id);
      for (const sc of rec?.scenarios ?? []) {
        if (sc.kind !== "sweep" || !sc.sweep) continue;
        for (const p of sc.sweep.pairs) {
          (sweepsByFamily[family] ??= []).push({
            driver: sc.sweep.driver,
            driverValue: p.driverValue,
            gpuMs: p.gpuMsMedian,
            cpuMs: p.frameCpuMsMedian,
          });
        }
      }
    } catch (err) {
      logger.warn({ err, runId: item.id }, "refit: run fetch for sweeps failed");
    }

    const rows: CaptureRow[] = [];
    for (const row of capture.perSecond) {
      if (!row.one || row.instances <= 0) continue;
      // sanity gates: enough frames behind the aggregate, plausible CPU cost
      if (row.frames != null && row.frames < MIN_ROW_FRAMES) {
        rowsGated++;
        continue;
      }
      const cpuTarget = (row.frameCpuMs ?? row.cpuMs) ?? null;
      if (cpuTarget != null && cpuTarget > MAX_ROW_FRAME_CPU_MS) {
        rowsGated++;
        continue;
      }
      // GPU target only when the row actually resolved GPU queries (post-0.5.0
      // gpuFrames is an honest coverage counter, not the carry-forward fake)
      const gpuOk = row.gpuFrames == null || row.gpuFrames > 0;
      rows.push({
        instances: row.instances,
        features: normFeatures(row.one),
        gpuMs: gpuOk ? (row.gpuMs ?? null) : null,
        cpuMs: cpuTarget,
      });
    }
    if (rows.length === 0) continue;
    (byFamily[family] ??= []).push(...rows);
    runsUsed++;
    rowsUsed += rows.length;
  }

  const fit = fitDevices(byFamily, sweepsByFamily);
  const fitted = toCoefficientTable(fit);
  const table: CoefficientTable = {
    version: fitted.version,
    generatedAt: fitted.generatedAt,
    fleet: fitted.fleet,
    byFamily: fitted.byFamily,
    budgetMs: fitted.budgetMs,
    quality: fitted.quality,
    byFamilyQuality: fitted.byFamilyQuality,
    ...(fitted.sceneOverheadMs ? { sceneOverheadMs: fitted.sceneOverheadMs } : {}),
    ...(fitted.sweepPinned ? { sweepPinned: fitted.sweepPinned } : {}),
  };

  const sweepPointCounts: Record<string, number> = {};
  for (const [fam, pts] of Object.entries(sweepsByFamily)) sweepPointCounts[fam] = pts.length;

  return {
    table,
    runsConsidered: items.length,
    runsFittable: fittable.length,
    runsUsed,
    rowsUsed,
    rowsGated,
    sweepPointCounts,
    familyCounts: fit.familyCounts,
    durationMs: Date.now() - started,
  };
}
