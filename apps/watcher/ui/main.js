/**
 * Spine Watcher - Frontend UI
 *
 * Communicates with the Node.js sidecar via Tauri's shell plugin.
 * Reads JSONL events from sidecar stdout, sends commands via stdin.
 */

// Tauri API imports (loaded at runtime from the Tauri webview context)
const { Command } = window.__TAURI__.shell;
const { open: openDialog } = window.__TAURI__.dialog;

// DOM elements
const $ = (id) => document.getElementById(id);

const setupScreen = $('setup-screen');
const welcomeScreen = $('welcome-screen');
const metricsScreen = $('metrics-screen');
const versionWarning = $('version-warning');
const statusText = $('status-text');
const appVersion = $('app-version');
const updateBadge = $('update-badge');
const spinePathInfo = $('spine-path-info');
const spinePathValue = $('spine-path-value');

let sidecar = null;
let sidecarChild = null;

// ── Sidecar Management ──────────────────────────────────────

async function startSidecar() {
  const command = Command.sidecar('binaries/spine-watcher-sidecar');
  sidecar = command;

  command.stdout.on('data', (line) => {
    if (!line.trim()) return;
    try {
      const event = JSON.parse(line);
      handleEvent(event);
    } catch {
      console.warn('Invalid sidecar output:', line);
    }
  });

  command.stderr.on('data', (line) => {
    console.warn('Sidecar stderr:', line);
  });

  command.on('close', (data) => {
    console.log('Sidecar exited:', data.code);
    setStatus('Sidecar stopped');
  });

  command.on('error', (err) => {
    console.error('Sidecar error:', err);
    setStatus('Sidecar error');
  });

  sidecarChild = await command.spawn();
  sendCommand({ cmd: 'init' });
}

function sendCommand(cmd) {
  if (sidecarChild) {
    sidecarChild.write(JSON.stringify(cmd) + '\n');
  }
}

// ── Event Handling ──────────────────────────────────────────

function handleEvent(event) {
  switch (event.event) {
    case 'version':
      appVersion.textContent = 'v' + event.version;
      break;

    case 'update-available':
      updateBadge.textContent = 'Update: v' + event.latest;
      updateBadge.classList.remove('hidden');
      updateBadge.onclick = () => window.__TAURI__.shell.open(event.url);
      break;

    case 'spine-found':
      spinePathInfo.classList.remove('hidden');
      spinePathValue.textContent = event.path;
      showScreen('welcome');
      setStatus('Ready');
      break;

    case 'spine-not-found':
      showScreen('setup');
      setStatus('Spine CLI not found');
      break;

    case 'exporting':
      setStatus('Exporting via Spine CLI...', true);
      break;

    case 'analyzing':
      setStatus('Analyzing skeleton...', true);
      break;

    case 'metrics':
      renderMetrics(event.report, event.diff);
      showScreen('metrics');
      setStatus('Watching for changes...');
      break;

    case 'version-warning':
      $('warning-version').textContent = event.version;
      showScreen('version-warning');
      setStatus('Unsupported Spine version');
      break;

    case 'export-error':
      setStatus('Export failed: ' + event.message);
      break;

    case 'watching':
      if (metricsScreen.classList.contains('hidden')) {
        setStatus('Watching: ' + event.path);
      }
      break;

    case 'error':
      setStatus('Error: ' + event.message);
      break;

    case 'stopped':
      setStatus('Stopped');
      break;
  }
}

// ── Screen Management ───────────────────────────────────────

function showScreen(name) {
  setupScreen.classList.add('hidden');
  welcomeScreen.classList.add('hidden');
  metricsScreen.classList.add('hidden');
  versionWarning.classList.add('hidden');

  switch (name) {
    case 'setup': setupScreen.classList.remove('hidden'); break;
    case 'welcome': welcomeScreen.classList.remove('hidden'); break;
    case 'metrics': metricsScreen.classList.remove('hidden'); break;
    case 'version-warning': versionWarning.classList.remove('hidden'); break;
  }
}

function setStatus(text, spinning = false) {
  statusText.innerHTML = spinning
    ? '<span class="spinner"></span> ' + text
    : text;
}

// ── Metrics Rendering ───────────────────────────────────────

function renderMetrics(report, diff) {
  $('project-path').textContent = report.skeletonName;
  $('spine-version').textContent = report.spineVersion;
  $('last-updated').textContent = new Date().toLocaleTimeString();

  // Summary
  $('worst-ri-value').textContent = report.worstRI.cost.toFixed(2);
  $('worst-ri-badge').textContent = report.worstRI.level;
  $('worst-ri-badge').className = 'level-badge level-' + report.worstRI.level;
  $('worst-ri-anim').textContent = report.worstRI.animation;

  $('worst-ci-value').textContent = report.worstCI.cost.toFixed(2);
  $('worst-ci-badge').textContent = report.worstCI.level;
  $('worst-ci-badge').className = 'level-badge level-' + report.worstCI.level;
  $('worst-ci-anim').textContent = report.worstCI.animation;

  $('total-bones').textContent = report.totalBones;
  $('total-slots').textContent = report.totalSlots;
  $('total-anims').textContent = report.totalAnimations;
  $('total-skins').textContent = report.totalSkins;

  // Diff
  const diffSection = $('diff-section');
  const diffItems = $('diff-items');
  if (diff && Object.keys(diff).length > 0) {
    diffSection.classList.remove('hidden');
    diffItems.innerHTML = '';
    for (const [key, val] of Object.entries(diff)) {
      const isPositive = val > 0;
      const sign = isPositive ? '+' : '';
      const cls = isPositive ? 'diff-positive' : 'diff-negative';
      const formatted = typeof val === 'number' && !Number.isInteger(val)
        ? val.toFixed(2) : String(val);
      const el = document.createElement('span');
      el.className = 'diff-item ' + cls;
      el.textContent = key + ': ' + sign + formatted;
      diffItems.appendChild(el);
    }
  } else {
    diffSection.classList.add('hidden');
  }

  // Animation table
  const tbody = $('anim-tbody');
  const maxTotal = Math.max(...report.animations.map(a => a.total), 1);
  tbody.innerHTML = '';

  for (const anim of report.animations) {
    const tr = document.createElement('tr');
    const barPct = Math.min((anim.total / maxTotal) * 100, 100);
    const barColor = levelToBarColor(anim.totalLevel);

    tr.innerHTML = `
      <td class="col-name" title="${anim.name}">${truncate(anim.name, 30)}</td>
      <td class="col-num">${anim.ri.toFixed(1)}</td>
      <td class="col-num">${anim.ci.toFixed(1)}</td>
      <td class="col-num">${anim.total.toFixed(1)}</td>
      <td class="col-bar">
        <div class="impact-bar">
          <div class="impact-bar-fill" style="width:${barPct}%;background:${barColor}"></div>
        </div>
      </td>
      <td class="col-level"><span class="level-badge level-${anim.totalLevel}">${anim.totalLevel}</span></td>
    `;
    tbody.appendChild(tr);
  }
}

function levelToBarColor(level) {
  switch (level) {
    case 'minimal': case 'low': return 'var(--green)';
    case 'moderate': return 'var(--yellow)';
    case 'high': case 'very-high': return 'var(--red)';
    default: return 'var(--bar-fill)';
  }
}

function truncate(str, max) {
  return str.length > max ? str.slice(0, max - 3) + '...' : str;
}

// ── Button Handlers ─────────────────────────────────────────

$('btn-pick-spine').addEventListener('click', async () => {
  const path = await openDialog({
    title: 'Select Spine Executable',
    multiple: false,
    filters: [{
      name: 'Spine',
      extensions: ['exe', 'com', 'app', '*'],
    }],
  });
  if (path) {
    sendCommand({ cmd: 'set-spine-path', path });
  }
});

$('btn-pick-project').addEventListener('click', pickProject);
$('btn-change-project').addEventListener('click', pickProject);

async function pickProject() {
  const path = await openDialog({
    title: 'Select .spine Project',
    multiple: false,
    filters: [{
      name: 'Spine Project',
      extensions: ['spine'],
    }],
  });
  if (path) {
    setStatus('Loading project...', true);
    sendCommand({ cmd: 'watch', path });
  }
}

// ── Init ────────────────────────────────────────────────────

startSidecar().catch((err) => {
  console.error('Failed to start sidecar:', err);
  setStatus('Failed to start analysis engine: ' + err.message);
});
