/**
 * Spine CLI detection (silent - no console output).
 *
 * 1. Check saved config for a previously located Spine path
 * 2. Scan PATH and known install locations
 * 3. Return null if not found (Tauri UI handles the file dialog)
 */
import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { platform } from 'node:os';
import { loadConfig, saveConfig } from './config.js';

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

/**
 * Try to find Spine CLI without any user interaction.
 * Returns the path if found, null otherwise.
 * The Tauri frontend handles prompting the user if null.
 */
export function resolveSpinePathSilent(): string | null {
  const config = loadConfig();
  if (config.spinePath && existsSync(config.spinePath)) {
    return config.spinePath;
  }

  const onPath = findOnPath();
  if (onPath) {
    saveConfig({ ...config, spinePath: onPath });
    return onPath;
  }

  const known = findInKnownLocations();
  if (known) {
    saveConfig({ ...config, spinePath: known });
    return known;
  }

  return null;
}
