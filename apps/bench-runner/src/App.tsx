import { useEffect, useRef } from "react";

import { totalSeconds } from "@/config";
import { useRunnerStore } from "@/store";
import { startBenchmark, BenchCancelled } from "@/bench/engine";
import { collectDevice } from "@/lib/device";
import { buildUpload, uploadRun } from "@/lib/upload";
import { rememberRun } from "@/lib/history";
import { loadStash, clearStash } from "@/lib/stash";
import type { RunUpload } from "@/types";
import { Landing } from "@/ui/Landing";
import { Hud } from "@/ui/Hud";
import { Done } from "@/ui/Done";
import { ErrorView } from "@/ui/ErrorView";

export default function App() {
  const stage = useRunnerStore((s) => s.stage);
  const hud = useRunnerStore((s) => s.hud);
  const runId = useRunnerStore((s) => s.runId);
  const reportUrl = useRunnerStore((s) => s.reportUrl);
  const error = useRunnerStore((s) => s.error);
  const pendingPayload = useRunnerStore((s) => s.pendingPayload);

  const hostRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<(() => void) | null>(null);
  const lastUploadRef = useRef<RunUpload | null>(null);

  const doUpload = async (upload: RunUpload) => {
    const store = useRunnerStore.getState();
    store.setStage("uploading");
    try {
      const ok = await uploadRun(upload);
      clearStash();
      rememberRun(ok.id);
      store.setResult(ok.id, ok.reportUrl ?? null);
    } catch (err) {
      store.setError(
        `Upload failed: ${(err as Error).message}`,
        JSON.stringify(upload),
      );
    }
  };

  const start = async () => {
    const store = useRunnerStore.getState();
    store.setStage("running");
    // give React a tick to mount the canvas host (NOT rAF - that never
    // fires in a hidden tab and would hang the start forever)
    await new Promise((r) => window.setTimeout(r, 50));
    if (!hostRef.current) {
      store.setError("canvas host missing");
      return;
    }
    const startedAt = new Date().toISOString();
    const device = await collectDevice();
    const { result, cancel } = startBenchmark(
      hostRef.current,
      totalSeconds(),
      { onHud: (h) => useRunnerStore.getState().setHud(h) },
    );
    cancelRef.current = cancel;
    try {
      const bench = await result;
      device.runtime = bench.environment;
      const upload = buildUpload(device, startedAt, bench);
      lastUploadRef.current = upload;
      await doUpload(upload);
    } catch (err) {
      if (err instanceof BenchCancelled) return;
      store.setError(`Benchmark failed: ${(err as Error).message}`);
    }
  };

  useEffect(() => {
    return () => cancelRef.current?.();
  }, []);

  // a leftover crash stash means the browser died mid-run last time -
  // upload it as a crash report so the breaking point is never lost
  useEffect(() => {
    const stash = loadStash();
    if (!stash) return;
    void (async () => {
      try {
        const device = await collectDevice();
        const crashUpload: RunUpload = {
          clientVersion: stash.clientVersion,
          startedAt: stash.startedAt,
          device,
          scenarios: [],
          summary: {
            totalDurationMs: stash.elapsedMs,
            totalFrames: 0,
            avgFps: stash.fps,
            worstFrameMsP99: 0,
            hiddenMs: 0,
            degraded: true,
            quick: false,
            displayHz: stash.displayHz,
            longTaskCount: 0,
            longTaskTotalMs: 0,
            aborted: true,
            crashed: true,
            abortReason: `browser died during "${stash.scenarioId}" (${stash.scenarioIndex + 1}/${stash.scenarioCount}) at ${stash.instances} instances, ~${stash.fps} fps, heap ${stash.heapMb ?? "?"} MB`,
          },
          capture: {
            frames: [],
            perSecond: stash.recentSeconds,
            longTasks: null,
            loaf: null,
            events: [
              {
                t: stash.elapsedMs,
                type: "crash",
                detail: `${stash.scenarioId} @ ${stash.instances} instances`,
              },
            ],
            resources: [],
          },
        };
        const ok = await uploadRun(crashUpload);
        clearStash();
        rememberRun(ok.id);
        useRunnerStore.getState().setCrashReport({
          id: ok.id,
          scenario: stash.scenarioId,
          instances: stash.instances,
        });
      } catch {
        // upload failed - keep the stash for the next visit
      }
    })();
  }, []);

  return (
    <div className="h-full">
      {stage === "landing" && <Landing onStart={() => void start()} />}

      {(stage === "running" || stage === "uploading") && (
        <>
          <div ref={hostRef} className="fixed inset-0" />
          {hud && <Hud hud={hud} />}
          {stage === "uploading" && (
            <div className="fixed inset-0 z-20 flex items-center justify-center bg-neutral-950/70 backdrop-blur-sm">
              <p className="animate-pulse text-sm text-neutral-300">
                Uploading results...
              </p>
            </div>
          )}
        </>
      )}

      {stage === "done" && runId && <Done runId={runId} reportUrl={reportUrl} />}

      {stage === "error" && error && (
        <ErrorView
          error={error}
          pendingPayload={pendingPayload}
          onRetry={
            lastUploadRef.current
              ? () => void doUpload(lastUploadRef.current!)
              : null
          }
        />
      )}
    </div>
  );
}
