const DEVICE_ID_KEY = "pixi-crawler:device-id";

/** Monotonic tail for the no-Web-Crypto fallback below. */
let fallbackSeq = 0;

function randomId(): string {
  const c = (
    globalThis as unknown as {
      crypto?: {
        randomUUID?: () => string;
        getRandomValues?: <T extends Uint8Array>(a: T) => T;
      };
    }
  ).crypto;
  if (c?.randomUUID) return c.randomUUID();
  if (c?.getRandomValues) {
    const b = c.getRandomValues(new Uint8Array(16));
    return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  }
  // No Web Crypto at all (ancient or exotic host). These ids only correlate
  // telemetry rows - they are never credentials - so a timestamp plus a
  // monotonic counter is sufficient, and avoids deriving an identifier from a
  // predictable PRNG (which static analysis rightly flags).
  fallbackSeq += 1;
  return `${Date.now().toString(36)}-${fallbackSeq.toString(36)}`;
}

export function makeSessionId(): string {
  return randomId();
}

/**
 * Unique device id, persisted in localStorage so the same device keeps a stable
 * id across reloads/sessions (distinct from per-instance `sessionId`). Falls
 * back to an ephemeral in-memory id when localStorage is unavailable.
 */
export function makeDeviceId(): string {
  try {
    const ls = (globalThis as unknown as { localStorage?: Storage })
      .localStorage;
    const existing = ls?.getItem(DEVICE_ID_KEY);
    if (existing) return existing;
    const id = randomId();
    ls?.setItem(DEVICE_ID_KEY, id);
    return id;
  } catch {
    return randomId();
  }
}
