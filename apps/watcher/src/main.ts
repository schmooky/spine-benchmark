#!/usr/bin/env node
/**
 * Spine Watcher - standalone .spine file watcher and analyzer.
 *
 * Flow:
 * 1. Check for updates (non-blocking)
 * 2. Locate Spine CLI executable (or prompt user to find it)
 * 3. Open native file dialog to pick a .spine project
 * 4. Watch the file for saves
 * 5. On each save: export via Spine CLI -> analyze -> display metrics
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, saveConfig } from './config.js';
import { pickFile } from './dialog.js';
import { resolveSpinePath } from './setup.js';
import { exportSpineProject } from './exporter.js';
import { watchSpineFile } from './watcher.js';
import { loadSkeleton } from './loader.js';
import { analyzeSkeletonData, type AnalysisReport } from './analyze.js';
import { formatPretty } from './format.js';
import {
  clearScreen,
  printHeader,
  printDiff,
  printVersionWarning,
  printWatching,
  printUpdateAvailable,
  startSpinner,
  stopSpinner,
  getAppVersion,
} from './display.js';
import { checkForUpdate, RELEASES_URL } from './updater.js';

const MIN_SPINE_VERSION = '4.2';

function isVersionSupported(version: string): boolean {
  if (version === '(unknown)') return true; // give benefit of doubt for binary
  const parts = version.split('.');
  const major = parseInt(parts[0] ?? '0', 10);
  const minor = parseInt(parts[1] ?? '0', 10);
  return major > 4 || (major === 4 && minor >= 2);
}

async function main(): Promise<void> {
  const version = getAppVersion();

  clearScreen();
  console.log('');
  console.log('  \x1b[1m\x1b[36mSPINE WATCHER\x1b[0m  \x1b[2mv' + version + '\x1b[0m');
  console.log('  \x1b[2m' + '─'.repeat(60) + '\x1b[0m');
  console.log('');

  // Non-blocking update check
  checkForUpdate(version).then(update => {
    if (update) {
      printUpdateAvailable(version, update.version, update.url);
    }
  });

  // Handle --help and --version
  const args = process.argv.slice(2);
  if (args.includes('-h') || args.includes('--help')) {
    printHelp();
    process.exit(0);
  }
  if (args.includes('-v') || args.includes('--version')) {
    console.log(version);
    process.exit(0);
  }

  // Step 1: Locate Spine CLI
  const spinePath = resolveSpinePath();
  if (!spinePath) {
    console.error('  Could not locate Spine CLI. Please install Spine and try again.');
    console.error('  Download: https://esotericsoftware.com/spine-download');
    process.exit(1);
  }
  console.log(`  \x1b[2mSpine CLI\x1b[0m  ${spinePath}`);

  // Step 2: Pick .spine project file
  let projectPath = args.find(a => a.endsWith('.spine'));
  if (!projectPath) {
    const config = loadConfig();
    console.log('');
    console.log('  Select a .spine project file to watch...');
    console.log('');
    projectPath = pickFile('Select .spine project to watch', ['spine']) ?? undefined;
  }

  if (!projectPath) {
    console.error('  No .spine file selected. Exiting.');
    process.exit(1);
  }

  projectPath = resolve(projectPath);
  const config = loadConfig();
  saveConfig({ ...config, lastProjectPath: projectPath });

  console.log(`  \x1b[2mProject\x1b[0m    ${projectPath}`);
  console.log('');

  // Step 3: Initial export + analysis
  let previousReport: AnalysisReport | null = null;

  async function runExportAndAnalyze(filePath: string): Promise<void> {
    startSpinner('Exporting via Spine CLI...');

    let exported;
    try {
      exported = exportSpineProject(spinePath!, filePath);
    } catch (err: unknown) {
      stopSpinner();
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`\n  \x1b[31mExport failed:\x1b[0m ${msg}\n`);
      return;
    }

    stopSpinner();
    startSpinner('Analyzing skeleton...');

    try {
      const { skeletonData, spineVersion } = loadSkeleton(
        exported.skeletonPath,
        exported.atlasPath,
      );

      stopSpinner();

      // Version gate
      if (!isVersionSupported(spineVersion)) {
        clearScreen();
        printHeader(filePath, spineVersion);
        printVersionWarning(spineVersion);
        printWatching(filePath);
        return;
      }

      const report = analyzeSkeletonData(skeletonData);
      report.spineVersion = spineVersion;

      clearScreen();
      printHeader(filePath, spineVersion);
      console.log(formatPretty(report));

      if (previousReport) {
        printDiff(report, previousReport);
      }

      previousReport = report;
      printWatching(filePath);
    } catch (err: unknown) {
      stopSpinner();
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`\n  \x1b[31mAnalysis failed:\x1b[0m ${msg}\n`);
    }
  }

  // Run initial analysis
  await runExportAndAnalyze(projectPath);

  // Step 4: Start watching
  const watcher = watchSpineFile(projectPath, runExportAndAnalyze);

  // Graceful shutdown
  const shutdown = async () => {
    console.log('\n  \x1b[2mStopping watcher...\x1b[0m');
    await watcher.close();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

function printHelp(): void {
  console.log(`
  Usage:
    spine-watcher [options] [project.spine]

  Options:
    -h, --help       Show this help
    -v, --version    Show version

  If no .spine file is given as argument, a file picker dialog opens.

  On first run, the app will ask you to locate your Spine installation
  if it is not found on PATH or in standard install locations.

  The watcher monitors the .spine file for saves, auto-exports via
  Spine CLI, and displays RI/CI performance metrics after each save.
  Only Spine 4.2+ projects are supported.
  `.trim());
}

main().catch(err => {
  console.error(`Fatal: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
