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
import { resolve } from 'node:path';
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
  waitForKeypress,
} from './display.js';
import { checkForUpdate } from './updater.js';

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';

function isVersionSupported(version: string): boolean {
  if (version === '(unknown)') return true;
  const parts = version.split('.');
  const major = parseInt(parts[0] ?? '0', 10);
  const minor = parseInt(parts[1] ?? '0', 10);
  return major > 4 || (major === 4 && minor >= 2);
}

async function main(): Promise<void> {
  const version = getAppVersion();

  clearScreen();
  console.log('');
  console.log(`  ${BOLD}${CYAN}SPINE WATCHER${RESET}  ${DIM}v${version}${RESET}`);
  console.log(`  ${DIM}${'─'.repeat(60)}${RESET}`);
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
    return;
  }
  if (args.includes('-v') || args.includes('--version')) {
    console.log(version);
    return;
  }

  // Step 1: Locate Spine CLI
  console.log(`  ${DIM}Looking for Spine CLI...${RESET}`);
  const spinePath = resolveSpinePath();
  if (!spinePath) {
    console.error('');
    console.error(`  ${RED}Could not locate Spine CLI.${RESET}`);
    console.error('  Please install Spine and try again.');
    console.error('  Download: https://esotericsoftware.com/spine-download');
    await waitForKeypress();
    process.exit(1);
  }
  console.log(`  ${DIM}Spine CLI${RESET}  ${spinePath}`);
  console.log('');

  // Step 2: Pick .spine project file
  let projectPath = args.find(a => a.endsWith('.spine'));
  if (!projectPath) {
    console.log(`  Select a .spine project file to watch...`);
    console.log('');
    projectPath = pickFile('Select .spine project to watch', ['spine']) ?? undefined;
  }

  if (!projectPath) {
    console.error(`  ${RED}No .spine file selected.${RESET}`);
    await waitForKeypress();
    process.exit(1);
  }

  projectPath = resolve(projectPath);
  const config = loadConfig();
  saveConfig({ ...config, lastProjectPath: projectPath });

  console.log(`  ${DIM}Project${RESET}    ${projectPath}`);
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
      console.error(`\n  ${RED}Export failed:${RESET} ${msg}\n`);
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
      console.error(`\n  ${RED}Analysis failed:${RESET} ${msg}\n`);
    }
  }

  // Run initial analysis
  await runExportAndAnalyze(projectPath);

  // Step 4: Start watching
  const watcher = watchSpineFile(projectPath, runExportAndAnalyze);

  // Graceful shutdown
  const shutdown = async () => {
    console.log(`\n  ${DIM}Stopping watcher...${RESET}`);
    await watcher.close();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());

  // Keep the process alive - the watcher is async
  // On Windows, also keep stdin open so the console doesn't close
  process.stdin.resume();
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

// Top-level error handler: catch EVERYTHING, show it, and wait for
// keypress so the Windows console doesn't vanish.
main().catch(async (err) => {
  console.error('');
  console.error(`  ${BOLD}${RED}Fatal error:${RESET} ${err instanceof Error ? err.message : String(err)}`);
  if (err instanceof Error && err.stack) {
    console.error(`  ${DIM}${err.stack.split('\n').slice(1, 4).join('\n  ')}${RESET}`);
  }
  await waitForKeypress();
  process.exit(1);
});

// Also catch unhandled rejections
process.on('unhandledRejection', async (reason) => {
  console.error('');
  console.error(`  ${BOLD}${RED}Unhandled error:${RESET} ${reason instanceof Error ? reason.message : String(reason)}`);
  await waitForKeypress();
  process.exit(1);
});
