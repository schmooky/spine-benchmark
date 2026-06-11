import type { PerSecondRow } from "@/types";

/**
 * Crash stash: once per second the engine snapshots where the run is into
 * localStorage. If the browser dies mid-run (low-end devices do die), the
 * next visit finds the stash and uploads a crash report - the breaking
 * point is exactly the calibration data we want, so it must survive.
 */

const KEY = "spine-run.inflight";

export interface CrashStash {
  startedAt: string;
  updatedAt: string;
  clientVersion: string;
  scenarioId: string;
  scenarioIndex: number;
  scenarioCount: number;
  elapsedMs: number;
  instances: number;
  fps: number;
  heapMb: number | null;
  displayHz: number;
  cpuScoreStart: number;
  /** rolling tail of per-second rows, capped at 30 */
  recentSeconds: PerSecondRow[];
}

export function saveStash(stash: CrashStash): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(stash));
  } catch {
    // storage full - stash is best effort
  }
}

export function loadStash(): CrashStash | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as CrashStash;
    if (typeof s.scenarioId !== "string" || typeof s.elapsedMs !== "number") {
      return null;
    }
    return s;
  } catch {
    return null;
  }
}

export function clearStash(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
