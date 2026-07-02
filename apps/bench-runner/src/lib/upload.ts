import { API_BASE, CLIENT_VERSION } from "@/config";
import type { BenchResult, DeviceInfo, RunUpload } from "@/types";
import type { SegmentResult } from "@/bench/sceneEngine";
import type { RunSession } from "@/lib/session";

export interface UploadOk {
  id: string;
  reportUrl: string;
}

/**
 * Assemble the final upload for a resumable run from the persisted session
 * (scenes measured across one or more page loads) plus the final segment's
 * environment/watcher data. Raw per-frame captures are dropped to stay within
 * localStorage; per-second rows + per-scene stats/steps are the calibration data.
 */
export function assembleUpload(
  session: RunSession,
  seg: SegmentResult,
  quick: boolean,
): RunUpload {
  const results = session.results;
  const totalDurationMs = results.reduce((a, r) => a + r.durationMs, 0);
  const totalFrames = results.reduce((a, r) => a + r.stats.frames, 0);
  const env = session.environment ?? seg.environment;
  const crashed = session.crashed.length > 0;
  return {
    clientVersion: session.clientVersion,
    startedAt: session.startedAt,
    device: { ...session.device, runtime: env },
    scenarios: results,
    summary: {
      totalDurationMs: Math.round(totalDurationMs),
      totalFrames,
      avgFps:
        totalDurationMs > 0
          ? Math.round((totalFrames / totalDurationMs) * 100000) / 100
          : 0,
      worstFrameMsP99: Math.max(0, ...results.map((r) => r.stats.frameMsP99)),
      hiddenMs: Math.round(seg.hiddenMs),
      degraded: seg.hiddenMs > 5000,
      quick,
      displayHz: env.displayHz,
      longTaskCount: seg.longTasks?.count ?? 0,
      longTaskTotalMs: seg.longTasks?.totalMs ?? 0,
      ...(crashed || session.skipped.length
        ? {
            aborted: crashed,
            crashed,
            crashedScenes: session.crashed,
            skippedScenes: session.skipped,
            abortReason: crashed
              ? `tab crashed on: ${session.crashed.join(", ")}`
              : undefined,
          }
        : {}),
    },
    capture: {
      frames: [],
      perSecond: session.perSecond,
      longTasks: seg.longTasks,
      loaf: seg.loaf,
      events: seg.events,
      resources: seg.resources,
    },
  };
}

export function buildUpload(
  device: DeviceInfo,
  startedAt: string,
  result: BenchResult,
): RunUpload {
  return {
    clientVersion: CLIENT_VERSION,
    startedAt,
    device,
    scenarios: result.scenarios,
    summary: result.summary,
    capture: result.capture,
  };
}

/** Statuses worth retrying: transient server/storage/network blips. */
const RETRYABLE = new Set([0, 408, 429, 500, 502, 503, 504]);

/**
 * Upload the run, retrying transient failures (503 "storage unavailable",
 * network drops, 5xx) with exponential backoff. The whole run's data survives
 * in the session across a reload, so a persistent outage still isn't lost - but
 * a momentary blip now recovers on its own instead of failing the run.
 */
export async function uploadRun(upload: RunUpload, attempts = 4): Promise<UploadOk> {
  const body = JSON.stringify(upload);
  let lastErr = "";
  for (let i = 0; i < attempts; i++) {
    let status = 0;
    try {
      const res = await fetch(`${API_BASE}/api/runs`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      });
      if (res.ok) return (await res.json()) as UploadOk;
      status = res.status;
      lastErr = `HTTP ${status}`;
      try {
        const b = (await res.json()) as { error?: string };
        if (b.error) lastErr = b.error;
      } catch {
        /* non-JSON body */
      }
    } catch (err) {
      status = 0; // network error
      lastErr = (err as Error).message;
    }
    // last attempt, or a non-retryable client error (4xx except 408/429): stop
    if (i === attempts - 1 || !RETRYABLE.has(status)) break;
    await new Promise((r) => setTimeout(r, 800 * 2 ** i)); // 0.8s, 1.6s, 3.2s
  }
  throw new Error(lastErr || "upload failed");
}
