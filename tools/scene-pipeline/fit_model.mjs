/**
 * Turn collected 0.3.0 runs into a fitted per-GPU-family cost model and
 * (optionally) publish it to the server. Run AFTER a device campaign:
 *
 *   node tools/scene-pipeline/fit_model.mjs [--api https://spine-bench.schmooky.dev] \
 *        [--post] [--token <MODEL_WRITE_TOKEN>] [--out coefficients.json]
 *
 * Steps: list runs -> keep clientVersion >= 0.3.0 (legacy runs lack GPU/CPU ms)
 * -> pull each run's capture -> build (features x instances -> measured ms) rows
 * grouped by GPU family -> ridge fit pooled + per family + CV -> print quality,
 * write coefficients.json, and POST /api/model when --post is given.
 *
 * If TLS verification fails against the .dev host, prefix with
 * NODE_TLS_REJECT_UNAUTHORIZED=0.
 */
import {
  gpuFamily,
  fitDevices,
  toCoefficientTable,
  isFittableVersion,
} from "@spine-benchmark/metrics-analyzers";
import { writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const opt = (k, d) => {
  const i = args.indexOf(k);
  return i >= 0 ? (args[i + 1] ?? true) : d;
};
const API = opt("--api", "https://spine-bench.schmooky.dev");
const OUT = opt("--out", "coefficients.json");
const POST = args.includes("--post");
const TOKEN = opt("--token", process.env.MODEL_WRITE_TOKEN);

async function getJson(url, init) {
  const r = await fetch(url, init);
  if (!r.ok) throw new Error(`${url} -> HTTP ${r.status}`);
  return r.json();
}

const list = (await getJson(`${API}/api/runs?limit=500`)).runs;
const fittable = list.filter((r) => isFittableVersion(r.clientVersion));
console.log(`${list.length} runs, ${fittable.length} fittable (>= 0.3.0)`);
if (fittable.length === 0) {
  console.log("no new-methodology runs yet - run the campaign on the 0.3.0 client first.");
  process.exit(0);
}

const byFamily = {};
let rows = 0;
for (const item of fittable) {
  let run;
  try {
    run = await getJson(`${API}/api/runs/${item.id}?include=capture`);
  } catch (e) {
    console.warn(`  skip ${item.id}: ${e.message}`);
    continue;
  }
  const fam = gpuFamily(run.device?.gl?.renderer || run.device?.gpu?.renderer);
  const perSecond = run.capture?.perSecond ?? [];
  for (const ps of perSecond) {
    if (ps.instances <= 0 || !ps.one) continue;
    if (ps.gpuMs == null && ps.cpuMs == null) continue; // legacy row
    (byFamily[fam] ??= []).push({
      instances: ps.instances,
      features: { ...ps.one, coveredKpx: ps.one.coveredKpx ?? 0, overdrawFactor: ps.one.overdrawFactor ?? 1 },
      gpuMs: ps.gpuMs ?? null,
      cpuMs: ps.cpuMs ?? null,
    });
    rows++;
  }
}
console.log(`families: ${Object.keys(byFamily).join(", ") || "(none)"} | training rows: ${rows}`);

const fit = fitDevices(byFamily);
const table = toCoefficientTable(fit);
writeFileSync(OUT, JSON.stringify(table, null, 2));
console.log(`\nwrote ${OUT}`);
console.log("quality:", JSON.stringify(fit.fleet.quality, null, 2));
console.log("per-family rows:", JSON.stringify(fit.familyCounts));

if (POST) {
  if (!TOKEN) console.warn("--post given but no --token / MODEL_WRITE_TOKEN; server may reject.");
  const res = await fetch(`${API}/api/model`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(TOKEN ? { authorization: `Bearer ${TOKEN}` } : {}) },
    body: JSON.stringify(table),
  });
  console.log(`POST /api/model -> ${res.status}`, await res.text());
}
