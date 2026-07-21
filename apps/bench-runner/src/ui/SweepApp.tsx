import { useEffect, useRef, useState } from "react";

import { CLIENT_VERSION } from "@/config";
import { startSweeps, SweepCancelled, type SweepProgress } from "@/bench/sweepEngine";
import { collectDevice } from "@/lib/device";
import { uploadRun, type UploadOk } from "@/lib/upload";
import type { RunUpload } from "@/types";

type Stage = "running" | "uploading" | "done" | "error";

/**
 * Isolation-sweep calibration mode (?mode=sweep). Ramps each GPU cost driver
 * (fill / vertices / stencilMasks / renderTargets / filterPasses) in
 * isolation and uploads the (driverValue, gpuMs) pairs as sweep-kind
 * scenarios - this is the calibration corpus the offline fit regresses to
 * turn the crawler's placeholder gpuCost weights into measured ones.
 */
export function SweepApp() {
  const hostRef = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState<Stage>("running");
  const [progress, setProgress] = useState<SweepProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<UploadOk | null>(null);
  const startedRef = useRef(false);
  const cancelRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (startedRef.current || !hostRef.current) return;
    startedRef.current = true;

    const startedAt = new Date().toISOString();

    void (async () => {
      try {
        // Collect device info BEFORE sweeping: collectDevice creates an extra
        // WebGL2 context, requests a WebGPU adapter, and probes battery/storage
        // - GPU/driver work that, run concurrently, contaminates the fill
        // sweep's low-level GPU timings, which are exactly the stage-1 pins.
        const device = await collectDevice();
        const { result, cancel } = startSweeps(hostRef.current!, {
          onProgress: setProgress,
        });
        cancelRef.current = cancel;
        const sweepResult = await result;
        setStage("uploading");
        const upload: RunUpload = {
          clientVersion: CLIENT_VERSION,
          startedAt,
          device,
          scenarios: sweepResult.scenarios,
          summary: sweepResult.summary,
          capture: {
            frames: [],
            perSecond: [],
            longTasks: null,
            loaf: null,
            events: [],
            resources: [],
          },
        };
        const uploaded = await uploadRun(upload);
        setOk(uploaded);
        setStage("done");
      } catch (err) {
        if (err instanceof SweepCancelled) return;
        setError((err as Error).message);
        setStage("error");
      }
    })();

    return () => cancelRef.current?.();
  }, []);

  return (
    <div className="fixed inset-0 bg-neutral-950">
      <div ref={hostRef} className="absolute inset-0" />
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-10 p-4">
        <div className="mx-auto max-w-xl rounded-2xl border border-neutral-800 bg-neutral-900/85 p-4 backdrop-blur-md">
          {stage === "running" && progress && (
            <>
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate text-sm text-neutral-200">
                  Sweep: {progress.driverLabel}
                </span>
                <span className="shrink-0 text-xs tabular-nums text-neutral-400">
                  driver {progress.driverIndex + 1}/{progress.driverCount}
                </span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-neutral-800">
                <div
                  className="h-full rounded-full bg-neutral-300 transition-[width] duration-200"
                  style={{
                    width: `${((progress.levelIndex + 1) / progress.levelCount) * 100}%`,
                  }}
                />
              </div>
              <div className="mt-2 text-xs tabular-nums text-neutral-400">
                level {progress.levelIndex + 1}/{progress.levelCount}
              </div>
            </>
          )}
          {stage === "uploading" && (
            <span className="text-sm text-neutral-300">Uploading sweep results...</span>
          )}
          {stage === "done" && ok && (
            <div className="text-sm text-neutral-200">
              Done.{" "}
              <a className="underline" href={ok.reportUrl}>
                {ok.reportUrl}
              </a>
            </div>
          )}
          {stage === "error" && (
            <span className="text-sm text-red-400">Sweep failed: {error}</span>
          )}
        </div>
      </div>
    </div>
  );
}
