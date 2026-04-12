#!/usr/bin/env node
/**
 * Spine Watcher Sidecar - JSONL protocol over stdin/stdout.
 *
 * Reads commands from stdin (one JSON per line), writes events to stdout.
 * Designed to be spawned by the Tauri shell as an external binary.
 */
import { createInterface } from 'node:readline';
import { loadConfig, saveConfig } from './config.js';
import { resolveSpinePathSilent } from './setup.js';
import { exportSpineProject } from './exporter.js';
import { watchSpineFile } from './watcher.js';
import { loadSkeleton } from './loader.js';
import { analyzeSkeletonData, type AnalysisReport } from './analyze.js';
import { checkForUpdate } from './updater.js';

// Verbose stderr logging (visible in UI log panel via sidecar stderr)
function debug(msg: string): void {
  process.stderr.write(`[sidecar] ${msg}\n`);
}

// Emit a JSON event to stdout (one line)
function emit(event: Record<string, unknown>): void {
  debug(`emit: ${event.event}`);
  process.stdout.write(JSON.stringify(event) + '\n');
}

let currentWatcher: { close: () => Promise<void> } | null = null;
let previousReport: AnalysisReport | null = null;
let spinePath: string | null = null;

// Catch uncaught errors so we know why the sidecar dies
process.on('uncaughtException', (err) => {
  debug(`FATAL uncaughtException: ${err.message}\n${err.stack}`);
  emit({ event: 'error', message: `Sidecar crash: ${err.message}` });
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  const msg = reason instanceof Error ? reason.message : String(reason);
  debug(`FATAL unhandledRejection: ${msg}`);
  emit({ event: 'error', message: `Unhandled rejection: ${msg}` });
});

function isVersionSupported(version: string): boolean {
  if (version === '(unknown)') return true;
  const parts = version.split('.');
  const major = parseInt(parts[0] ?? '0', 10);
  const minor = parseInt(parts[1] ?? '0', 10);
  return major > 4 || (major === 4 && minor >= 2);
}

function computeDiff(current: AnalysisReport, previous: AnalysisReport): Record<string, number> {
  const diff: Record<string, number> = {};
  const bonesDelta = current.totalBones - previous.totalBones;
  const slotsDelta = current.totalSlots - previous.totalSlots;
  const animsDelta = current.totalAnimations - previous.totalAnimations;
  const riDelta = current.worstRI.cost - previous.worstRI.cost;
  const ciDelta = current.worstCI.cost - previous.worstCI.cost;

  if (bonesDelta !== 0) diff.bones = bonesDelta;
  if (slotsDelta !== 0) diff.slots = slotsDelta;
  if (animsDelta !== 0) diff.animations = animsDelta;
  if (Math.abs(riDelta) > 0.01) diff.worstRI = Number(riDelta.toFixed(2));
  if (Math.abs(ciDelta) > 0.01) diff.worstCI = Number(ciDelta.toFixed(2));

  const curMaxVerts = Math.max(0, ...current.animations.map(a => a.peakVertices));
  const prevMaxVerts = Math.max(0, ...previous.animations.map(a => a.peakVertices));
  if (curMaxVerts !== prevMaxVerts) diff.peakVertices = curMaxVerts - prevMaxVerts;

  return diff;
}

async function handleInit(): Promise<void> {
  debug('handleInit()');
  const version = '0.3.0';
  emit({ event: 'version', version });

  // Check for updates (non-blocking)
  debug('Checking for updates...');
  checkForUpdate(version).then(update => {
    if (update) {
      debug(`Update available: ${update.version}`);
      emit({
        event: 'update-available',
        current: version,
        latest: update.version,
        url: update.url,
      });
    } else {
      debug('No updates available');
    }
  }).catch(err => {
    debug(`Update check failed: ${err}`);
  });

  // Try to find Spine CLI
  debug('Looking for Spine CLI...');
  spinePath = resolveSpinePathSilent();
  if (spinePath) {
    debug(`Spine CLI found: ${spinePath}`);
    emit({ event: 'spine-found', path: spinePath });
  } else {
    debug('Spine CLI not found');
    emit({ event: 'spine-not-found' });
  }
}

async function handleSetSpinePath(path: string): Promise<void> {
  const config = loadConfig();
  saveConfig({ ...config, spinePath: path });
  spinePath = path;
  emit({ event: 'spine-found', path });
}

async function runExportAndAnalyze(projectPath: string): Promise<void> {
  if (!spinePath) {
    emit({ event: 'error', message: 'Spine CLI path not set' });
    return;
  }

  debug(`Export starting: ${projectPath} (Spine CLI: ${spinePath})`);
  emit({ event: 'exporting' });

  let exported;
  try {
    exported = exportSpineProject(spinePath, projectPath);
    debug(`Export done: skeleton=${exported.skeletonPath} atlas=${exported.atlasPath}`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    debug(`Export FAILED: ${msg}`);
    emit({ event: 'export-error', message: msg });
    return;
  }

  debug('Analysis starting...');
  emit({ event: 'analyzing' });

  try {
    const { skeletonData, spineVersion } = loadSkeleton(
      exported.skeletonPath,
      exported.atlasPath,
    );
    debug(`Loaded: ${skeletonData.name}, Spine ${spineVersion}, ${skeletonData.animations.length} anims`);

    if (!isVersionSupported(spineVersion)) {
      debug(`Spine version ${spineVersion} not supported`);
      emit({ event: 'version-warning', version: spineVersion });
      return;
    }

    const report = analyzeSkeletonData(skeletonData);
    report.spineVersion = spineVersion;
    debug(`Analysis done: worstRI=${report.worstRI.cost.toFixed(2)} worstCI=${report.worstCI.cost.toFixed(2)}`);

    const diff = previousReport ? computeDiff(report, previousReport) : null;
    previousReport = report;

    emit({ event: 'metrics', report, diff });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    debug(`Analysis FAILED: ${msg}`);
    emit({ event: 'error', message: `Analysis failed: ${msg}` });
  }
}

async function handleWatch(projectPath: string): Promise<void> {
  debug(`handleWatch(${projectPath})`);

  // Stop existing watcher
  if (currentWatcher) {
    debug('Closing previous watcher');
    await currentWatcher.close();
    currentWatcher = null;
  }

  previousReport = null;

  const config = loadConfig();
  saveConfig({ ...config, lastProjectPath: projectPath });

  // Initial export + analysis
  await runExportAndAnalyze(projectPath);

  // Start watching
  debug('Starting file watcher...');
  currentWatcher = watchSpineFile(projectPath, async () => {
    debug('File change detected, re-exporting...');
    await runExportAndAnalyze(projectPath);
  });

  emit({ event: 'watching', path: projectPath });
}

async function handleStop(): Promise<void> {
  if (currentWatcher) {
    await currentWatcher.close();
    currentWatcher = null;
  }
  emit({ event: 'stopped' });
}

// Read commands from stdin
const rl = createInterface({ input: process.stdin });

debug('Sidecar ready, waiting for commands on stdin...');

rl.on('line', (line) => {
  let cmd: any;
  try {
    cmd = JSON.parse(line);
  } catch {
    debug(`Invalid JSON received: ${line}`);
    emit({ event: 'error', message: `Invalid JSON: ${line}` });
    return;
  }

  debug(`Command received: ${cmd.cmd}`);

  const handler = (async () => {
    switch (cmd.cmd) {
      case 'init':
        return handleInit();
      case 'set-spine-path':
        return handleSetSpinePath(cmd.path);
      case 'watch':
        return handleWatch(cmd.path);
      case 'stop':
        return handleStop();
      default:
        emit({ event: 'error', message: `Unknown command: ${cmd.cmd}` });
    }
  })();

  handler.catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    emit({ event: 'error', message: msg });
  });
});

rl.on('close', () => {
  process.exit(0);
});

// Keep alive
process.stdin.resume();
