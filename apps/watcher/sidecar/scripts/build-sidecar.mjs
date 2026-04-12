#!/usr/bin/env node
/**
 * Build sidecar binaries with target-triple naming for Tauri.
 *
 * Tauri expects binaries named: <name>-<target-triple>[.exe]
 * e.g. spine-watcher-sidecar-x86_64-pc-windows-msvc.exe
 *
 * Usage:
 *   node scripts/build-sidecar.mjs                    # build for current platform
 *   node scripts/build-sidecar.mjs --target <triple>  # build for specific target
 */
import { execSync } from 'node:child_process';
import { copyFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sidecarDir = join(__dirname, '..');
const tauriBinDir = join(sidecarDir, '..', 'src-tauri', 'binaries');

const TARGETS = {
  'aarch64-apple-darwin': 'node20-macos-arm64',
  'x86_64-apple-darwin': 'node20-macos-x64',
  'x86_64-pc-windows-msvc': 'node20-win-x64',
};

// Parse --target flag
const targetIdx = process.argv.indexOf('--target');
const rustTarget = targetIdx >= 0 ? process.argv[targetIdx + 1] : detectHostTriple();

function detectHostTriple() {
  const platform = process.platform;
  const arch = process.arch;
  if (platform === 'darwin' && arch === 'arm64') return 'aarch64-apple-darwin';
  if (platform === 'darwin' && arch === 'x64') return 'x86_64-apple-darwin';
  if (platform === 'win32' && arch === 'x64') return 'x86_64-pc-windows-msvc';
  throw new Error(`Unsupported platform: ${platform}/${arch}`);
}

const pkgTarget = TARGETS[rustTarget];
if (!pkgTarget) {
  console.error(`Unknown target: ${rustTarget}`);
  console.error(`Supported: ${Object.keys(TARGETS).join(', ')}`);
  process.exit(1);
}

const isWindows = rustTarget.includes('windows');
const ext = isWindows ? '.exe' : '';
const sidecarName = `spine-watcher-sidecar-${rustTarget}${ext}`;

console.log(`Building sidecar for ${rustTarget} (pkg target: ${pkgTarget})`);

// Ensure bundle exists
const bundlePath = join(sidecarDir, 'dist', 'bundle.cjs');

// Compile with pkg
const outPath = join(sidecarDir, 'dist', sidecarName);
execSync(
  `npx @yao-pkg/pkg "${bundlePath}" --target ${pkgTarget} --output "${outPath}"`,
  { cwd: sidecarDir, stdio: 'inherit' },
);

// Copy to Tauri binaries dir
mkdirSync(tauriBinDir, { recursive: true });
const destPath = join(tauriBinDir, sidecarName);
copyFileSync(outPath, destPath);
console.log(`Sidecar copied to ${destPath}`);
