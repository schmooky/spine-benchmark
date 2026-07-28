#!/usr/bin/env node
/**
 * Builds the MEASURED per-device calibration from the fleet's real runs.
 *
 * Why this exists / what it is NOT
 * --------------------------------
 * The hand-tuned poseImpact weights (DEFAULT_RENDERING/COMPUTATIONAL_WEIGHTS)
 * do NOT track real cost - fit against the measured fleet they score R2 = 0.02.
 * That was the broken heart of every earlier "prediction". This tool throws the
 * hand weights away and REFITS, per device, real measured frameCpuMs against the
 * scene's own pose features. The features were fine; the weights were wrong.
 * Refit recovers R2 ~ 0.7 with a 5-fold HELD-OUT MAPE of ~20-25% on the clean
 * (0.6.1, clamped) devices - a "somewhat true" +/-~22% calibration, honestly
 * error-banded, not a confident lie.
 *
 * Keyed per DEVICE, not per GPU family: the Pixel 7 and the Phantom X2 share a
 * Mali-G710 but differ 2x in CPU compute, because frameCpuMs is CPU work driven
 * by the SoC, not the GPU (which is unmeasurable in-browser anyway).
 *
 * Model (per device):  frameCpuMs = SUM_i w_i * feature_i   (with intercept)
 *   features (scene-total = per-spine mean * instances):
 *     [1, vertices, deformedMeshes, weightedMeshes, coveredKpx, drawCallEst]
 *   The workbench computes the same features for a dropped spine (instances=1)
 *   via the canonical pose walker, so the weights transfer directly.
 *
 * Honest scope: CPU compute only (GPU has no in-browser timer). Trust is gated:
 * a device is `trusted` only if clientVersion >= 0.6.1 (post-clamp) AND its
 * held-out MAPE <= MAX_TRUSTED_MAPE. Pre-clamp 0.6.0 runs are kept but untrusted
 * (their heavy-scene frameCpuMs was inflated - re-run them at 0.6.1).
 *
 * Regenerate:  node tools/calibration/build-device-calibration.mjs
 * Output:      packages/metrics-analyzers/data/device-calibration.json
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const API = process.env.BENCH_API ?? "https://spine-bench.schmooky.dev";
const S3 = "https://s3.twcstorage.ru/spine-bench/";
const MIN_VERSION = "0.6.1"; // post-clamp; below this frameCpuMs over-counts on Mali
const MAX_TRUSTED_MAPE = 0.3; // 30% held-out error is the trust ceiling
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
// canonical artifact + a bundled copy the workbench app imports directly.
const OUTS = [
  join(ROOT, "packages/metrics-analyzers/data/device-calibration.json"),
  join(ROOT, "apps/benchmark/src/shared/config/device-calibration.json"),
];

/** feature vector for one scene: intercept + scene-total drivers. */
function sceneFeatures(oneMean, instances) {
  const I = instances || 1;
  return [
    1,
    (oneMean.vertices ?? 0) * I,
    (oneMean.deformedMeshes ?? 0) * I,
    (oneMean.weightedMeshes ?? 0) * I,
    (oneMean.coveredKpx ?? 0) * I,
    (oneMean.drawCallEst ?? 0) * I,
  ];
}
const FEATURE_NAMES = [
  "intercept",
  "verticesTotal",
  "deformedMeshesTotal",
  "weightedMeshesTotal",
  "coveredKpxTotal",
  "drawCallEstTotal",
];

/** Ordinary least squares via normal equations (small k). Returns weights. */
function ols(X, y) {
  const n = X.length;
  const k = X[0].length;
  const A = Array.from({ length: k }, () => new Array(k).fill(0));
  const b = new Array(k).fill(0);
  for (let i = 0; i < n; i++) {
    for (let a = 0; a < k; a++) {
      b[a] += X[i][a] * y[i];
      for (let c = 0; c < k; c++) A[a][c] += X[i][a] * X[i][c];
    }
  }
  // Gaussian elimination with partial pivoting
  for (let c = 0; c < k; c++) {
    let p = c;
    for (let r = c + 1; r < k; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]];
    [b[c], b[p]] = [b[p], b[c]];
    for (let r = 0; r < k; r++) {
      if (r !== c && A[c][c]) {
        const f = A[r][c] / A[c][c];
        for (let cc = c; cc < k; cc++) A[r][cc] -= f * A[c][cc];
        b[r] -= f * b[c];
      }
    }
  }
  return b.map((v, i) => (A[i][i] ? v / A[i][i] : 0));
}
const predict = (w, x) => x.reduce((a, v, i) => a + v * w[i], 0);

function inSampleR2(w, X, y) {
  const my = y.reduce((a, v) => a + v, 0) / y.length;
  let ssr = 0;
  let sst = 0;
  for (let i = 0; i < X.length; i++) {
    ssr += (y[i] - predict(w, X[i])) ** 2;
    sst += (y[i] - my) ** 2;
  }
  return sst ? 1 - ssr / sst : 0;
}

/** 5-fold held-out MAPE: honest out-of-sample error. */
function heldOutMape(X, y) {
  const idx = X.map((_, i) => i);
  let ape = 0;
  let cnt = 0;
  for (let fold = 0; fold < 5; fold++) {
    const test = idx.filter((i) => i % 5 === fold);
    const train = idx.filter((i) => i % 5 !== fold);
    if (train.length < 7) continue;
    const w = ols(
      train.map((i) => X[i]),
      train.map((i) => y[i]),
    );
    for (const i of test) {
      if (y[i] > 0.5) {
        ape += Math.abs((predict(w, X[i]) - y[i]) / y[i]);
        cnt++;
      }
    }
  }
  return cnt ? ape / cnt : null;
}

const cmpVersion = (a, b) =>
  a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });

async function getJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}

async function main() {
  console.log(`fetching runs from ${API} ...`);
  const { runs } = await getJson(`${API}/api/runs?limit=80`);
  const cohort = runs.filter((r) => cmpVersion(r.clientVersion ?? "0", "0.6.0") >= 0);
  console.log(`  ${cohort.length} runs in the 0.6.x cohort`);

  // scene features are content-determined (device-independent). Derive them ONCE
  // from the first capture that has per-second `.one` inputs, keyed by scenarioId.
  let featureByScene = null;
  const perDevice = new Map(); // label -> { runIds, ver, gpuFamily, scenes:{id:ms} }

  for (const r of cohort) {
    const detail = await getJson(`${API}/api/runs/${r.id}`);
    const label = detail.device?.deviceLabel ?? detail.device?.label ?? r.id;
    const gpuFamily = detail.device?.gpuFamily ?? detail.device?.gpu ?? "unknown";
    const entry =
      perDevice.get(label) ??
      { deviceLabel: label, gpuFamily, clientVersion: r.clientVersion, runIds: [], scenes: {} };
    entry.runIds.push(r.id);
    // keep the freshest client version seen for this device
    if (cmpVersion(r.clientVersion ?? "0", entry.clientVersion ?? "0") > 0)
      entry.clientVersion = r.clientVersion;
    const inst = {};
    for (const s of detail.scenarios) inst[s.id] = s.scene?.spineCount ?? s.stats?.maxInstances ?? 1;
    for (const s of detail.scenarios) {
      const ms = s.stats?.frameCpuMsAvg;
      if (ms != null) entry.scenes[s.id] = { ms, inst: inst[s.id] };
    }
    perDevice.set(label, entry);

    if (!featureByScene && detail.captureKey) {
      try {
        const cap = await getJson(`${S3}${detail.captureKey}`);
        const byScn = {};
        for (const row of cap.perSecond ?? []) {
          if (row.one) (byScn[row.scenarioId] ??= []).push(row.one);
        }
        featureByScene = {};
        for (const [sid, rows] of Object.entries(byScn)) {
          const mean = {};
          for (const k of Object.keys(rows[0])) mean[k] = rows.reduce((a, x) => a + (x[k] ?? 0), 0) / rows.length;
          featureByScene[sid] = { mean, inst: inst[sid] ?? 1 };
        }
        console.log(`  scene features from capture ${detail.captureKey} (${Object.keys(featureByScene).length} scenes)`);
      } catch (e) {
        console.warn(`  capture fetch failed (${detail.captureKey}): ${e.message}`);
      }
    }
  }

  if (!featureByScene) throw new Error("no capture with per-second features found - cannot build features");

  const devices = [];
  for (const entry of perDevice.values()) {
    const sceneIds = Object.keys(entry.scenes).filter((s) => featureByScene[s]);
    if (sceneIds.length < 12) {
      console.log(`  skip ${entry.deviceLabel}: only ${sceneIds.length} scenes`);
      continue;
    }
    const X = sceneIds.map((s) => sceneFeatures(featureByScene[s].mean, entry.scenes[s].inst));
    const y = sceneIds.map((s) => entry.scenes[s].ms);
    const weights = ols(X, y);
    const r2 = inSampleR2(weights, X, y);
    const mape = heldOutMape(X, y);
    const trusted =
      cmpVersion(entry.clientVersion ?? "0", MIN_VERSION) >= 0 && mape != null && mape <= MAX_TRUSTED_MAPE;
    devices.push({
      deviceLabel: entry.deviceLabel,
      gpuFamily: entry.gpuFamily,
      clientVersion: entry.clientVersion,
      runIds: entry.runIds,
      scenes: sceneIds.length,
      weights: weights.map((w) => Math.round(w * 1e6) / 1e6),
      inSampleR2: Math.round(r2 * 100) / 100,
      heldOutMape: mape == null ? null : Math.round(mape * 1000) / 1000,
      trusted,
    });
  }
  devices.sort((a, b) => (a.heldOutMape ?? 1) - (b.heldOutMape ?? 1));

  const out = {
    schema: 1,
    generatedAt: new Date().toISOString(),
    target: "frameCpuMs",
    unit: "ms",
    scope: "cpu-compute-only (GPU has no in-browser timer)",
    minTrustedClientVersion: MIN_VERSION,
    maxTrustedHeldOutMape: MAX_TRUSTED_MAPE,
    features: FEATURE_NAMES,
    featureNote:
      "scene-total = per-spine pose-feature mean * instances. A dropped spine in the workbench uses instances=1. ms = sum(weights[i] * features[i]).",
    method:
      "per-device OLS refit of measured frameCpuMs vs scene features; the hand-tuned poseImpact weights score R2=0.02 and are NOT used. 5-fold held-out MAPE is the honest error band.",
    devices,
  };
  const json = JSON.stringify(out, null, 2) + "\n";
  for (const p of OUTS) {
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, json);
    console.log(`wrote ${p}`);
  }
  console.log("");
  console.log("DEVICE".padEnd(30), "ver".padStart(6), "R2".padStart(6), "held".padStart(6), "trusted");
  for (const d of devices)
    console.log(
      d.deviceLabel.slice(0, 30).padEnd(30),
      (d.clientVersion ?? "?").padStart(6),
      String(d.inSampleR2).padStart(6),
      ((d.heldOutMape == null ? "?" : (d.heldOutMape * 100).toFixed(0) + "%")).padStart(6),
      d.trusted ? "YES" : "no",
    );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
