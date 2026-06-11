/**
 * Per-device run history in localStorage. Lets the landing screen say
 * "this device already ran the benchmark (id X on date Y)" while still
 * allowing reruns - every rerun gets a fresh id from the server.
 */

const KEY = "spine-run.history";

export interface PastRun {
  id: string;
  at: string;
}

export function pastRuns(): PastRun[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (r): r is PastRun =>
        typeof r === "object" && r !== null &&
        typeof (r as PastRun).id === "string" &&
        typeof (r as PastRun).at === "string",
    );
  } catch {
    return [];
  }
}

export function rememberRun(id: string): void {
  try {
    const runs = pastRuns();
    runs.push({ id, at: new Date().toISOString() });
    localStorage.setItem(KEY, JSON.stringify(runs.slice(-20)));
  } catch {
    // storage full / private mode: history is best-effort
  }
}
