/**
 * Fleet overview: the gathered runs grouped by PORTABLE device family, desktops
 * excluded. This is a coverage/inventory view - "which real phones and tablets
 * have we measured, and where are the gaps" - to steer where to keep pushing.
 *
 * Family (iPhone / Samsung Galaxy / ...) is a marketing lineage, not a
 * performance tier; the cost model still clusters by GPU family. Here we only
 * want to see the fleet by the axis a human thinks in when chasing coverage.
 */
import {
  type ClassifiableDevice,
  deviceClass,
  deviceFamily,
  groupPortableByFamily,
} from "@spine-benchmark/metrics-analyzers/deviceClass";

import type { RunDeviceItem } from "./db.js";
import type { CoefficientTable } from "./model.js";

/** First client version whose runs carry true GPU/CPU ms (fittable). Kept in
 * sync with metrics-analyzers MIN_FIT_VERSION without importing the pixi-laden
 * package root. */
const MIN_FIT_VERSION = "0.3.0";

function isFittable(clientVersion: string | null | undefined): boolean {
  if (!clientVersion) return false;
  const a = clientVersion.split(".").map((n) => parseInt(n, 10) || 0);
  const b = MIN_FIT_VERSION.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  }
  return true;
}

/** Coarse GPU family from a GL RENDERER string (local copy of the canonical
 * classifier - the report keeps one too; kept pixi-free on purpose). */
function gpuFamily(renderer: string | null | undefined): string {
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
  return "other";
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** A best-effort device model string for inventory (uaModel, else the label). */
function modelOf(d: ClassifiableDevice & { uaModel?: string | null; label?: string | null }): string {
  const m = (d.uaModel ?? "").trim();
  if (m) return m;
  const label = (d.label ?? "").trim();
  return label || "unknown";
}

export interface FleetFamily {
  family: string;
  runs: number;
  /** distinct device models seen, most-frequent first. */
  models: { model: string; runs: number }[];
  /** distinct GPU families seen in this device family. */
  gpuFamilies: string[];
  /** runs on a fittable client (>= 0.3.0, i.e. carry GPU/CPU ms). */
  fittableRuns: number;
  medianAvgFps: number;
  latestAt: string;
}

/** A GPU-family row on the coverage table: how many runs we have, whether the
 * last refit could explain them, and how urgently it needs more/better data.
 * This is the axis the *cost model* actually clusters by - separate from the
 * device-family table above, which is the axis a human recognizes. */
export interface GpuCoverageRow {
  gpuFamily: string;
  runs: number;
  /** device families (iPhone / Galaxy / ...) contributing runs to this GPU family. */
  deviceFamilies: string[];
  quality: {
    gpu: { r2: number; mae: number; n: number } | null;
    cpu: { r2: number; mae: number; n: number } | null;
  } | null;
  /** "high" = worth prioritizing more runs/devices for; "low" = well fit already. */
  priority: "high" | "medium" | "low";
}

export interface FleetSummary {
  generatedAt: string;
  totalRuns: number;
  portableRuns: number;
  excludedDesktopRuns: number;
  unknownRuns: number;
  families: FleetFamily[];
  gpuCoverage: GpuCoverageRow[];
}

/** cpu R2 thresholds for the coverage priority flag - tuned against what
 * we've actually observed across families so far (0.03-0.6 range), not an
 * absolute "good regression" bar. */
function priorityFor(quality: GpuCoverageRow["quality"]): GpuCoverageRow["priority"] {
  const cpu = quality?.cpu;
  if (!cpu) return "high"; // no fit at all yet - most urgent
  if (cpu.r2 < 0.15) return "high";
  if (cpu.r2 < 0.35) return "medium";
  return "low";
}

type FleetItem = RunDeviceItem;

function classifiableOf(item: FleetItem): ClassifiableDevice {
  // Device rows are stored verbatim; the classifier reads a defensive subset.
  return item.device as unknown as ClassifiableDevice;
}

/** Group runs by portable family (desktops excluded) with per-family inventory.
 * `model` (the currently published/last-refit coefficient table) is optional -
 * pass it to also get the gpuCoverage fit-quality breakdown; omit it to get
 * inventory only (e.g. before any refit has ever run). */
export function buildFleet(items: readonly FleetItem[], model?: CoefficientTable): FleetSummary {
  let excludedDesktopRuns = 0;
  let unknownRuns = 0;
  for (const it of items) {
    const c = deviceClass(classifiableOf(it));
    if (c === "desktop") excludedDesktopRuns++;
    else if (c === "unknown") unknownRuns++;
  }

  const grouped = groupPortableByFamily(items, classifiableOf);

  const gpuRuns = new Map<string, number>();
  const gpuDeviceFamilies = new Map<string, Set<string>>();

  const families: FleetFamily[] = grouped.map(({ family, items: runs }) => {
    const modelCounts = new Map<string, number>();
    const gpuFams = new Set<string>();
    const fpsList: number[] = [];
    let fittableRuns = 0;
    let latestAt = "";

    for (const r of runs) {
      const d = r.device as unknown as ClassifiableDevice & { uaModel?: string | null; label?: string | null; gl?: { renderer?: string | null } | null };
      const modelStr = modelOf(d);
      modelCounts.set(modelStr, (modelCounts.get(modelStr) ?? 0) + 1);
      const gf = gpuFamily(d.gpu?.renderer ?? d.gl?.renderer);
      gpuFams.add(gf);
      gpuRuns.set(gf, (gpuRuns.get(gf) ?? 0) + 1);
      (gpuDeviceFamilies.get(gf) ?? gpuDeviceFamilies.set(gf, new Set()).get(gf)!).add(family);
      if (r.avgFps > 0) fpsList.push(r.avgFps);
      if (isFittable(r.clientVersion)) fittableRuns++;
      if (r.createdAt > latestAt) latestAt = r.createdAt;
    }

    return {
      family,
      runs: runs.length,
      models: [...modelCounts.entries()]
        .map(([model, n]) => ({ model, runs: n }))
        .sort((a, b) => b.runs - a.runs || a.model.localeCompare(b.model)),
      gpuFamilies: [...gpuFams].sort(),
      fittableRuns,
      medianAvgFps: +median(fpsList).toFixed(1),
      latestAt,
    };
  });

  const portableRuns = families.reduce((s, f) => s + f.runs, 0);

  // Union of GPU families seen in the data and families the model has fit
  // quality for (a stale model may reference a family with no recent runs).
  const gpuFamNames = new Set([...gpuRuns.keys(), ...Object.keys(model?.byFamilyQuality ?? {})]);
  const gpuCoverage: GpuCoverageRow[] = [...gpuFamNames]
    .map((gf) => {
      const quality = model?.byFamilyQuality?.[gf] ?? null;
      return {
        gpuFamily: gf,
        runs: gpuRuns.get(gf) ?? 0,
        deviceFamilies: [...(gpuDeviceFamilies.get(gf) ?? [])].sort(),
        quality,
        priority: priorityFor(quality),
      };
    })
    .sort((a, b) => {
      const rank = { high: 0, medium: 1, low: 2 };
      return rank[a.priority] - rank[b.priority] || b.runs - a.runs;
    });

  return {
    generatedAt: new Date().toISOString(),
    totalRuns: items.length,
    portableRuns,
    excludedDesktopRuns,
    unknownRuns,
    families,
    gpuCoverage,
  };
}

// ── HTML ───────────────────────────────────────────────────

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

/** Minimal self-contained HTML fleet report (matches the run report's style). */
/** A held-out validation snapshot (from validate.ts) - the "can I trust it"
 * evidence rendered on /fleet. Kept structural so fleet.ts needn't import the
 * validation module. */
export interface FleetValidation {
  generatedAt: string;
  families: {
    family: string;
    testRuns: number;
    testRows: number;
    cpuMape: number | null;
    gpuMape: number | null;
    scatter: { predicted: number; measured: number }[];
  }[];
}

/** Tiny inline predicted-vs-measured scatter SVG (log-friendly linear). A
 * tight diagonal = trustworthy predictions; scatter off the y=x line = error. */
function scatterSvg(points: { predicted: number; measured: number }[]): string {
  if (points.length === 0) return "";
  const size = 90;
  const pad = 4;
  const max = Math.max(1, ...points.flatMap((p) => [p.predicted, p.measured]));
  const sc = (v: number) => pad + (v / max) * (size - 2 * pad);
  const diag = `<line x1="${pad}" y1="${size - pad}" x2="${size - pad}" y2="${pad}" stroke="#3a444d" stroke-width="1" stroke-dasharray="3 3"/>`;
  const dots = points
    .map((p) => `<circle cx="${sc(p.predicted).toFixed(1)}" cy="${(size - sc(p.measured)).toFixed(1)}" r="1.6" fill="#7fd99a"/>`)
    .join("");
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="predicted vs measured ms">${diag}${dots}</svg>`;
}

function mapePct(v: number | null): string {
  return v == null ? "n/a" : `${Math.round(v * 100)}%`;
}

function mapeBadge(v: number | null): string {
  if (v == null) return "low";
  if (v > 0.35) return "high";
  if (v > 0.18) return "medium";
  return "low";
}

export function renderFleet(f: FleetSummary, validation?: FleetValidation): string {
  const rows = f.families
    .map((fam) => {
      const models = fam.models
        .slice(0, 6)
        .map((m) => `${esc(m.model)}${m.runs > 1 ? ` x${m.runs}` : ""}`)
        .join(", ");
      const more = fam.models.length > 6 ? ` +${fam.models.length - 6} more` : "";
      return `<tr>
      <td><strong>${esc(fam.family)}</strong></td>
      <td class="num">${fam.runs}</td>
      <td class="num">${fam.fittableRuns}</td>
      <td class="num">${fam.medianAvgFps}</td>
      <td>${esc(fam.gpuFamilies.join(", "))}</td>
      <td class="models">${models}${more}</td>
    </tr>`;
    })
    .join("\n");

  const validationRows = (validation?.families ?? [])
    .map((v) => {
      return `<tr>
      <td><strong>${esc(v.family)}</strong></td>
      <td><span class="badge badge-${mapeBadge(v.cpuMape)}">${mapePct(v.cpuMape)}</span></td>
      <td class="num">${v.gpuMape != null ? mapePct(v.gpuMape) : "no timer"}</td>
      <td class="num">${v.testRuns} runs · ${v.testRows} rows</td>
      <td>${scatterSvg(v.scatter)}</td>
    </tr>`;
    })
    .join("\n");

  const validationSection = validation
    ? `
  <h2>Prediction accuracy <span class="muted">- held-out runs the model never saw: predicted vs measured (the trust number)</span></h2>
  <p class="muted">${esc(validation.generatedAt)} - lower MAPE = the meter's ms are defensible; the scatter should hug the dashed y=x line.</p>
  <div class="wrap"><table>
    <thead><tr>
      <th>GPU family</th><th>CPU MAPE</th><th>GPU MAPE</th><th>Holdout</th><th>Pred vs measured (ms)</th>
    </tr></thead>
    <tbody>
${validationRows || `<tr><td colspan="5" class="muted">Not enough runs per family to hold out yet.</td></tr>`}
    </tbody>
  </table></div>`
    : "";

  const coverageRows = f.gpuCoverage
    .map((c) => {
      const cpu = c.quality?.cpu;
      const cpuCell = cpu ? `R² ${cpu.r2.toFixed(2)} · MAE ${cpu.mae.toFixed(1)}ms · n=${cpu.n}` : "not fit yet";
      return `<tr>
      <td><strong>${esc(c.gpuFamily)}</strong></td>
      <td><span class="badge badge-${c.priority}">${c.priority}</span></td>
      <td class="num">${c.runs}</td>
      <td>${cpuCell}</td>
      <td class="models">${esc(c.deviceFamilies.join(", "))}</td>
    </tr>`;
    })
    .join("\n");

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Spine Bench fleet</title>
<style>
  :root { color-scheme: dark; }
  body { font: 14px/1.5 system-ui, sans-serif; margin: 0; background: #0b0d10; color: #e6e6e6; }
  main { max-width: 900px; margin: 0 auto; padding: 24px 16px 64px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  h2 { font-size: 15px; margin: 32px 0 4px; }
  .muted { color: #8a929c; }
  .stats { display: flex; gap: 16px; flex-wrap: wrap; margin: 16px 0; }
  .stat { background: #14181d; border: 1px solid #232a31; border-radius: 10px; padding: 10px 14px; }
  .stat b { display: block; font-size: 20px; }
  .wrap { overflow-x: auto; }
  table { border-collapse: collapse; width: 100%; margin-top: 8px; }
  th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #232a31; vertical-align: top; }
  th { color: #8a929c; font-weight: 600; font-size: 12px; text-transform: uppercase; letter-spacing: .04em; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; }
  td.models { color: #b7c0cb; font-size: 13px; }
  tbody tr:hover { background: #12161a; }
  .badge { display: inline-block; font-size: 11px; padding: 2px 8px; border-radius: 999px; text-transform: uppercase; letter-spacing: .03em; }
  .badge-high { background: #3a1d1d; color: #e08a8a; }
  .badge-medium { background: #3a331d; color: #e0c675; }
  .badge-low { background: #1d3a26; color: #7fd99a; }
</style></head>
<body><main>
  <h1>Spine Bench fleet <span class="muted">- portable devices by family</span></h1>
  <p class="muted">${esc(f.generatedAt)} - desktops excluded from grouping.</p>
  <div class="stats">
    <div class="stat"><b>${f.portableRuns}</b><span class="muted">portable runs</span></div>
    <div class="stat"><b>${f.families.length}</b><span class="muted">families</span></div>
    <div class="stat"><b>${f.excludedDesktopRuns}</b><span class="muted">desktop (excluded)</span></div>
    <div class="stat"><b>${f.unknownRuns}</b><span class="muted">unclassified</span></div>
  </div>
  <div class="wrap"><table>
    <thead><tr>
      <th>Family</th><th>Runs</th><th>Fittable</th><th>Median fps</th><th>GPU families</th><th>Models</th>
    </tr></thead>
    <tbody>
${rows || `<tr><td colspan="6" class="muted">No portable runs yet.</td></tr>`}
    </tbody>
  </table></div>

  <h2>GPU coverage <span class="muted">- what the cost model actually clusters by; where to send the next device</span></h2>
  <div class="wrap"><table>
    <thead><tr>
      <th>GPU family</th><th>Priority</th><th>Runs</th><th>CPU fit quality</th><th>Device families</th>
    </tr></thead>
    <tbody>
${coverageRows || `<tr><td colspan="5" class="muted">No GPU coverage data yet - run a refit first.</td></tr>`}
    </tbody>
  </table></div>
${validationSection}
</main></body></html>`;
}
