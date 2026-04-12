/**
 * File watcher with debounce and serialization.
 *
 * Watches a .spine file for changes. On each detected save:
 * - Debounces rapid events (Spine writes multiple times per save)
 * - Serializes: never runs two exports concurrently
 * - Calls the provided callback with the file path
 */
import { watch } from 'chokidar';

export interface WatcherOptions {
  stabilityThreshold?: number;
  debounceMs?: number;
}

export function watchSpineFile(
  filePath: string,
  onChange: (path: string) => Promise<void>,
  opts: WatcherOptions = {},
): { close: () => Promise<void> } {
  const { stabilityThreshold = 300, debounceMs = 500 } = opts;

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let running = false;
  let queued = false;

  async function run(): Promise<void> {
    if (running) {
      queued = true;
      return;
    }
    running = true;
    try {
      await onChange(filePath);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`\n  Export/analysis error: ${msg}\n`);
    }
    running = false;
    if (queued) {
      queued = false;
      await run();
    }
  }

  const watcher = watch(filePath, {
    awaitWriteFinish: { stabilityThreshold },
    ignoreInitial: true,
  });

  watcher.on('change', () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      void run();
    }, debounceMs);
  });

  return {
    close: () => watcher.close(),
  };
}
