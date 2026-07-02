const DEVICE_ID_KEY = "pixi-crawler:device-id";

function randomId(): string {
  const c = (
    globalThis as unknown as { crypto?: { randomUUID?: () => string } }
  ).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
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
