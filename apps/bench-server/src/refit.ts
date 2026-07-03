/**
 * Live fleet refit: turns stored runs into a recalibrated per-GPU-family cost
 * table, closing the loop from "gather data on lots of devices" to "the
 * budget meter uses corrected weights". Reads recent runs, pulls each
 * fittable one's capture from S3/memory, and feeds the per-second rows
 * (features + the honest frameCpuMs / true gpuMs) into the offline fit.
 *
 * Desktops are excluded (thesis: the calibration study is about the devices
 * players actually use, and a single scalar ceiling would be diluted by a
 * desktop's huge headroom). Pre-0.3.0 runs lack gpuMs/cpuMs entirely and are
 * skipped (isFittableVersion); pre-0.4.1 runs are still usable, falling back
 * from frameCpuMs to the older (undercounted) cpuMs.
 */
import {
  fitDevices,
  gpuFamily,
  isFittableVersion,
  toCoefficientTable,
  type CaptureRow,
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
  let runsUsed = 0;
  let rowsUsed = 0;

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
    const rows: CaptureRow[] = [];
    for (const row of capture.perSecond) {
      if (!row.one || row.instances <= 0) continue;
      rows.push({
        instances: row.instances,
        features: normFeatures(row.one),
        gpuMs: row.gpuMs ?? null,
        // honest compute target: frameCpuMs (0.4.1+) falls back to cpuMs.
        cpuMs: (row.frameCpuMs ?? row.cpuMs) ?? null,
      });
    }
    if (rows.length === 0) continue;
    (byFamily[family] ??= []).push(...rows);
    runsUsed++;
    rowsUsed += rows.length;
  }

  const fit = fitDevices(byFamily);
  const fitted = toCoefficientTable(fit);
  const table: CoefficientTable = {
    version: fitted.version,
    generatedAt: fitted.generatedAt,
    fleet: fitted.fleet,
    byFamily: fitted.byFamily,
    budgetMs: fitted.budgetMs,
    quality: fitted.quality,
    byFamilyQuality: fitted.byFamilyQuality,
  };

  return {
    table,
    runsConsidered: items.length,
    runsFittable: fittable.length,
    runsUsed,
    rowsUsed,
    familyCounts: fit.familyCounts,
    durationMs: Date.now() - started,
  };
}
