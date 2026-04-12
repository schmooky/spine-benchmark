/**
 * Terminal display: spinner during export, metrics output, diff vs previous run.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createInterface } from 'node:readline';
import type { AnalysisReport } from './analyze.js';

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';

const SPINNER_FRAMES = ['|', '/', '-', '\\'];

let spinnerInterval: ReturnType<typeof setInterval> | null = null;
let spinnerFrame = 0;

export function startSpinner(message: string): void {
  spinnerFrame = 0;
  process.stdout.write(`\r  ${SPINNER_FRAMES[0]} ${message}`);
  spinnerInterval = setInterval(() => {
    spinnerFrame = (spinnerFrame + 1) % SPINNER_FRAMES.length;
    process.stdout.write(`\r  ${SPINNER_FRAMES[spinnerFrame]} ${message}`);
  }, 100);
}

export function stopSpinner(): void {
  if (spinnerInterval) {
    clearInterval(spinnerInterval);
    spinnerInterval = null;
    process.stdout.write('\r' + ' '.repeat(60) + '\r');
  }
}

export function clearScreen(): void {
  process.stdout.write('\x1b[2J\x1b[H');
}

export function printHeader(projectPath: string, spineVersion: string): void {
  const now = new Date().toLocaleTimeString();
  console.log('');
  console.log(`  ${BOLD}${CYAN}SPINE WATCHER${RESET}  ${DIM}v${getAppVersion()}${RESET}`);
  console.log(`  ${DIM}${'─'.repeat(60)}${RESET}`);
  console.log(`  ${DIM}Project${RESET}  ${projectPath}`);
  console.log(`  ${DIM}Spine${RESET}    ${spineVersion}`);
  console.log(`  ${DIM}Updated${RESET}  ${now}`);
  console.log(`  ${DIM}${'─'.repeat(60)}${RESET}`);
}

export function printDiff(current: AnalysisReport, previous: AnalysisReport): void {
  const diffs: string[] = [];

  const bonesDelta = current.totalBones - previous.totalBones;
  const slotsDelta = current.totalSlots - previous.totalSlots;
  const animsDelta = current.totalAnimations - previous.totalAnimations;
  const riDelta = current.worstRI.cost - previous.worstRI.cost;
  const ciDelta = current.worstCI.cost - previous.worstCI.cost;

  if (bonesDelta !== 0) diffs.push(formatDelta('Bones', bonesDelta));
  if (slotsDelta !== 0) diffs.push(formatDelta('Slots', slotsDelta));
  if (animsDelta !== 0) diffs.push(formatDelta('Animations', animsDelta));
  if (Math.abs(riDelta) > 0.01) diffs.push(formatDelta('Worst RI', riDelta, true));
  if (Math.abs(ciDelta) > 0.01) diffs.push(formatDelta('Worst CI', ciDelta, true));

  const currentMaxVerts = Math.max(0, ...current.animations.map(a => a.peakVertices));
  const previousMaxVerts = Math.max(0, ...previous.animations.map(a => a.peakVertices));
  const vertsDelta = currentMaxVerts - previousMaxVerts;
  if (vertsDelta !== 0) diffs.push(formatDelta('Peak Vertices', vertsDelta));

  if (diffs.length > 0) {
    console.log('');
    console.log(`  ${BOLD}Changes since last save:${RESET}`);
    for (const d of diffs) {
      console.log(`    ${d}`);
    }
  }
}

function formatDelta(label: string, delta: number, isFloat = false): string {
  const sign = delta > 0 ? '+' : '';
  const value = isFloat ? delta.toFixed(2) : String(delta);
  const color = delta > 0 ? RED : GREEN;
  return `${label}: ${color}${sign}${value}${RESET}`;
}

export function printVersionWarning(version: string): void {
  console.log('');
  console.log(`  ${BOLD}${YELLOW}Spine version ${version} detected${RESET}`);
  console.log(`  This tool only supports Spine 4.2+.`);
  console.log(`  Please upgrade your project. Waiting for next save...`);
  console.log('');
}

export function printWatching(filePath: string): void {
  console.log('');
  console.log(`  ${DIM}Watching for changes... (Ctrl+C to quit)${RESET}`);
  console.log('');
}

export function printUpdateAvailable(currentVersion: string, latestVersion: string, url: string): void {
  console.log(`  ${YELLOW}Update available: ${currentVersion} -> ${latestVersion}${RESET}`);
  console.log(`  ${DIM}Download: ${url}${RESET}`);
  console.log('');
}

/**
 * Wait for user to press Enter. Essential on Windows where double-clicking
 * an exe opens a console that closes instantly when the process exits.
 */
export function waitForKeypress(message = 'Press Enter to exit...'): Promise<void> {
  return new Promise((res) => {
    console.log(`\n  ${DIM}${message}${RESET}`);
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.once('line', () => { rl.close(); res(); });
    // If stdin is not a TTY (piped), resolve immediately
    if (!process.stdin.isTTY) { rl.close(); res(); }
  });
}

// Version detection: works both from source (node dist/main.js) and
// inside a pkg-compiled binary where import.meta.url is unavailable.
let cachedVersion: string | null = null;

function getAppVersion(): string {
  if (cachedVersion) return cachedVersion;
  try {
    // pkg sets process.pkg when running as a compiled binary.
    // In that case, __dirname points to the snapshot filesystem.
    // Fall back to reading from the exe's directory or hardcoded.
    const candidates = [
      // Running from source: package.json is one level up from dist/
      resolve(__dirname, '..', 'package.json'),
      // pkg snapshot: package.json next to the entry
      resolve(__dirname, 'package.json'),
    ];
    for (const p of candidates) {
      try {
        const pkg = JSON.parse(readFileSync(p, 'utf8'));
        if (pkg.version) {
          cachedVersion = pkg.version as string;
          return cachedVersion;
        }
      } catch {
        // try next
      }
    }
  } catch {
    // ignore
  }
  cachedVersion = '0.1.0';
  return cachedVersion;
}

export { getAppVersion };
