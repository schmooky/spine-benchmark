import { API_BASE, CLIENT_VERSION } from "@/config";
import type { BenchResult, DeviceInfo, RunUpload } from "@/types";

export interface UploadOk {
  id: string;
  reportUrl: string;
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
