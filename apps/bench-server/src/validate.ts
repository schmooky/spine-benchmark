/**
 * Holdout validation: the loop that makes "can I trust the meter" a MEASURED
 * number instead of a vibe. Splits fittable runs per family into train/test,
 * fits the two-stage model on train, then predicts each held-out run's actual
 * per-second cost from its OWN features and compares to what was measured.
 *
 * Publishes, per family: MAPE (mean absolute % error) on the held-out rows and
 * a downsampled predicted-vs-measured scatter, both rendered on /fleet. When a
 * family's error is small and stable the meter's numbers are defensible; when
 * it's wide, the meter already shows a wide band (relMae) - this closes the
 * loop by checking the prediction against reality the model never saw.
 */
import {
  fitDevices,
  gpuFamily,
  isFittableVersion,
  predictForFamily,
  toCoefficientTable,
  type CaptureRow,
} from "@spine-benchmark/metrics-analyzers/deviceFit";
import { isPortable, type ClassifiableDevice } from "@spine-benchmark/metrics-analyzers/deviceClass";
import { FEATURE_KEYS, type ImpactFeatures } from "@spine-benchmark/metrics-impact-formula";

import { runStore, type RunDeviceItem } from "./db.js";
import { captureStore } from "./storage.js";
import { logger } from "./logger.js";

const DEFAULT_SCAN_LIMIT = 3000;
const MAX_CAPTURES_FETCHED = 500;
const MIN_ROW_FRAMES = 10;
const MAX_ROW_FRAME_CPU_MS = 500;
/** need at least this many runs in a family to hold some out and still fit. */
const MIN_RUNS_TO_SPLIT = 4;
/** scatter points kept per family (downsampled for the page). */
const MAX_SCATTER = 60;

function normFeatures(one: Record<string, unknown> | null | undefined): ImpactFeatures {
  const f = {} as ImpactFeatures;
  for (const k of FEATURE_KEYS) f[k] = typeof one?.[k] === "number" ? (one[k] as number) : 0;
  return f;
}

interface RunRows {
  runId: string;
  family: string;
  rows: CaptureRow[];
}

export interface ScatterPoint {
  predicted: number;
  measured: number;
}

export interface FamilyValidation {
  family: string;
  /** runs held out for the test split. */
  testRuns: number;
  /** held-out rows scored. */
  testRows: number;
  /** mean absolute percentage error on the CPU axis (the always-present one). */
  cpuMape: number | null;
  /** MAPE on the GPU axis (null when the family has no GPU-timer rows). */
  gpuMape: number | null;
  /** predicted-vs-measured (cpu ms) scatter for the page. */
  scatter: ScatterPoint[];
}

export interface ValidationResult {
  families: FamilyValidation[];
  runsConsidered: number;
  runsUsed: number;
  generatedAt: string;
  durationMs: number;
}

async function collectRunRows(items: (RunDeviceItem & { captureKey: string })[]): Promise<RunRows[]> {
  const out: RunRows[] = [];
  for (const item of items) {
    let capture;
    try {
      capture = await captureStore.get(item.captureKey);
    } catch (err) {
      logger.warn({ err, runId: item.id }, "validate: capture fetch failed");
      continue;
    }
    if (!capture) continue;
    const family = gpuFamily(item.device.gl?.renderer ?? item.device.gpu?.renderer);
    const rows: CaptureRow[] = [];
    for (const row of capture.perSecond) {
      if (!row.one || row.instances <= 0) continue;
      if (row.frames != null && row.frames < MIN_ROW_FRAMES) continue;
      const cpuTarget = (row.frameCpuMs ?? row.cpuMs) ?? null;
      if (cpuTarget != null && cpuTarget > MAX_ROW_FRAME_CPU_MS) continue;
      const gpuOk = row.gpuFrames == null || row.gpuFrames > 0;
      rows.push({
        instances: row.instances,
        features: normFeatures(row.one),
        gpuMs: gpuOk ? (row.gpuMs ?? null) : null,
        cpuMs: cpuTarget,
      });
    }
    if (rows.length > 0) out.push({ runId: item.id, family, rows });
  }
  return out;
}

/** Composite-scale a run's per-second features to what the model predicts on
 * (per-instance features x instances), matching toTrainingRows' scaling.
 * cpuMs is already the resolved target (frameCpuMs, set in collectRunRows). */
function compositeRows(rows: CaptureRow[]): { features: ImpactFeatures; gpuMs: number | null; cpuMs: number | null }[] {
  return rows.map((r) => {
    const scaled = {} as ImpactFeatures;
    for (const k of FEATURE_KEYS) {
      scaled[k] = k === "overdrawFactor" ? r.features[k] : r.features[k] * r.instances;
    }
    return { features: scaled, gpuMs: r.gpuMs, cpuMs: r.cpuMs };
  });
}

/** Percentage error, guarding tiny denominators (a 0.05ms truth shouldn't
 * report 900% error from 0.1ms of noise). */
function pctError(pred: number, actual: number): number | null {
  if (!(Math.abs(actual) > 0.2)) return null; // sub-0.2ms: below the noise floor
  return Math.abs(pred - actual) / Math.abs(actual);
}

export async function runValidation(scanLimit = DEFAULT_SCAN_LIMIT): Promise<ValidationResult> {
  const started = Date.now();
  const items = await runStore.listDevices(scanLimit);
  const fittable = items.filter(
    (it): it is RunDeviceItem & { captureKey: string } =>
      isFittableVersion(it.clientVersion) &&
      !!it.captureKey &&
      isPortable(it.device as unknown as ClassifiableDevice),
  );
  const runRows = await collectRunRows(fittable.slice(0, MAX_CAPTURES_FETCHED));

  // group runs by family so we can hold out whole runs (never leak a run's
  // rows across the train/test split - that would flatter the error)
  const byFamily = new Map<string, RunRows[]>();
  for (const rr of runRows) {
    const list = byFamily.get(rr.family) ?? [];
    list.push(rr);
    byFamily.set(rr.family, list);
  }

  const families: FamilyValidation[] = [];
  let runsUsed = 0;

  for (const [family, runs] of byFamily) {
    if (runs.length < MIN_RUNS_TO_SPLIT) continue;
    // deterministic ~20% holdout: every 5th run (by index) is a test run
    const test = runs.filter((_, i) => i % 5 === 0);
    const train = runs.filter((_, i) => i % 5 !== 0);
    if (test.length === 0 || train.length === 0) continue;

    const trainCap: CaptureRow[] = train.flatMap((r) => r.rows);
    const fit = fitDevices({ [family]: trainCap });
    const table = toCoefficientTable(fit);

    const scatter: ScatterPoint[] = [];
    const cpuErrs: number[] = [];
    const gpuErrs: number[] = [];
    let testRows = 0;
    for (const run of test) {
      for (const comp of compositeRows(run.rows)) {
        const pred = predictForFamily(table, family, comp.features);
        testRows++;
        if (comp.cpuMs != null) {
          const e = pctError(pred.cpuMs, comp.cpuMs);
          if (e != null) cpuErrs.push(e);
          scatter.push({ predicted: Math.round(pred.cpuMs * 100) / 100, measured: comp.cpuMs });
        }
        if (comp.gpuMs != null) {
          const e = pctError(pred.gpuMs, comp.gpuMs);
          if (e != null) gpuErrs.push(e);
        }
      }
    }
    runsUsed += runs.length;

    const mean = (xs: number[]) => (xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : null);
    // downsample the scatter evenly
    const step = Math.max(1, Math.ceil(scatter.length / MAX_SCATTER));
    families.push({
      family,
      testRuns: test.length,
      testRows,
      cpuMape: mean(cpuErrs),
      gpuMape: mean(gpuErrs),
      scatter: scatter.filter((_, i) => i % step === 0).slice(0, MAX_SCATTER),
    });
  }

  families.sort((a, b) => (a.cpuMape ?? 9) - (b.cpuMape ?? 9));

  return {
    families,
    runsConsidered: items.length,
    runsUsed,
    generatedAt: new Date().toISOString(),
    durationMs: Date.now() - started,
  };
}
