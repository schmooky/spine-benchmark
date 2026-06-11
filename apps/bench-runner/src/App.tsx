import { useEffect, useRef } from "react";

import { totalSeconds } from "@/config";
import { useRunnerStore } from "@/store";
import { startBenchmark, BenchCancelled } from "@/bench/engine";
import { collectDevice } from "@/lib/device";
import { buildUpload, uploadRun } from "@/lib/upload";
import { rememberRun } from "@/lib/history";
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
    // give React a tick to mount the canvas host
    await new Promise((r) => requestAnimationFrame(r));
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
