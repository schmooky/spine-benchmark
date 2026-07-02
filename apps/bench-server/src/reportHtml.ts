import type { RunRecord, ScenarioResult, RunCapture } from "./types.js";
import {
  analyzeRunCapacity,
  type CapacityRow,
  type CapacityScenarioMeta,
  type RunCapacityReport,
} from "@spine-benchmark/metrics-model";

/**
 * Self-contained HTML report for GET /r/:id. Surfaces the calibration signals
 * we now measure: GPU family, true GPU vs CPU milliseconds per scenario (not
 * just fps), the density-ramp capacity curve + breaking point, coverage/fit,
 * and which scenes crashed the tab. Dark, no deps.
 */

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&quot;",
  );
}

/** Coarse GPU family from the GL RENDERER string (report-side copy of the
 * canonical classifier in @spine-benchmark/metrics-analyzers). */
function gpuFamily(renderer: string | null | undefined): string {
  const r = (renderer ?? "").toLowerCase();
  if (!r) return "unknown";
  if (r.includes("apple")) return "Apple GPU";
  if (r.includes("adreno")) return (r.match(/adreno.*?(\d)\d\d/)?.[1] ?? "") ? `Adreno ${r.match(/adreno.*?(\d)\d\d/)![1]}xx` : "Adreno";
  if (r.includes("mali")) return (r.match(/mali-?g?(\d+)/)?.[1] ?? "") ? `Mali-G${r.match(/mali-?g?(\d+)/)![1]}` : "Mali";
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

const ms = (v: number | null | undefined): string =>
  v == null ? "<span class='muted'>-</span>" : v.toFixed(2);

const n0 = (v: number | null | undefined): string => (v == null ? "-" : Math.round(v).toString());
const pct1 = (v: number | null | undefined): string => (v == null ? "-" : `${v.toFixed(1)}%`);
/** small ms/unit values need significant figures, not 2 decimals. */
const sig = (v: number | null | undefined): string =>
  v == null ? "-" : Number(v.toPrecision(3)).toString();

/** Device Capacity: what the device can do, in RI/CI units + a plain statement. */
function capacityHtml(cap: RunCapacityReport): string {
  const kneeRows = cap.knees.scenes
    .map(
      (s) => `<tr>
      <td>${esc(s.label)}</td>
      <td class="num">${s.ri.toFixed(0)} / ${s.ci.toFixed(0)}</td>
      <td class="num">${n0(s.measured)}</td>
      <td class="num">${n0(s.predicted)}</td>
      <td class="num ${s.errPct != null && s.errPct > 40 ? "bad" : ""}">${pct1(s.errPct)}</td>
    </tr>`,
    )
    .join("\n");
  const bind =
    cap.binding === "ri"
      ? "RI / fill (GPU)"
      : cap.binding === "ci"
        ? "CI / compute (CPU)"
        : "unknown";
  return `<h2>Device Capacity <span class="muted">(100% = can't hold ${cap.displayHz} Hz)</span></h2>
  <p class="muted">${esc(cap.note)}</p>
  <table>
    <tr><th>frame budget (ceiling)</th><td class="num">${cap.ceilingBudgetMs.toFixed(2)} ms</td>
        <th>safe budget (headroom)</th><td class="num">${cap.safeBudgetMs.toFixed(2)} ms</td></tr>
    <tr><th>cost per RI unit</th><td class="num">${sig(cap.perUnit.riUnitMs)} ms</td>
        <th>cost per CI unit</th><td class="num">${sig(cap.perUnit.ciUnitMs)} ms</td></tr>
    <tr><th>RI units at ceiling</th><td class="num">${n0(cap.ceilingUnits.ri)}</td>
        <th>CI units at ceiling</th><td class="num">${n0(cap.ceilingUnits.ci)}</td></tr>
    <tr><th>binding axis</th><td><strong>${esc(bind)}</strong></td>
        <th>GPU timer</th><td>${cap.gpuTimerAvailable ? '<span class="ok">yes</span>' : '<span class="muted">no (fps knee)</span>'}</td></tr>
  </table>
  ${
    cap.capacity
      ? `<p>Typical real spine here (RI ${cap.capacity.meanSceneRi.toFixed(0)} / CI ${cap.capacity.meanSceneCi.toFixed(0)}) costs
      <strong>${pct1(cap.capacity.perInstancePct)}</strong> of this device;
      about <strong>${n0(cap.capacity.maxConcurrent)}</strong> fit at 100%.</p>`
      : ""
  }
  ${
    kneeRows
      ? `<table>
      <tr><th>scene</th><th>RI/CI (1x)</th><th>measured knee</th><th>predicted knee</th><th>error</th></tr>
      ${kneeRows}
    </table>`
      : ""
  }`;
}

/** Mean each numeric key of a batch of `m` driver objects (per-second means). */
function meanDrivers(ms: Record<string, number>[]): Record<string, number> {
  const out: Record<string, number> = {};
  if (ms.length === 0) return out;
  const keys = Object.keys(ms[0]!);
  for (const k of keys) {
    let sum = 0;
    for (const row of ms) sum += row[k] ?? 0;
    out[k] = sum / ms.length;
  }
  return out;
}

/** Measurement Drivers: the device-invariant cost drivers + CPU render-phase
 * split + GPU-timer coverage, meaned across the whole run. This is what makes
 * a no-timer run (Safari/most Android) still legible - the counts are the
 * only GPU-side signal available there. */
function driversHtml(perSecond: RunCapture["perSecond"] | undefined): string {
  if (!perSecond || perSecond.length === 0) return "";
  const rowsWithM = perSecond
    .map((r) => r.m)
    .filter((m): m is Record<string, number> => !!m);
  const totalFrames = perSecond.reduce((a, r) => a + (r.frames ?? 0), 0);
  const totalGpuFrames = perSecond.reduce((a, r) => a + (r.gpuFrames ?? 0), 0);
  const totalDisjoint = perSecond.reduce((a, r) => a + (r.gpuDisjoint ?? 0), 0);
  const coveragePct = totalFrames > 0 ? (totalGpuFrames / totalFrames) * 100 : null;

  if (rowsWithM.length === 0 && totalFrames === 0) return "";

  const d = meanDrivers(rowsWithM);
  const c = (k: string): string => (d[k] != null ? d[k].toFixed(1) : "-");
  const cms = (k: string): string => (d[k] != null ? `${d[k].toFixed(2)} ms` : "-");

  const coverageRow = totalFrames > 0
    ? `<tr><th>GPU-timer coverage</th><td class="num ${coveragePct != null && coveragePct < 50 ? "bad" : coveragePct != null && coveragePct > 90 ? "ok" : ""}">${pct1(coveragePct)}</td>
        <th>frames / gpu-timed / disjoint</th><td class="num">${totalFrames} / ${totalGpuFrames} / ${totalDisjoint}</td></tr>`
    : "";

  if (rowsWithM.length === 0) {
    return `<h2>Measurement Drivers</h2>
    <table>${coverageRow}</table>`;
  }

  return `<h2>Measurement Drivers <span class="muted">(device-invariant counts + CPU render split, mean/frame across the run)</span></h2>
  <table>
    ${coverageRow}
    <tr><th>draw calls</th><td class="num">${c("drawCalls")}</td>
        <th>vertices drawn</th><td class="num">${c("verticesDrawn")}</td></tr>
    <tr><th>instructions</th><td class="num">${c("instructions")}</td>
        <th>batch breaks</th><td class="num">${c("batchBreaks")}</td></tr>
    <tr><th>stencil masks</th><td class="num">${c("stencilMasks")}</td>
        <th>render-target switches</th><td class="num">${c("renderTargets")}</td></tr>
    <tr><th>renderables updated</th><td class="num">${c("renderablesUpdated")}</td>
        <th>render-groups rebuilt</th><td class="num">${c("renderGroupsRebuilt")}</td></tr>
    <tr><th>state changes</th><td class="num">${c("stateChanges")}</td>
        <th>shader compiles</th><td class="num">${c("shaderCompiles")}</td></tr>
    <tr><th>active textures</th><td class="num">${c("activeTextures")}</td>
        <th>filter passes</th><td class="num">${c("filterPasses")}</td></tr>
    <tr><th>buffer uploads</th><td class="num">${c("bufferUploads")} <span class="muted">(${c("bufferKb")} KB)</span></td>
        <th>texture uploads/unloads</th><td class="num">${c("texUploads")} / ${c("texUnloads")} <span class="muted">(${c("texBytesKb")} KB)</span></td></tr>
    <tr><th colspan="4" class="muted">CPU render-phase split (mean ms/frame)</th></tr>
    <tr><th>build</th><td class="num">${cms("buildMs")}</td>
        <th>update renderables</th><td class="num">${cms("updateRendMs")}</td></tr>
    <tr><th>batch upload</th><td class="num">${cms("batchUploadMs")}</td>
        <th>transforms</th><td class="num">${cms("transformsMs")}</td></tr>
    <tr><th>execute</th><td class="num">${cms("executeMs")}</td>
        <th>render-other</th><td class="num">${cms("renderOtherMs")}</td></tr>
    <tr><th>gc</th><td class="num">${cms("gcMs")}</td>
        <th></th><td></td></tr>
  </table>`;
}

/** Measurement Quality: can we trust RI/CI on this device? */
function qualityHtml(cap: RunCapacityReport): string {
  const vClass =
    cap.verdict === "good" ? "ok" : cap.verdict === "poor" ? "bad" : "muted";
  const fitRow = (name: string, f: { r2: number; mae: number; n: number } | null) =>
    f
      ? `<tr><th>${name}</th><td class="num ${f.r2 >= 0.9 ? "ok" : f.r2 < 0.7 ? "bad" : ""}">R2 ${f.r2.toFixed(3)}</td><td class="num">MAE ${f.mae.toFixed(2)} ms</td><td class="num">${f.n} rows</td></tr>`
      : "";
  const rows = [
    fitRow("GPU ms fit", cap.fit.gpu),
    fitRow("frame-CPU fit (compute)", cap.fit.cpu),
    fitRow("frame-cost fit", cap.fit.combined),
    fitRow("RI/CI model", cap.fit.riCi),
    fitRow("measured-fill fit (real driver counts, RI grounding)", cap.fit.measuredFill),
  ]
    .filter(Boolean)
    .join("\n");
  return `<h2>Measurement Quality <span class="muted">(are RI/CI good predictors here?)</span></h2>
  <p>Verdict: <strong class="${vClass}">${cap.verdict.toUpperCase()}</strong> - ${esc(cap.verdictReason)}</p>
  <table>
    ${rows || '<tr><td class="muted">not enough ms/ramp data to fit</td></tr>'}
    <tr><th>knee prediction error</th><td class="num" colspan="3">${pct1(cap.knees.medianErrPct)} median across scenes</td></tr>
  </table>`;
}

export function renderRunReport(run: RunRecord, capture?: RunCapture | null): string {
  const d = run.device;
  const s = run.summary;
  const rendererStr = d.gl?.renderer || d.gpu?.renderer || "";
  const family = gpuFamily(rendererStr);
  const gpuTimed = run.scenarios.some((sc) => sc.stats.gpuMsAvg != null);

  // Per-run capacity + measurement self-fit, computed from the per-second ramp
  // capture when available (loaded by the /r/:id handler).
  let cap: RunCapacityReport | null = null;
  const perSecond = capture?.perSecond;
  if (perSecond && perSecond.length) {
    const capRows: CapacityRow[] = perSecond.map((r) => ({
      scenarioId: r.scenarioId,
      instances: r.instances,
      fps: r.fps,
      frameMsP95: r.frameMsP95,
      ri: r.ri,
      ci: r.ci,
      one: (r.one ?? null) as CapacityRow["one"],
      gpuMs: r.gpuMs ?? null,
      cpuMs: r.cpuMs ?? null,
      frameCpuMs: r.frameCpuMs ?? null,
      m: r.m
        ? {
            drawCalls: r.m.drawCalls ?? 0,
            verticesDrawn: r.m.verticesDrawn ?? 0,
            stencilMasks: r.m.stencilMasks ?? 0,
            renderTargets: r.m.renderTargets ?? 0,
          }
        : null,
    }));
    const scenMeta: CapacityScenarioMeta[] = run.scenarios.map((sc) => ({
      id: sc.id,
      label: sc.scene ? `${sc.scene.game} / ${sc.scene.state}` : sc.label,
      kind: sc.kind,
    }));
    cap = analyzeRunCapacity({
      perSecond: capRows,
      scenarios: scenMeta,
      displayHz: s.displayHz ?? d.runtime?.displayHz ?? 60,
      gpuTimerSupported: d.gl?.gpuTimerSupported,
    });
  }

  const scene = run.scenarios.filter((sc) => sc.kind === "scene" && !sc.steps);
  const ramps = run.scenarios.filter((sc) => sc.steps && sc.steps.length > 0);
  const calib = ramps.filter((sc) => sc.scene?.game === "calibration");
  const density = ramps.filter((sc) => sc.scene?.game !== "calibration");
  const sweeps = run.scenarios.filter((sc) => sc.kind === "sweep" && sc.sweep);

  const sceneRow = (sc: ScenarioResult) => `<tr>
      <td>${esc(sc.scene ? `${sc.scene.game} / ${sc.scene.state}` : sc.label)}</td>
      <td class="num ${sc.stats.avgFps < 30 ? "bad" : ""}">${sc.stats.avgFps.toFixed(0)}</td>
      <td class="num">${ms(sc.stats.gpuMsAvg)}</td>
      <td class="num">${ms(sc.stats.gpuMsP95)}</td>
      <td class="num">${ms(sc.stats.cpuMsAvg)}</td>
      <td class="num">${ms(sc.stats.cpuMsP95)}</td>
      <td class="num"><strong>${ms(sc.stats.frameCpuMsAvg)}</strong></td>
      <td class="num">${sc.stats.riPeak.toFixed(0)} / ${sc.stats.ciPeak.toFixed(0)}</td>
      <td class="num">${sc.scene?.spineCount ?? sc.stats.maxInstances}</td>
      <td>${esc(sc.scene?.tier ?? "")}${sc.scene && sc.scene.missingRegions > 0 ? ` <span class="bad">(${sc.scene.missingRegions} missing)</span>` : ""}</td>
    </tr>`;

  const rampBlock = (sc: ScenarioResult) => {
    const steps = sc.steps!;
    const knee = sc.aborted ?? "";
    return `<h3>${esc(sc.scene ? `${sc.scene.game} / ${sc.scene.state}` : sc.label)}${knee ? ` <span class="bad">- ${esc(knee)}</span>` : ` <span class="muted">- no breaking point reached</span>`}</h3>
      <table>
        <tr><th>instances</th>${steps.map((st) => `<td class="num">${st.instances}</td>`).join("")}</tr>
        <tr><th>fps</th>${steps.map((st) => `<td class="num ${st.fps < 30 ? "bad" : ""}">${st.fps.toFixed(0)}</td>`).join("")}</tr>
        <tr><th>p95 ms</th>${steps.map((st) => `<td class="num">${st.frameMsP95.toFixed(1)}</td>`).join("")}</tr>
      </table>`;
  };

  /** One isolation-sweep driver's ramp: level -> (driverValue, gpu ms, cpu ms).
   * A clean monotonic gpu/cpu column across levels is the fit-readiness signal -
   * that is what an offline weight fit regresses driverValue against. */
  const sweepBlock = (sc: ScenarioResult) => {
    const sw = sc.sweep!;
    const gpuKnown = sw.pairs.some((p) => p.gpuMsMedian != null);
    return `<h3>${esc(sw.driver)} <span class="muted">(${esc(sw.unit)})</span></h3>
      <table>
        <tr><th>level</th>${sw.pairs.map((p) => `<td class="num">${p.level}</td>`).join("")}</tr>
        <tr><th>driver value</th>${sw.pairs.map((p) => `<td class="num">${n0(p.driverValue)}</td>`).join("")}</tr>
        <tr><th>gpu ms</th>${sw.pairs.map((p) => `<td class="num">${ms(p.gpuMsMedian)}</td>`).join("")}</tr>
        <tr><th>cpu ms</th>${sw.pairs.map((p) => `<td class="num">${ms(p.frameCpuMsMedian)}</td>`).join("")}</tr>
      </table>
      ${!gpuKnown ? '<p class="muted">No GPU timer on this device - only the CPU column carries signal for this sweep.</p>' : ""}`;
  };

  const crashedList = s.crashedScenes?.length
    ? `<tr><th>tab-crashed</th><td class="bad">${s.crashedScenes.map(esc).join(", ")}</td></tr>`
    : "";
  const skippedList = s.skippedScenes?.length
    ? `<tr><th>skipped</th><td class="muted">${s.skippedScenes.map(esc).join(", ")}</td></tr>`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Run ${esc(run.id)} - Spine Bench</title>
<style>
  body { background: #161616; color: #ddd; font: 14px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; margin: 2rem auto; max-width: 960px; padding: 0 1rem; }
  h1 { font-size: 1.3rem; } h2 { font-size: 1.05rem; margin-top: 2rem; } h3 { font-size: 0.95rem; margin-top: 1.4rem; }
  code, .id { background: #242424; border-radius: 6px; padding: 0.1em 0.4em; }
  table { border-collapse: collapse; width: 100%; margin-top: 0.6rem; font-size: 13px; }
  th, td { border: 1px solid #333; padding: 0.3em 0.55em; text-align: left; }
  th { color: #999; font-weight: 500; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .muted { color: #888; } .bad { color: #f87171; } .ok { color: #34d399; }
  .pill { display:inline-block; background:#242424; border-radius:6px; padding:0.1em 0.5em; margin-left:0.4em; }
</style>
</head>
<body>
  <h1>Spine Bench run <span class="id">${esc(run.id)}</span> <span class="pill">${esc(family)}</span></h1>
  <p class="muted">${esc(run.createdAt)} · client ${esc(run.clientVersion)}${s.quick ? " · QUICK MODE" : ""}${s.degraded && !s.crashed ? ' · <span class="bad">degraded (tab hidden)</span>' : ""}</p>
  ${
    !gpuTimed
      ? `<p class="muted">GPU timer query unavailable on this device (Safari/older mobile) - GPU ms columns blank; CPU ms + fps still valid.</p>`
      : ""
  }
  ${
    s.crashed || s.aborted
      ? `<p class="bad"><strong>${s.crashed ? "CRASHED / ENDED EARLY" : "RUN ENDED EARLY"}</strong> - ${esc(s.abortReason ?? "device floor reached")}</p>`
      : ""
  }

  <h2>Device</h2>
  <table>
    <tr><th>label</th><td>${esc(d.label)}</td></tr>
    <tr><th>GPU family</th><td><strong>${esc(family)}</strong></td></tr>
    <tr><th>GL renderer</th><td class="muted">${esc(rendererStr || "n/a")}</td></tr>
    <tr><th>WebGPU</th><td>${d.webgpu?.supported ? esc(`${d.webgpu.vendor ?? ""} ${d.webgpu.architecture ?? ""}`.trim() || "yes") : "no"}</td></tr>
    <tr><th>screen / hz</th><td>${d.screen.width}x${d.screen.height} @ ${d.screen.dpr}x${s.displayHz != null ? ` · ${s.displayHz} Hz` : ""}</td></tr>
    <tr><th>cores / mem</th><td>${d.hardwareConcurrency ?? "?"} cores / ${d.deviceMemoryGb ?? "?"} GB</td></tr>
    <tr><th>max texture</th><td>${d.gl?.maxTextureSize ?? d.maxTextureSize ?? "?"}</td></tr>
    <tr><th>ua</th><td class="muted">${esc(d.userAgent)}</td></tr>
  </table>

  <h2>Summary</h2>
  <table>
    <tr><th>duration</th><td class="num">${(s.totalDurationMs / 1000).toFixed(1)} s</td>
        <th>frames</th><td class="num">${s.totalFrames}</td></tr>
    <tr><th>avg fps</th><td class="num ${s.avgFps >= 55 ? "ok" : s.avgFps < 30 ? "bad" : ""}">${s.avgFps.toFixed(1)}</td>
        <th>worst p99 ms</th><td class="num">${s.worstFrameMsP99.toFixed(1)}</td></tr>
    ${
      d.runtime?.cpuScoreStart != null
        ? `<tr><th>cpu score</th><td class="num">${d.runtime.cpuScoreStart} kops/ms</td>
        <th>cpu drift</th><td class="num ${(d.runtime.cpuDriftPct ?? 0) < -10 ? "bad" : ""}">${d.runtime.cpuDriftPct ?? 0}%${(d.runtime.cpuDriftPct ?? 0) < -10 ? " (throttling)" : ""}</td></tr>`
        : ""
    }
    ${crashedList}
    ${skippedList}
  </table>

  ${driversHtml(capture?.perSecond)}

  ${cap ? capacityHtml(cap) : ""}
  ${cap ? qualityHtml(cap) : ""}

  <h2>Scenes <span class="muted">(real game usage - true GPU/CPU ms)</span></h2>
  <table>
    <tr><th>scene</th><th>fps</th><th>gpu avg</th><th>gpu p95</th><th>cpu upd</th><th>cpu p95</th><th title="Total per-frame CPU: spine.update + render-side (build/transform). The honest compute cost.">frame cpu</th><th>RI/CI</th><th>spines</th><th>tier</th></tr>
    ${scene.map(sceneRow).join("\n")}
  </table>

  ${
    calib.length
      ? `<h2>Calibration ramps <span class="muted">(single-axis: fill = GPU/RI, compute = CPU/CI)</span></h2>${calib.map(rampBlock).join("\n")}`
      : ""
  }
  ${
    density.length
      ? `<h2>Density capacity ramps <span class="muted">(per-game breaking point)</span></h2>${density.map(rampBlock).join("\n")}`
      : ""
  }
  ${
    sweeps.length
      ? `<h2>Isolation sweeps <span class="muted">(one GPU driver at a time - the gpuCost weight fit corpus)</span></h2>${sweeps.map(sweepBlock).join("\n")}`
      : ""
  }

  <p class="muted" style="margin-top:2rem">Full per-second capture (feature vectors + gpu/cpu ms for fitting): <code>GET /api/runs/${esc(run.id)}?include=capture</code> · model: <code>GET /api/model</code></p>
</body>
</html>`;
}
