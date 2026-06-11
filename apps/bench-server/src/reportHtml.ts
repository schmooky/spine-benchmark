import type { RunRecord } from "./types.js";

/**
 * Minimal self-contained HTML report for GET /r/:id - enough to eyeball a
 * pal's run from a phone without any client app. Dark grey, no deps.
 */

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&quot;",
  );
}

export function renderRunReport(run: RunRecord): string {
  const d = run.device;
  const s = run.summary;

  const scenarioRows = run.scenarios
    .map(
      (sc) => `<tr>
        <td>${esc(sc.label)}${sc.aborted ? ` <span class="bad">(${esc(sc.aborted)})</span>` : ""}</td>
        <td>${esc(sc.kind)}</td>
        <td class="num">${sc.stats.avgFps.toFixed(1)}</td>
        <td class="num">${sc.stats.frameMsP95.toFixed(1)}</td>
        <td class="num">${sc.stats.frameMsP99.toFixed(1)}</td>
        <td class="num">${sc.stats.longFrames}</td>
        <td class="num">${sc.stats.maxInstances}</td>
        <td class="num">${sc.stats.riPeak.toFixed(1)} / ${sc.stats.ciPeak.toFixed(1)}</td>
      </tr>`,
    )
    .join("\n");

  const stepBlocks = run.scenarios
    .filter((sc) => sc.steps && sc.steps.length > 0)
    .map(
      (sc) => `<h3>${esc(sc.label)} - ramp</h3>
      <table>
        <tr><th>instances</th>${sc.steps!.map((st) => `<td class="num">${st.instances}</td>`).join("")}</tr>
        <tr><th>fps</th>${sc.steps!.map((st) => `<td class="num">${st.fps.toFixed(0)}</td>`).join("")}</tr>
        <tr><th>p95 ms</th>${sc.steps!.map((st) => `<td class="num">${st.frameMsP95.toFixed(1)}</td>`).join("")}</tr>
      </table>`,
    )
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Run ${esc(run.id)} - Spine Bench</title>
<style>
  body { background: #161616; color: #ddd; font: 14px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; margin: 2rem auto; max-width: 860px; padding: 0 1rem; }
  h1 { font-size: 1.3rem; } h2 { font-size: 1.05rem; margin-top: 2rem; } h3 { font-size: 0.95rem; margin-top: 1.4rem; }
  code, .id { background: #242424; border-radius: 6px; padding: 0.1em 0.4em; }
  table { border-collapse: collapse; width: 100%; margin-top: 0.6rem; }
  th, td { border: 1px solid #333; padding: 0.35em 0.6em; text-align: left; }
  th { color: #999; font-weight: 500; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .muted { color: #888; }
  .bad { color: #f87171; } .ok { color: #34d399; }
</style>
</head>
<body>
  <h1>Spine Bench run <span class="id">${esc(run.id)}</span></h1>
  <p class="muted">${esc(run.createdAt)} · client ${esc(run.clientVersion)}${s.quick ? " · QUICK MODE" : ""}${s.degraded && !s.crashed ? ' · <span class="bad">degraded (tab was hidden)</span>' : ""}</p>
  ${
    s.crashed
      ? `<p class="bad"><strong>BROWSER CRASHED</strong> - reconstructed from the crash stash: ${esc(s.abortReason ?? "")}</p>`
      : s.aborted
        ? `<p class="bad"><strong>RUN ENDED EARLY</strong> - ${esc(s.abortReason ?? "device floor reached")}</p>`
        : ""
  }

  <h2>Device</h2>
  <table>
    <tr><th>label</th><td>${esc(d.label)}</td></tr>
    <tr><th>gpu</th><td>${esc(d.gpu ? `${d.gpu.vendor} / ${d.gpu.renderer}` : "n/a")}</td></tr>
    <tr><th>screen</th><td>${d.screen.width}x${d.screen.height} @ ${d.screen.dpr}x</td></tr>
    <tr><th>cores / mem</th><td>${d.hardwareConcurrency ?? "?"} cores / ${d.deviceMemoryGb ?? "?"} GB</td></tr>
    <tr><th>ua</th><td class="muted">${esc(d.userAgent)}</td></tr>
  </table>

  <h2>Summary</h2>
  <table>
    <tr><th>duration</th><td class="num">${(s.totalDurationMs / 1000).toFixed(1)} s</td>
        <th>frames</th><td class="num">${s.totalFrames}</td></tr>
    <tr><th>avg fps</th><td class="num ${s.avgFps >= 55 ? "ok" : s.avgFps < 30 ? "bad" : ""}">${s.avgFps.toFixed(1)}</td>
        <th>worst p99 ms</th><td class="num">${s.worstFrameMsP99.toFixed(1)}</td></tr>
    ${
      s.displayHz != null
        ? `<tr><th>display</th><td class="num">${s.displayHz} Hz</td>
        <th>long tasks</th><td class="num">${s.longTaskCount ?? 0} (${s.longTaskTotalMs ?? 0} ms)</td></tr>`
        : ""
    }
    ${
      d.runtime?.cpuScoreStart != null
        ? `<tr><th>cpu score</th><td class="num">${d.runtime.cpuScoreStart} kops/ms</td>
        <th>cpu drift</th><td class="num ${(d.runtime.cpuDriftPct ?? 0) < -10 ? "bad" : ""}">${d.runtime.cpuDriftPct ?? 0}%${(d.runtime.cpuDriftPct ?? 0) < -10 ? " (throttling)" : ""}</td></tr>`
        : ""
    }
  </table>

  <h2>Scenarios</h2>
  <table>
    <tr><th>scenario</th><th>kind</th><th>fps</th><th>p95 ms</th><th>p99 ms</th><th>long</th><th>max inst</th><th>RI/CI peak</th></tr>
    ${scenarioRows}
  </table>

  ${stepBlocks}

  <p class="muted">Full capture: <code>GET /api/runs/${esc(run.id)}?include=capture</code></p>
</body>
</html>`;
}
