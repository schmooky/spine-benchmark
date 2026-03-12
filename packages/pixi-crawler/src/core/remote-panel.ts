/**
 * Remote Panel - opens a self-contained HTML panel in a new tab
 * connected via BroadcastChannel for real-time diagnostic display.
 *
 * Diagnostic-first design:
 * - Frame Health Summary at the top (plain English diagnosis)
 * - Problem Objects list (scene nodes causing cost, sorted by impact)
 * - Detail panel shows per-object budget, issues, and fixes
 * - Rendering Pipeline section is collapsible (waterfall is secondary)
 * - Flamechart timeline for frame selection
 * - Frame buffer (600 frames) and inspect mode for historical analysis
 */

import { ISSUE_IMPACT, ISSUE_EXPLAIN } from './types.js';

export function openRemotePanel(): Window | null {
    const issueImpactJSON = JSON.stringify(ISSUE_IMPACT);
    const issueExplainJSON = JSON.stringify(ISSUE_EXPLAIN);

    const html = /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Pixi Crawler - Remote Panel</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#111;--bg2:#1a1a1a;--bg3:#222;--border:#333;
  --fg:#ccc;--fg2:#888;--fg3:#555;
  --amber:#f59e0b;--red:#ef4444;--purple:#a855f7;--blue:#3b82f6;--green:#22c55e;--cyan:#06b6d4;
}
html,body{height:100%;background:var(--bg);color:var(--fg);font:12px/1.4 'Cascadia Code','Fira Code','JetBrains Mono',monospace}
a{color:var(--cyan)}
button{
  background:var(--bg3);color:var(--fg);border:1px solid var(--border);
  padding:4px 12px;cursor:pointer;font:inherit;border-radius:3px;
}
button:hover{background:var(--border)}
button.active{border-color:var(--green);color:var(--green)}

/* ── layout ── */
#app{display:flex;flex-direction:column;height:100%;overflow:hidden}
header{
  display:flex;align-items:center;gap:12px;padding:6px 12px;
  background:var(--bg2);border-bottom:1px solid var(--border);flex-shrink:0;
}
header h1{font-size:13px;font-weight:600;color:var(--fg);white-space:nowrap}
#connection{width:8px;height:8px;border-radius:50%;background:var(--fg3);flex-shrink:0}
#connection.connected{background:var(--green)}
#fps-mini{width:120px;height:20px;flex-shrink:0}
.spacer{flex:1}
#mode-badge{
  font-size:10px;font-weight:700;padding:2px 8px;border-radius:3px;
  text-transform:uppercase;letter-spacing:.5px;
}
#mode-badge.live{background:#14532d;color:var(--green)}
#mode-badge.inspect{background:#78350f;color:var(--amber)}

/* ── stats bar ── */
#stats-bar{
  display:flex;gap:16px;padding:4px 12px;background:var(--bg2);
  border-bottom:1px solid var(--border);font-size:11px;color:var(--fg2);flex-shrink:0;
}
#stats-bar .val{color:var(--fg);font-weight:600}

/* ── flamechart strip ── */
#flamechart-strip{
  position:relative;height:60px;background:var(--bg);
  border-bottom:1px solid var(--border);flex-shrink:0;
  cursor:pointer;overflow:hidden;
}
#flamechart-canvas{display:block;width:100%;height:100%}
#flamechart-hint{
  position:absolute;bottom:2px;right:6px;font-size:9px;color:var(--fg3);
  pointer-events:none;
}

/* ── main content: health + problems ── */
#content{display:flex;flex:1;overflow:hidden}
#main-panel{flex:1;display:flex;flex-direction:column;overflow:hidden}
#detail-panel{flex:0 0 320px;background:var(--bg2);border-left:1px solid var(--border);overflow:auto;display:none}
#detail-panel.active{display:flex;flex-direction:column}

/* ── health summary section ── */
#health-section{
  padding:12px;background:var(--bg);border-bottom:1px solid var(--border);flex-shrink:0;
}
#health-title{
  font-size:11px;font-weight:600;color:var(--fg2);margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px;
}
#health-message{
  font-size:12px;color:var(--fg);line-height:1.5;margin-bottom:8px;
}
#health-message.error{color:var(--red)}
#health-message.warning{color:var(--amber)}
#health-message.ok{color:var(--green)}
.issue-badge{
  display:inline-block;padding:1px 6px;border-radius:2px;font-size:10px;
  font-weight:600;margin-right:4px;margin-bottom:4px;
}
.issue-badge.error{background:#7f1d1d;color:var(--red)}
.issue-badge.warning{background:#78350f;color:var(--amber)}

#budget-info{
  font-size:11px;color:var(--fg2);padding:6px 0 0;
  border-top:1px solid var(--border);padding-top:8px;
}
.budget-line{margin-bottom:6px;display:flex;gap:8px;align-items:center}
.budget-label{flex:0 0 60px;color:var(--fg3)}
.budget-bar-container{flex:1;height:8px;background:var(--bg3);border-radius:2px;overflow:hidden}
.budget-bar{height:100%;border-radius:2px;display:flex;align-items:center;justify-content:flex-end;padding-right:4px;font-size:9px;color:var(--fg2)}
.budget-bar.ri{background:var(--cyan)}
.budget-bar.ci{background:var(--purple)}
.budget-value{flex:0 0 50px;text-align:right;color:var(--fg);font-weight:600}

/* ── problem objects list ── */
#problems-section{
  flex:1;overflow:auto;padding:8px;display:flex;flex-direction:column;
}
#problems-title{
  font-size:11px;font-weight:600;color:var(--fg2);margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px;
  position:sticky;top:0;background:var(--bg);padding-bottom:4px;z-index:10;
}
.problem-item{
  background:var(--bg2);border:1px solid var(--border);border-radius:3px;
  padding:6px;margin-bottom:6px;cursor:pointer;transition:background 0.15s;
}
.problem-item:hover{background:var(--bg3)}
.problem-item.selected{border-color:var(--cyan);background:var(--bg3)}
.problem-header{
  display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4px;
}
.problem-label{
  font-size:11px;font-weight:600;color:var(--fg);word-break:break-word;flex:1;
}
.problem-cost{
  font-size:10px;color:var(--amber);font-weight:600;flex-shrink:0;margin-left:4px;
}
.problem-severity{
  font-size:11px;font-weight:700;flex-shrink:0;margin-left:4px;
}
.problem-severity.high{color:var(--red)}
.problem-severity.medium{color:var(--amber)}
.problem-info{
  font-size:10px;color:var(--fg3);line-height:1.3;
}
.empty-problems{
  color:var(--fg3);font-size:11px;text-align:center;padding:24px 0;
}

/* ── detail panel ── */
#detail-content{flex:1;overflow:auto;padding:12px}
.detail-section{
  margin-bottom:12px;
}
.detail-label{
  font-size:10px;font-weight:600;color:var(--fg2);text-transform:uppercase;letter-spacing:.5px;
  margin-bottom:4px;
}
.detail-value{
  font-size:11px;color:var(--fg);margin-bottom:4px;
}
.detail-bar-row{
  display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;font-size:10px;
}
.detail-bar-label{color:var(--fg3)}
.detail-bar-value{color:var(--fg);font-weight:600}
.detail-bar{
  width:100%;height:6px;background:var(--bg3);border-radius:2px;margin:4px 0;overflow:hidden;
}
.detail-bar-fill{height:100%;border-radius:2px;display:flex;align-items:center;padding:0 2px;font-size:8px;color:#000;font-weight:600}
.detail-bar-fill.ri{background:var(--cyan)}
.detail-bar-fill.ci{background:var(--purple)}
.detail-issues{
  background:var(--bg3);border:1px solid var(--border);border-radius:3px;
  padding:6px;margin-bottom:8px;
}
.detail-issue{
  margin-bottom:6px;padding-bottom:6px;border-bottom:1px solid var(--border);
}
.detail-issue:last-child{border-bottom:none;margin-bottom:0;padding-bottom:0}
.detail-issue-code{
  font-size:10px;font-weight:700;color:var(--fg);margin-bottom:2px;
}
.detail-issue-msg{
  font-size:10px;color:var(--fg2);margin-bottom:2px;line-height:1.3;
}
.detail-issue-fix{
  font-size:10px;color:var(--green);margin-bottom:2px;
}

/* ── pipeline section (collapsible waterfall) ── */
#pipeline-section{
  border-top:1px solid var(--border);padding:0;flex-shrink:0;
  max-height:200px;background:var(--bg);overflow:auto;
}
#pipeline-toggle{
  display:flex;align-items:center;gap:6px;padding:8px 12px;cursor:pointer;
  user-select:none;background:var(--bg2);border-bottom:1px solid var(--border);
}
#pipeline-toggle:hover{background:var(--bg3)}
#pipeline-caret{
  width:10px;height:10px;display:inline-block;transition:transform 0.15s;
}
#pipeline-caret.collapsed{transform:rotate(-90deg)}
#pipeline-title{
  font-size:11px;font-weight:600;color:var(--fg);text-transform:uppercase;letter-spacing:.5px;
}
#pipeline-content{
  padding:8px;display:none;
}
#pipeline-content.expanded{display:block}
#waterfall-table{width:100%;border-collapse:collapse;font-size:10px}
#waterfall-table th{
  position:sticky;top:0;background:var(--bg3);color:var(--fg2);
  text-align:left;padding:3px 6px;font-weight:500;border-bottom:1px solid var(--border);
}
#waterfall-table td{padding:2px 6px;border-bottom:1px solid #1e1e1e}
#waterfall-table tr:hover{background:var(--bg3)}
.waterfall-bar{height:8px;background:var(--fg3);border-radius:1px;min-width:1px;width:100%;max-width:100px}
.badge{
  display:inline-block;padding:1px 4px;border-radius:2px;font-size:9px;
  font-weight:600;margin-right:2px;
}
.badge-blend{background:#78350f;color:var(--amber)}
.badge-stencil{background:#7f1d1d;color:var(--red)}
.badge-fbo{background:#581c87;color:var(--purple)}
.badge-program{background:#1e3a5f;color:var(--blue)}

/* ── thumbnail tooltip ── */
#thumb-tooltip{
  display:none;position:fixed;z-index:100;pointer-events:none;
  background:var(--bg2);border:1px solid var(--border);border-radius:4px;
  padding:4px;box-shadow:0 4px 12px rgba(0,0,0,.5);
  max-width:172px;
}
#thumb-tooltip img{display:block;width:160px;height:90px;object-fit:contain;background:var(--bg);border-radius:2px;image-rendering:auto}
#thumb-tooltip .thumb-info{
  font-size:9px;color:var(--fg3);padding:3px 0 0;white-space:nowrap;text-align:center;
}
#thumb-tooltip .thumb-none{
  width:160px;height:90px;display:flex;align-items:center;justify-content:center;
  color:var(--fg3);font-size:9px;background:var(--bg);border-radius:2px;
}
</style>
</head>
<body>
<div id="app">
  <header>
    <div id="connection" title="Disconnected"></div>
    <h1>pixi-crawler</h1>
    <canvas id="fps-mini"></canvas>
    <span id="mode-badge" class="live">LIVE</span>
    <span id="frame-counter" style="font-size:11px;color:var(--fg3)">frame 0</span>
    <div class="spacer"></div>
    <button id="btn-pause" title="Space">Pause</button>
  </header>
  <div id="stats-bar">
    <span>FPS <span class="val" id="s-fps">-</span></span>
    <span>DT <span class="val" id="s-dt">-</span></span>
    <span>DC <span class="val" id="s-dc">-</span></span>
    <span>Nodes <span class="val" id="s-nodes">-</span></span>
    <span>Visible <span class="val" id="s-vis">-</span></span>
    <span>Issues <span class="val" id="s-issues">-</span></span>
  </div>
  <div id="flamechart-strip">
    <canvas id="flamechart-canvas"></canvas>
    <div id="flamechart-hint">← → step · Space pause · Home/End jump</div>
  </div>
  <div id="content">
    <div id="main-panel">
      <div id="health-section">
        <div id="health-title">Frame Health</div>
        <div id="health-message">—</div>
        <div id="budget-info"></div>
      </div>
      <div id="problems-section">
        <div id="problems-title">Problem Objects</div>
        <div id="problems-list"></div>
      </div>
      <div id="pipeline-section">
        <div id="pipeline-toggle">
          <span id="pipeline-caret" class="collapsed">▶</span>
          <span id="pipeline-title">Rendering Pipeline</span>
        </div>
        <div id="pipeline-content">
          <table id="waterfall-table">
            <thead><tr>
              <th style="width:30px">#</th>
              <th style="width:70px">type</th>
              <th style="width:60px">verts</th>
              <th style="width:80px">bar</th>
              <th>breaks</th>
            </tr></thead>
            <tbody id="waterfall-body"></tbody>
          </table>
          <div id="waterfall-empty" class="empty-state" style="font-size:10px;padding:8px;text-align:center;color:var(--fg3)">Waiting for data…</div>
        </div>
      </div>
    </div>
    <div id="detail-panel">
      <div id="detail-content"></div>
    </div>
  </div>
</div>
<div id="thumb-tooltip">
  <img id="thumb-img" alt="">
  <div class="thumb-none" id="thumb-none">no preview</div>
  <div class="thumb-info" id="thumb-info"></div>
</div>

<script>
(function(){
  const ISSUE_IMPACT = ${issueImpactJSON};
  const ISSUE_EXPLAIN = ${issueExplainJSON};

  const channel = new BroadcastChannel('pixi-crawler');

  // ── DOM Elements ──
  const connDot = document.getElementById('connection');
  const btnPause = document.getElementById('btn-pause');
  const modeBadge = document.getElementById('mode-badge');
  const frameCounter = document.getElementById('frame-counter');
  const sFps = document.getElementById('s-fps');
  const sDt = document.getElementById('s-dt');
  const sDc = document.getElementById('s-dc');
  const sNodes = document.getElementById('s-nodes');
  const sVis = document.getElementById('s-vis');
  const sIssues = document.getElementById('s-issues');
  const healthSection = document.getElementById('health-section');
  const healthTitle = document.getElementById('health-title');
  const healthMessage = document.getElementById('health-message');
  const budgetInfo = document.getElementById('budget-info');
  const problemsList = document.getElementById('problems-list');
  const detailPanel = document.getElementById('detail-panel');
  const detailContent = document.getElementById('detail-content');
  const pipelineToggle = document.getElementById('pipeline-toggle');
  const pipelineCaret = document.getElementById('pipeline-caret');
  const pipelineContent = document.getElementById('pipeline-content');
  const waterfallBody = document.getElementById('waterfall-body');
  const waterfallEmpty = document.getElementById('waterfall-empty');
  const fpsMiniCanvas = document.getElementById('fps-mini');
  const fpsCtx = fpsMiniCanvas.getContext('2d');
  const flamechartStrip = document.getElementById('flamechart-strip');
  const flamechartCanvas = document.getElementById('flamechart-canvas');
  const flameCtx = flamechartCanvas.getContext('2d');
  const thumbTooltip = document.getElementById('thumb-tooltip');
  const thumbImg = document.getElementById('thumb-img');
  const thumbNone = document.getElementById('thumb-none');
  const thumbInfo = document.getElementById('thumb-info');

  // ── State ──
  let mode = 'live';
  let fpsHistory = [];
  const FPS_HISTORY_SIZE = 120;
  let selectedProblemIdx = -1;
  let pipelineCollapsed = true;

  // ── Frame buffer ──
  const BUFFER_CAP = 600;
  const frameBuffer = new Array(BUFFER_CAP);
  let bufferHead = 0;
  let bufferCount = 0;
  let selectedIndex = -1;
  let flameDirty = true;

  function bufferPush(data) {
    frameBuffer[bufferHead] = data;
    bufferHead = (bufferHead + 1) % BUFFER_CAP;
    if (bufferCount < BUFFER_CAP) bufferCount++;
  }

  function bufferGet(logicalIndex) {
    if (logicalIndex < 0 || logicalIndex >= bufferCount) return null;
    var start = (bufferHead - bufferCount + BUFFER_CAP) % BUFFER_CAP;
    return frameBuffer[(start + logicalIndex) % BUFFER_CAP];
  }

  function bufferNewest() {
    return bufferCount > 0 ? bufferGet(bufferCount - 1) : null;
  }

  // ── IndexedDB for thumbnails ──
  var thumbDb = null;
  var thumbMemCache = {};
  var thumbFrameSet = {};
  var thumbCleanupTimer = 0;

  (function initThumbDb() {
    try {
      var req = indexedDB.open('pixi-crawler-thumbs', 1);
      req.onupgradeneeded = function(e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains('thumbs')) {
          db.createObjectStore('thumbs', { keyPath: 'frame' });
        }
      };
      req.onsuccess = function(e) { thumbDb = e.target.result; };
      req.onerror = function() { };
    } catch(e) { }
  })();

  function storeThumb(frame, dataUrl) {
    thumbMemCache[frame] = dataUrl;
    thumbFrameSet[frame] = true;
    if (!thumbDb) return;
    try {
      var tx = thumbDb.transaction('thumbs', 'readwrite');
      tx.objectStore('thumbs').put({ frame: frame, dataUrl: dataUrl });
    } catch(e) { }
  }

  function getThumbUrl(frame) {
    if (thumbMemCache[frame]) return thumbMemCache[frame];
    for (var i = 1; i <= 10; i++) {
      if (thumbMemCache[frame - i]) return thumbMemCache[frame - i];
    }
    return null;
  }

  function cleanupOldThumbs() {
    if (bufferCount === 0) return;
    var oldest = bufferGet(0);
    if (!oldest) return;
    var cutoff = oldest.frame;
    var keys = Object.keys(thumbMemCache);
    for (var i = 0; i < keys.length; i++) {
      var k = Number(keys[i]);
      if (k < cutoff) {
        delete thumbMemCache[k];
        delete thumbFrameSet[k];
      }
    }
  }

  // ── FPS mini-graph ──
  function initFpsMini() {
    var dpr = window.devicePixelRatio || 1;
    fpsMiniCanvas.width = 120 * dpr;
    fpsMiniCanvas.height = 20 * dpr;
    fpsCtx.scale(dpr, dpr);
  }
  initFpsMini();

  function drawFpsMini() {
    var w = 120, h = 20;
    fpsCtx.clearRect(0, 0, w, h);
    if (fpsHistory.length < 2) return;
    var y30 = h - (30 / 120) * h;
    fpsCtx.strokeStyle = '#333';
    fpsCtx.lineWidth = 1;
    fpsCtx.beginPath();
    fpsCtx.moveTo(0, y30);
    fpsCtx.lineTo(w, y30);
    fpsCtx.stroke();
    fpsCtx.strokeStyle = '#22c55e';
    fpsCtx.lineWidth = 1;
    fpsCtx.beginPath();
    var step = w / (FPS_HISTORY_SIZE - 1);
    var off = FPS_HISTORY_SIZE - fpsHistory.length;
    for (var i = 0; i < fpsHistory.length; i++) {
      var x = (off + i) * step;
      var y = h - (Math.min(fpsHistory[i], 120) / 120) * h;
      if (i === 0) fpsCtx.moveTo(x, y); else fpsCtx.lineTo(x, y);
    }
    fpsCtx.stroke();
  }

  // ── Connection status ──
  var lastMsgTime = 0;
  function checkConnection() {
    var connected = Date.now() - lastMsgTime < 2000;
    connDot.classList.toggle('connected', connected);
    connDot.title = connected ? 'Connected' : 'Disconnected';
  }
  setInterval(checkConnection, 500);

  // ── Mode helpers ──
  function setMode(m) {
    mode = m;
    modeBadge.textContent = m === 'live' ? 'LIVE' : 'INSPECT';
    modeBadge.className = m;
    btnPause.textContent = m === 'live' ? 'Pause' : 'Resume';
    btnPause.classList.toggle('active', m === 'inspect');
    flameDirty = true;
  }

  function escHtml(s) { var d = String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); return d.replace(/\x22/g,'&quot;'); }

  // ── Render health summary ──
  function renderHealth(d) {
    if (!d) {
      healthMessage.textContent = '—';
      healthMessage.className = '';
      budgetInfo.innerHTML = '';
      return;
    }

    var errorCount = 0, warningCount = 0;
    if (d.issues) {
      for (var i = 0; i < d.issues.length; i++) {
        if (d.issues[i].severity === 'error') errorCount++;
        else if (d.issues[i].severity === 'warning') warningCount++;
      }
    }

    var msgText = '';
    var msgClass = 'ok';
    if (errorCount > 0) {
      msgText = errorCount + ' error' + (errorCount !== 1 ? 's' : '');
      if (warningCount > 0) msgText += ', ' + warningCount + ' warning' + (warningCount !== 1 ? 's' : '');
      msgClass = 'error';
    } else if (warningCount > 0) {
      msgText = warningCount + ' warning' + (warningCount !== 1 ? 's' : '');
      msgClass = 'warning';
    } else {
      msgText = 'Frame is healthy';
      msgClass = 'ok';
    }
    healthMessage.textContent = msgText;
    healthMessage.className = msgClass;

    var budgetHtml = '';
    if (d.aggregateBudget) {
      var agg = d.aggregateBudget;
      var total = (agg.totalRI || 0) + (agg.totalCI || 0);
      var riPct = total > 0 ? ((agg.totalRI || 0) / total) * 100 : 50;
      var ciPct = total > 0 ? ((agg.totalCI || 0) / total) * 100 : 50;
      var levelClass = agg.level === 'high' ? 'error' : agg.level === 'moderate' ? 'warning' : 'ok';

      budgetHtml += '<div class="budget-line">';
      budgetHtml += '<div class="budget-label">RI</div>';
      budgetHtml += '<div class="budget-bar-container"><div class="budget-bar ri" style="width:' + riPct + '%">' + (agg.totalRI || 0).toFixed(1) + '</div></div>';
      budgetHtml += '<div class="budget-value">' + (agg.totalRI || 0).toFixed(1) + '</div>';
      budgetHtml += '</div>';
      budgetHtml += '<div class="budget-line">';
      budgetHtml += '<div class="budget-label">CI</div>';
      budgetHtml += '<div class="budget-bar-container"><div class="budget-bar ci" style="width:' + ciPct + '%">' + (agg.totalCI || 0).toFixed(1) + '</div></div>';
      budgetHtml += '<div class="budget-value">' + (agg.totalCI || 0).toFixed(1) + '</div>';
      budgetHtml += '</div>';
      budgetHtml += '<div style="font-size:10px;color:var(--fg2);margin-top:6px">';
      budgetHtml += 'Total: ' + total.toFixed(1) + ' (' + (agg.spineCount || 0) + ' spines)';
      budgetHtml += '</div>';
    }
    budgetInfo.innerHTML = budgetHtml;
  }

  // ── Render problem objects ──
  function renderProblems(d) {
    if (!d || !d.problemNodes || d.problemNodes.length === 0) {
      problemsList.innerHTML = '<div class="empty-problems">No problem objects detected</div>';
      return;
    }

    var html = '';
    for (var i = 0; i < d.problemNodes.length; i++) {
      var node = d.problemNodes[i];
      var severity = node.issues && node.issues.length > 0 ? (node.issues[0].severity === 'error' ? 'high' : 'medium') : 'low';
      var selected = i === selectedProblemIdx ? ' selected' : '';
      html += '<div class="problem-item' + selected + '" data-idx="' + i + '">';
      html += '<div class="problem-header">';
      html += '<div class="problem-label">' + escHtml(node.label || 'unknown') + '</div>';
      html += '<div class="problem-cost">' + (node.drawCalls || 0) + 'dc</div>';
      html += '<div class="problem-severity ' + severity + '">' + (severity === 'high' ? '!!' : severity === 'medium' ? '!' : '') + '</div>';
      html += '</div>';
      var infoLines = [];
      if (node.boundsW && node.boundsH) {
        infoLines.push('size: ' + Math.round(node.boundsW) + 'x' + Math.round(node.boundsH));
      }
      if (node.ri !== undefined && node.ci !== undefined) {
        infoLines.push('budget: ' + node.ri.toFixed(1) + ' RI, ' + node.ci.toFixed(1) + ' CI');
      }
      if (node.masked) infoLines.push('masked');
      if (node.filtered) infoLines.push('filtered');
      if (node.blendBreak) infoLines.push('blend break');
      if (infoLines.length > 0) {
        html += '<div class="problem-info">' + infoLines.join(' · ') + '</div>';
      }
      html += '</div>';
    }
    problemsList.innerHTML = html;

    // Add click handlers
    var items = problemsList.querySelectorAll('.problem-item');
    for (var i = 0; i < items.length; i++) {
      items[i].addEventListener('click', function() {
        selectedProblemIdx = parseInt(this.getAttribute('data-idx'));
        renderProblems(currentFrame);
        renderDetail(currentFrame, selectedProblemIdx);
      });
    }
  }

  // ── Render detail panel ──
  var currentFrame = null;
  function renderDetail(d, idx) {
    if (!d || !d.problemNodes || idx < 0 || idx >= d.problemNodes.length) {
      detailPanel.classList.remove('active');
      return;
    }

    detailPanel.classList.add('active');
    var node = d.problemNodes[idx];
    var html = '';

    // Node name
    html += '<div class="detail-section">';
    html += '<div class="detail-label">Node</div>';
    html += '<div class="detail-value">' + escHtml(node.label || 'unknown') + '</div>';
    html += '</div>';

    // Kind
    if (node.kind) {
      html += '<div class="detail-section">';
      html += '<div class="detail-label">Type</div>';
      html += '<div class="detail-value">' + escHtml(node.kind) + '</div>';
      html += '</div>';
    }

    // Dimensions
    if (node.boundsW && node.boundsH) {
      html += '<div class="detail-section">';
      html += '<div class="detail-label">Size</div>';
      html += '<div class="detail-value">' + Math.round(node.boundsW) + ' × ' + Math.round(node.boundsH) + ' px</div>';
      html += '</div>';
    }

    // Draw calls & slots
    html += '<div class="detail-section">';
    html += '<div class="detail-bar-row"><div class="detail-bar-label">Draw Calls</div><div class="detail-bar-value">' + (node.drawCalls || 0) + '</div></div>';
    if (node.activeSlots !== undefined && node.totalSlots !== undefined) {
      html += '<div class="detail-bar-row"><div class="detail-bar-label">Slots</div><div class="detail-bar-value">' + node.activeSlots + ' / ' + node.totalSlots + '</div></div>';
    }
    html += '</div>';

    // Budget bars
    if (node.ri !== undefined || node.ci !== undefined) {
      html += '<div class="detail-section">';
      html += '<div class="detail-label">Budget</div>';
      var total = (node.ri || 0) + (node.ci || 0);
      var riPct = total > 0 ? ((node.ri || 0) / total) * 100 : 50;
      var ciPct = total > 0 ? ((node.ci || 0) / total) * 100 : 50;
      html += '<div class="detail-bar-row"><div class="detail-bar-label">RI</div><div class="detail-bar-value">' + (node.ri || 0).toFixed(1) + '</div></div>';
      html += '<div class="detail-bar"><div class="detail-bar-fill ri" style="width:' + riPct + '%"></div></div>';
      html += '<div class="detail-bar-row"><div class="detail-bar-label">CI</div><div class="detail-bar-value">' + (node.ci || 0).toFixed(1) + '</div></div>';
      html += '<div class="detail-bar"><div class="detail-bar-fill ci" style="width:' + ciPct + '%"></div></div>';
      html += '</div>';
    }

    // Rendering info
    if (node.blendTransitions || node.atlasPageSwitches || node.atlasPages) {
      html += '<div class="detail-section">';
      html += '<div class="detail-label">Rendering</div>';
      if (node.blendTransitions) {
        html += '<div class="detail-value">Blend transitions: ' + node.blendTransitions + '</div>';
      }
      if (node.atlasPageSwitches) {
        html += '<div class="detail-value">Atlas switches: ' + node.atlasPageSwitches + '</div>';
      }
      if (node.atlasPages) {
        html += '<div class="detail-value">Atlas pages: ' + (Array.isArray(node.atlasPages) ? node.atlasPages.join(', ') : node.atlasPages) + '</div>';
      }
      html += '</div>';
    }

    // Issues
    if (node.issues && node.issues.length > 0) {
      html += '<div class="detail-section">';
      html += '<div class="detail-label">Issues</div>';
      html += '<div class="detail-issues">';
      for (var i = 0; i < node.issues.length; i++) {
        var issue = node.issues[i];
        html += '<div class="detail-issue">';
        html += '<div class="detail-issue-code">' + escHtml(issue.code || issue.message || 'unknown') + '</div>';
        var explain = ISSUE_EXPLAIN[issue.code];
        if (explain) {
          html += '<div class="detail-issue-msg">' + escHtml(explain.what) + '</div>';
          html += '<div class="detail-issue-fix">→ ' + escHtml(explain.fix) + '</div>';
        } else if (issue.message) {
          html += '<div class="detail-issue-msg">' + escHtml(issue.message) + '</div>';
        }
        html += '</div>';
      }
      html += '</div>';
      html += '</div>';
    }

    detailContent.innerHTML = html;
  }

  // ── Render waterfall ──
  function renderWaterfall(waterfall) {
    if (!waterfall || waterfall.length === 0) {
      waterfallBody.innerHTML = '';
      waterfallEmpty.style.display = '';
      return;
    }
    waterfallEmpty.style.display = 'none';

    var maxVerts = 1;
    for (var i = 0; i < waterfall.length; i++) {
      if (waterfall[i].vertexCount > maxVerts) maxVerts = waterfall[i].vertexCount;
    }

    var rows = '';
    for (var i = 0; i < waterfall.length; i++) {
      var e = waterfall[i];
      var pct = Math.max(1, (e.vertexCount / maxVerts) * 100);
      var breakBadges = '';
      if (e.breaks) {
        for (var j = 0; j < e.breaks.length; j++) {
          var b = e.breaks[j];
          var badgeClass = 'badge ' + (b.type === 'blend' ? 'badge-blend' : b.type === 'stencil' ? 'badge-stencil' : b.type === 'fbo' ? 'badge-fbo' : 'badge-program');
          breakBadges += '<span class="' + badgeClass + '" title="' + escHtml(b.detail || '') + '">' + b.type + '</span>';
        }
      }
      var typeLabel = e.drawType === 'elementsInstanced' ? 'inst' : e.drawType === 'elements' ? 'elem' : 'arr';
      rows += '<tr>';
      rows += '<td style="color:var(--fg3)">' + e.index + '</td>';
      rows += '<td>' + typeLabel + '</td>';
      rows += '<td style="text-align:right">' + e.vertexCount.toLocaleString() + '</td>';
      rows += '<td><div class="waterfall-bar" style="width:' + pct + '%"></div></td>';
      rows += '<td>' + (breakBadges || '<span style="color:var(--fg3)">—</span>') + '</td>';
      rows += '</tr>';
    }
    waterfallBody.innerHTML = rows;
  }

  // ── Show frame ──
  function showFrame(d) {
    if (!d) return;
    currentFrame = d;

    sFps.textContent = d.fps.toFixed(1);
    sDt.textContent = d.dt.toFixed(1) + 'ms';
    sDc.textContent = d.drawCalls;
    sNodes.textContent = d.nodeCount;
    sVis.textContent = d.visibleNodes;
    sIssues.textContent = d.issueCount;

    sFps.style.color = d.fps < 30 ? 'var(--red)' : d.fps < 55 ? 'var(--amber)' : 'var(--green)';

    if (mode === 'live') {
      frameCounter.textContent = 'LIVE frame ' + d.frame;
    } else {
      frameCounter.textContent = 'INSPECT frame ' + d.frame + ' (' + (selectedIndex + 1) + '/' + bufferCount + ')';
    }

    renderHealth(d);
    renderProblems(d);
    if (selectedProblemIdx >= 0) {
      renderDetail(d, selectedProblemIdx);
    }
    renderWaterfall(d.waterfall);
  }

  function selectFrame(logicalIdx) {
    if (logicalIdx < 0) logicalIdx = 0;
    if (logicalIdx >= bufferCount) logicalIdx = bufferCount - 1;
    if (bufferCount === 0) return;
    selectedIndex = logicalIdx;
    selectedProblemIdx = -1;
    flameDirty = true;
    showFrame(bufferGet(logicalIdx));
  }

  // ── Pause / Resume ──
  btnPause.addEventListener('click', function() {
    if (mode === 'live') {
      setMode('inspect');
      selectedIndex = bufferCount - 1;
      selectFrame(selectedIndex);
    } else {
      setMode('live');
      var newest = bufferNewest();
      if (newest) showFrame(newest);
    }
  });

  // ── Pipeline toggle ──
  pipelineToggle.addEventListener('click', function() {
    pipelineCollapsed = !pipelineCollapsed;
    pipelineCaret.classList.toggle('collapsed', pipelineCollapsed);
    pipelineContent.classList.toggle('expanded', !pipelineCollapsed);
  });

  // ── Keyboard shortcuts ──
  document.addEventListener('keydown', function(e) {
    var tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    switch (e.key) {
      case ' ':
        e.preventDefault();
        btnPause.click();
        break;
      case 'ArrowLeft':
        e.preventDefault();
        if (mode === 'live') {
          setMode('inspect');
          selectedIndex = bufferCount - 1;
        }
        selectFrame(selectedIndex - 1);
        break;
      case 'ArrowRight':
        e.preventDefault();
        if (mode === 'live') return;
        if (selectedIndex >= bufferCount - 1) {
          setMode('live');
          var newest = bufferNewest();
          if (newest) showFrame(newest);
        } else {
          selectFrame(selectedIndex + 1);
        }
        break;
      case 'Home':
        e.preventDefault();
        if (mode === 'live') setMode('inspect');
        selectFrame(0);
        break;
      case 'End':
        e.preventDefault();
        setMode('live');
        selectedIndex = bufferCount - 1;
        var newest = bufferNewest();
        if (newest) showFrame(newest);
        flameDirty = true;
        break;
    }
  });

  // ── Flamechart ──
  var flameDpr = window.devicePixelRatio || 1;
  var flameW = 0;
  var flameH = 60;

  function hitTestFlame(clientX) {
    if (bufferCount === 0) return -1;
    var rect = flamechartCanvas.getBoundingClientRect();
    var mx = clientX - rect.left;
    var barW = Math.max(2, flameW / bufferCount);
    var visibleFrames = Math.min(bufferCount, Math.floor(flameW / barW));
    var startIdx;
    if (mode === 'live') {
      startIdx = Math.max(0, bufferCount - visibleFrames);
    } else {
      startIdx = Math.max(0, Math.min(selectedIndex - Math.floor(visibleFrames / 2), bufferCount - visibleFrames));
    }
    var idx = startIdx + Math.floor(mx / barW);
    if (idx < 0) idx = 0;
    if (idx >= bufferCount) idx = bufferCount - 1;
    return idx;
  }

  function resizeFlamechart() {
    var rect = flamechartStrip.getBoundingClientRect();
    flameW = rect.width;
    flamechartCanvas.width = flameW * flameDpr;
    flamechartCanvas.height = flameH * flameDpr;
    flamechartCanvas.style.width = flameW + 'px';
    flamechartCanvas.style.height = flameH + 'px';
    flameCtx.setTransform(flameDpr, 0, 0, flameDpr, 0, 0);
    flameDirty = true;
  }
  resizeFlamechart();
  window.addEventListener('resize', resizeFlamechart);

  function drawFlamechart() {
    if (!flameDirty) return;
    flameDirty = false;
    var ctx = flameCtx;
    ctx.clearRect(0, 0, flameW, flameH);
    if (bufferCount === 0) return;

    var barW = Math.max(2, flameW / bufferCount);
    var visibleFrames = Math.min(bufferCount, Math.floor(flameW / barW));
    var startIdx;
    if (mode === 'live') {
      startIdx = Math.max(0, bufferCount - visibleFrames);
    } else {
      startIdx = Math.max(0, Math.min(selectedIndex - Math.floor(visibleFrames / 2), bufferCount - visibleFrames));
    }

    var maxTotal = 1;
    for (var i = startIdx; i < startIdx + visibleFrames && i < bufferCount; i++) {
      var f = bufferGet(i);
      if (f && f.timing && f.timing.totalMs > maxTotal) maxTotal = f.timing.totalMs;
    }
    if (maxTotal < 16.67) maxTotal = 16.67;

    for (var i = startIdx; i < startIdx + visibleFrames && i < bufferCount; i++) {
      var f = bufferGet(i);
      if (!f) continue;
      var x = (i - startIdx) * barW;
      var timing = f.timing;
      var totalNorm = timing ? (timing.totalMs / maxTotal) : (f.dt / maxTotal);
      var totalH = Math.max(2, totalNorm * (flameH - 4));
      var barY = flameH - totalH;

      if (timing) {
        var scanH = (timing.scanMs / maxTotal) * (flameH - 4);
        var overlayH = (timing.overlayMs / maxTotal) * (flameH - 4);
        var otherH = totalH - scanH - overlayH;
        if (otherH < 0) otherH = 0;
        var cy = flameH;
        if (otherH > 0) {
          ctx.fillStyle = '#444';
          cy -= otherH;
          ctx.fillRect(x + 0.5, cy, barW - 1, otherH);
        }
        if (overlayH > 0) {
          ctx.fillStyle = '#3b82f6';
          cy -= overlayH;
          ctx.fillRect(x + 0.5, cy, barW - 1, overlayH);
        }
        if (scanH > 0) {
          ctx.fillStyle = '#06b6d4';
          cy -= scanH;
          ctx.fillRect(x + 0.5, cy, barW - 1, scanH);
        }
      } else {
        ctx.fillStyle = '#444';
        ctx.fillRect(x + 0.5, barY, barW - 1, totalH);
      }

      if (f.fps < 30) {
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(x + 0.5, flameH - 2, barW - 1, 2);
      }

      if (i === selectedIndex && mode === 'inspect') {
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 0.5, barY, barW - 1, totalH);
      }
    }

    var threshold30 = (16.67 / maxTotal) * (flameH - 4);
    if (threshold30 < flameH - 2) {
      ctx.strokeStyle = 'rgba(239,68,68,0.3)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(0, flameH - threshold30);
      ctx.lineTo(flameW, flameH - threshold30);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  flamechartCanvas.addEventListener('click', function(e) {
    var idx = hitTestFlame(e.clientX);
    if (idx < 0) return;
    if (mode === 'live') setMode('inspect');
    selectFrame(idx);
  });

  var hoveredFrame = -1;
  flamechartCanvas.addEventListener('mousemove', function(e) {
    var idx = hitTestFlame(e.clientX);
    if (idx < 0) { thumbTooltip.style.display = 'none'; hoveredFrame = -1; return; }
    var f = bufferGet(idx);
    if (!f) { thumbTooltip.style.display = 'none'; hoveredFrame = -1; return; }
    var rect = flamechartStrip.getBoundingClientRect();
    var tx = Math.min(e.clientX - 86, window.innerWidth - 180);
    if (tx < 4) tx = 4;
    thumbTooltip.style.display = 'block';
    thumbTooltip.style.left = tx + 'px';
    thumbTooltip.style.bottom = 'auto';
    var tooltipH = thumbTooltip.offsetHeight || 100;
    var aboveY = rect.top - tooltipH - 6;
    if (aboveY < 4) {
      thumbTooltip.style.top = (rect.bottom + 6) + 'px';
    } else {
      thumbTooltip.style.top = aboveY + 'px';
    }
    var info = 'frame ' + f.frame + '  |  ' + f.fps.toFixed(1) + ' fps  |  ' + f.dt.toFixed(1) + 'ms';
    if (f.timing) info += '  |  scan ' + f.timing.scanMs.toFixed(1) + 'ms';
    thumbInfo.textContent = info;
    if (f.frame !== hoveredFrame) {
      hoveredFrame = f.frame;
      var url = getThumbUrl(f.frame);
      if (url) {
        thumbImg.src = url;
        thumbImg.style.display = 'block';
        thumbNone.style.display = 'none';
      } else {
        thumbImg.style.display = 'none';
        thumbNone.style.display = 'flex';
      }
    }
  });

  flamechartCanvas.addEventListener('mouseleave', function() {
    thumbTooltip.style.display = 'none';
    hoveredFrame = -1;
  });

  function flameLoop() {
    drawFlamechart();
    requestAnimationFrame(flameLoop);
  }
  requestAnimationFrame(flameLoop);

  // ── Channel listener ──
  channel.onmessage = function(ev) {
    if (!ev.data) return;
    if (ev.data.type === 'thumbnail') {
      storeThumb(ev.data.frame, ev.data.dataUrl);
      if (bufferCount >= BUFFER_CAP) {
        clearTimeout(thumbCleanupTimer);
        thumbCleanupTimer = setTimeout(cleanupOldThumbs, 2000);
      }
      return;
    }
    if (ev.data.type !== 'frame') return;
    lastMsgTime = Date.now();
    var d = ev.data.data;
    bufferPush(d);
    flameDirty = true;
    fpsHistory.push(d.fps);
    if (fpsHistory.length > FPS_HISTORY_SIZE) fpsHistory.shift();
    drawFpsMini();
    if (mode === 'live') {
      selectedIndex = bufferCount - 1;
      showFrame(d);
    }
  };

  channel.postMessage({ type: 'panel-ready' });
})();
</script>
</body>
</html>`;

    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const w = globalThis.open(url, 'pixi-crawler-panel');
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    return w;
}
