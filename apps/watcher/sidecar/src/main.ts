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

// Emit a JSON event to stdout (one line)
function emit(event: Record<string, unknown>): void {
  process.stdout.write(JSON.stringify(event) + '\n');
}

let currentWatcher: { close: () => Promise<void> } | null = null;
let previousReport: AnalysisReport | null = null;
let spinePath: string | null = null;

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
  const version = '0.1.0';
  emit({ event: 'version', version });

  // Check for updates (non-blocking)
  checkForUpdate(version).then(update => {
    if (update) {
      emit({
        event: 'update-available',
        current: version,
        latest: update.version,
        url: update.url,
      });
    }
  });

  // Try to find Spine CLI
  spinePath = resolveSpinePathSilent();
  if (spinePath) {
    emit({ event: 'spine-found', path: spinePath });
  } else {
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

  emit({ event: 'exporting' });

  let exported;
  try {
    exported = exportSpineProject(spinePath, projectPath);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    emit({ event: 'export-error', message: msg });
    return;
  }

  emit({ event: 'analyzing' });

  try {
    const { skeletonData, spineVersion } = loadSkeleton(
      exported.skeletonPath,
      exported.atlasPath,
    );

    if (!isVersionSupported(spineVersion)) {
      emit({ event: 'version-warning', version: spineVersion });
      return;
    }

    const report = analyzeSkeletonData(skeletonData);
    report.spineVersion = spineVersion;

    const diff = previousReport ? computeDiff(report, previousReport) : null;
    previousReport = report;

    emit({ event: 'metrics', report, diff });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    emit({ event: 'error', message: `Analysis failed: ${msg}` });
  }
}

async function handleWatch(projectPath: string): Promise<void> {
  // Stop existing watcher
  if (currentWatcher) {
    await currentWatcher.close();
    currentWatcher = null;
  }

  previousReport = null;

  const config = loadConfig();
  saveConfig({ ...config, lastProjectPath: projectPath });

  // Initial export + analysis
  await runExportAndAnalyze(projectPath);

  // Start watching
  currentWatcher = watchSpineFile(projectPath, async () => {
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

rl.on('line', (line) => {
  let cmd: any;
  try {
    cmd = JSON.parse(line);
  } catch {
    emit({ event: 'error', message: `Invalid JSON: ${line}` });
    return;
  }

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
