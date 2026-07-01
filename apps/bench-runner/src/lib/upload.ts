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

export async function uploadRun(upload: RunUpload): Promise<UploadOk> {
  const res = await fetch(`${API_BASE}/api/runs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(upload),
  });
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) detail = body.error;
    } catch {
      // non-JSON error body
    }
    throw new Error(detail);
  }
  return (await res.json()) as UploadOk;
}
