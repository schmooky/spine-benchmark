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

export interface FleetSummary {
  generatedAt: string;
  totalRuns: number;
  portableRuns: number;
  excludedDesktopRuns: number;
  unknownRuns: number;
  families: FleetFamily[];
}

type FleetItem = RunDeviceItem;

function classifiableOf(item: FleetItem): ClassifiableDevice {
  // Device rows are stored verbatim; the classifier reads a defensive subset.
  return item.device as unknown as ClassifiableDevice;
}

/** Group runs by portable family (desktops excluded) with per-family inventory. */
export function buildFleet(items: readonly FleetItem[]): FleetSummary {
  let excludedDesktopRuns = 0;
  let unknownRuns = 0;
  for (const it of items) {
    const c = deviceClass(classifiableOf(it));
    if (c === "desktop") excludedDesktopRuns++;
    else if (c === "unknown") unknownRuns++;
  }

  const grouped = groupPortableByFamily(items, classifiableOf);

  const families: FleetFamily[] = grouped.map(({ family, items: runs }) => {
    const modelCounts = new Map<string, number>();
    const gpuFams = new Set<string>();
    const fpsList: number[] = [];
    let fittableRuns = 0;
    let latestAt = "";

    for (const r of runs) {
      const d = r.device as unknown as ClassifiableDevice & { uaModel?: string | null; label?: string | null; gl?: { renderer?: string | null } | null };
      const model = modelOf(d);
      modelCounts.set(model, (modelCounts.get(model) ?? 0) + 1);
      gpuFams.add(gpuFamily(d.gpu?.renderer ?? d.gl?.renderer));
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

  return {
    generatedAt: new Date().toISOString(),
    totalRuns: items.length,
    portableRuns,
    excludedDesktopRuns,
    unknownRuns,
    families,
  };
}

// ── HTML ───────────────────────────────────────────────────

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

/** Minimal self-contained HTML fleet report (matches the run report's style). */
export function renderFleet(f: FleetSummary): string {
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

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Spine Bench fleet</title>
<style>
  :root { color-scheme: dark; }
  body { font: 14px/1.5 system-ui, sans-serif; margin: 0; background: #0b0d10; color: #e6e6e6; }
  main { max-width: 900px; margin: 0 auto; padding: 24px 16px 64px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
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
</main></body></html>`;
}
