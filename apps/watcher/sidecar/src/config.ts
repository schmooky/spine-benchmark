/**
 * Persistent user configuration for the watcher.
 * Stored at ~/.spine-benchmark-watcher.json.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const CONFIG_FILE = join(homedir(), '.spine-benchmark-watcher.json');

export interface WatcherConfig {
  spinePath?: string;
  lastProjectPath?: string;
}

export function loadConfig(): WatcherConfig {
  if (!existsSync(CONFIG_FILE)) return {};
  try {
    return JSON.parse(readFileSync(CONFIG_FILE, 'utf8'));
  } catch {
    return {};
  }
}

export function saveConfig(config: WatcherConfig): void {
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
}
