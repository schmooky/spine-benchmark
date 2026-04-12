/**
 * Spine CLI detection and first-run setup.
 *
 * 1. Check saved config for a previously located Spine path
 * 2. Scan PATH and known install locations
 * 3. If not found, prompt user to locate it via native file dialog
 * 4. Persist the result to config
 */
import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { platform } from 'node:os';
import { loadConfig, saveConfig } from './config.js';
import { pickExecutable } from './dialog.js';

const KNOWN_PATHS_MAC = [
  '/Applications/Spine.app/Contents/MacOS/Spine',
];

const KNOWN_PATHS_WIN = [
  'C:\\Program Files\\Spine\\Spine.com',
  'C:\\Program Files\\Spine\\Spine.exe',
  'C:\\Program Files (x86)\\Spine\\Spine.com',
  'C:\\Program Files (x86)\\Spine\\Spine.exe',
];

function findOnPath(): string | null {
  const cmd = platform() === 'win32' ? 'where Spine 2>nul' : 'which Spine 2>/dev/null';
  try {
    const result = execSync(cmd, { encoding: 'utf8' });
    const first = result.trim().split('\n')[0]?.trim();
    return first && existsSync(first) ? first : null;
  } catch {
    return null;
  }
}

function findInKnownLocations(): string | null {
  const paths = platform() === 'win32' ? KNOWN_PATHS_WIN : KNOWN_PATHS_MAC;
  for (const p of paths) {
    if (existsSync(p)) return p;
  }
  return null;
}

export function resolveSpinePath(): string | null {
  // 1. Check saved config
  const config = loadConfig();
  if (config.spinePath && existsSync(config.spinePath)) {
    return config.spinePath;
  }

  // 2. Check PATH
  const onPath = findOnPath();
  if (onPath) {
    saveConfig({ ...config, spinePath: onPath });
    return onPath;
  }

  // 3. Check known install locations
  const known = findInKnownLocations();
  if (known) {
    saveConfig({ ...config, spinePath: known });
    return known;
  }

  // 4. Ask user to locate it
  console.log('');
  console.log('  Spine CLI executable not found on PATH or in default locations.');
  console.log('  Please select your Spine installation executable.');
  console.log('');

  const picked = pickExecutable('Select Spine executable (Spine.exe or Spine.app)');
  if (picked && existsSync(picked)) {
    saveConfig({ ...config, spinePath: picked });
    return picked;
  }

  return null;
}
