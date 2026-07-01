/**
 * Resumable run session in localStorage. A run spans as many page loads as it
 * takes: each scene is marked "in progress" before it is measured and its
 * result appended when it finishes. If the tab is killed mid-scene (OOM on
 * weak devices), the next load sees a scene that was entered but never
 * finished, records it as a crash, skips it, and auto-resumes the rest - no
 * user interaction. When every scene has been attempted the assembled run is
 * uploaded and the session cleared.
 */
import type {
  DeviceInfo,
  PerSecondRow,
  RuntimeProbes,
  ScenarioResult,
} from "@/types";

const KEY = "spine-run.session";
/** Give up on a scene after this many entries - it reliably crashes the tab. */
export const MAX_ATTEMPTS = 2;
/** inProgress sentinel while the (memory-heavy) preload runs. */
export const PRELOAD_MARK = "__preload__";

export interface RunSession {
  runId: string;
  clientVersion: string;
  startedAt: string;
  device: DeviceInfo;
  /** environment probes from the first segment (best-effort across reloads). */
  environment: RuntimeProbes | null;
  /** ordered scene ids for the whole run (fixed at creation). */
  sceneIds: string[];
  /** next scene index to attempt. */
  cursor: number;
  /** scene id (or PRELOAD_MARK) currently active - a leftover means a tab crash. */
  inProgress: string | null;
  /** the preload OOM'd the tab; the retry should drop the heaviest scenes. */
  preloadCrashed?: boolean;
  /** entry count per scene id. */
  attempts: Record<string, number>;
  /** finished scenes' results. */
  results: ScenarioResult[];
  /** per-second rows across finished scenes. */
  perSecond: PerSecondRow[];
  /** scene ids that crashed the tab. */
  crashed: string[];
  /** scene ids skipped (crashed or un-loadable). */
  skipped: string[];
}

export function loadSession(): RunSession | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as RunSession;
    if (!Array.isArray(s.sceneIds) || typeof s.cursor !== "number") return null;
    return s;
  } catch {
    return null;
  }
}

export function saveSession(s: RunSession): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // storage full / private mode: best effort (the run still uploads at end)
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export function newSession(
  device: DeviceInfo,
  clientVersion: string,
  sceneIds: string[],
): RunSession {
  return {
    runId:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `run-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    clientVersion,
    startedAt: new Date().toISOString(),
    device,
    environment: null,
    sceneIds,
    cursor: 0,
    inProgress: null,
    attempts: {},
    results: [],
    perSecond: [],
    crashed: [],
    skipped: [],
  };
}

/**
 * Reconcile a loaded session on page load: if a scene was left in progress the
 * tab crashed during it - record the crash and skip it. Also skip any scene
 * that has already been entered too many times. Returns the (mutated) session,
 * or null when every scene has been attempted (the run is complete).
 */
export function reconcileOnLoad(s: RunSession): RunSession {
  if (s.inProgress === PRELOAD_MARK) {
    // the tab died during preload (too many atlases for this GPU/RAM) - flag it
    // so the retry drops the heaviest scenes instead of looping.
    s.preloadCrashed = true;
    s.inProgress = null;
    saveSession(s);
  } else if (s.inProgress) {
    const id = s.inProgress;
    if (!s.crashed.includes(id)) s.crashed.push(id);
    if (!s.skipped.includes(id)) s.skipped.push(id);
    s.inProgress = null;
    // advance the cursor past the crashed scene
    const idx = s.sceneIds.indexOf(id);
    if (idx >= 0) s.cursor = Math.max(s.cursor, idx + 1);
    saveSession(s);
  }
  return s;
}

/** Scene ids the engine should NOT measure (already finished or skipped). */
export function skipIds(s: RunSession): Set<string> {
  return new Set<string>([...s.results.map((r) => r.id), ...s.skipped]);
}

export function isComplete(s: RunSession): boolean {
  const done = skipIds(s);
  return s.sceneIds.every((id) => done.has(id));
}
