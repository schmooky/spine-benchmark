import { useEffect, useRef } from "react";

import { CLIENT_VERSION } from "@/config";
import { useRunnerStore } from "@/store";
import { BenchCancelled } from "@/bench/engine";
import { startSceneBenchmark } from "@/bench/sceneEngine";
import { configureAssetBase, loadAllScenes } from "@/scenes/load";
import { collectDevice } from "@/lib/device";
import { assembleUpload, uploadRun } from "@/lib/upload";
import { rememberRun, pastRuns } from "@/lib/history";
import {
  clearSession,
  isComplete,
  loadSession,
  newSession,
  PRELOAD_MARK,
  reconcileOnLoad,
  saveSession,
  skipIds,
  type RunSession,
} from "@/lib/session";
import type { RunUpload } from "@/types";
import { Landing } from "@/ui/Landing";
import { Countdown } from "@/ui/Countdown";
import { Hud } from "@/ui/Hud";
import { Done } from "@/ui/Done";
import { ErrorView } from "@/ui/ErrorView";

/** How heavy a scene is for ranking: its real (GPU-inclusive) frame time when
 * it DROPPED below full rate, else its compute cost - a smooth scene's
 * wall-clock is just pinned at the vsync ceiling and would tie every other
 * smooth scene together. */
function sceneCost(m: {
  frameMs: number | null;
  frameCpuMs: number | null;
  fps: number | null;
}): number {
  const dropped = m.fps != null && m.fps < 57 && m.frameMs != null;
  return dropped ? m.frameMs! : m.frameCpuMs ?? m.frameMs ?? 0;
}

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
  const startedRef = useRef(false);

  const doUpload = async (upload: RunUpload) => {
    const store = useRunnerStore.getState();
    store.setStage("uploading");
    try {
      const ok = await uploadRun(upload);
      clearSession(); // whole multi-reload run is done
      rememberRun(ok.id);
      store.setResult(ok.id, ok.reportUrl ?? null);
    } catch (err) {
      store.setError(`Upload failed: ${(err as Error).message}`, JSON.stringify(upload));
    }
  };

  /**
   * Measure one segment (one page load) of a resumable run. The engine measures
   * every scene not already done/crashed; each scene is persisted to the session
   * as it finishes so a tab crash mid-scene is recoverable on reload.
   */
  const runSegment = async (session: RunSession) => {
    const store = useRunnerStore.getState();
    configureAssetBase();
    const scenes = await loadAllScenes();
    // if a previous preload OOM'd the tab, drop the heaviest scenes (the density
    // stress ramps) this time so the load fits in memory.
    if (session.preloadCrashed) {
      for (const d of scenes) {
        if (d.stress && !session.skipped.includes(d.id)) session.skipped.push(d.id);
      }
      session.preloadCrashed = false;
      saveSession(session);
    }
    store.setStage("loading");
    store.setLoadProgress(0, 100);
    // mark the preload as in-progress: a tab crash here is detected on reload
    session.inProgress = PRELOAD_MARK;
    saveSession(session);
    await new Promise((r) => window.setTimeout(r, 50));
    if (!hostRef.current) {
      store.setError("canvas host missing");
      return;
    }
    const { result, cancel } = startSceneBenchmark(
      hostRef.current,
      scenes,
      skipIds(session),
      {
        onHud: (h) => useRunnerStore.getState().setHud(h),
        onProgress: (frac) =>
          useRunnerStore.getState().setLoadProgress(Math.round(frac * 100), 100),
        onMeasureStart: () => {
          // preload finished without crashing - clear the preload marker
          session.inProgress = null;
          saveSession(session);
          useRunnerStore.getState().setStage("running");
        },
        // persist BEFORE measuring - if the tab dies now, this marker survives
        onSceneEnter: (id) => {
          session.inProgress = id;
          session.attempts[id] = (session.attempts[id] ?? 0) + 1;
          saveSession(session);
        },
        onSceneDone: (id, res, perSecond) => {
          session.inProgress = null;
          if (res) {
            session.results.push(res);
            session.perSecond.push(...perSecond);
          } else if (!session.skipped.includes(id)) {
            session.skipped.push(id);
          }
          const idx = session.sceneIds.indexOf(id);
          if (idx >= 0) session.cursor = Math.max(session.cursor, idx + 1);
          saveSession(session);
        },
      },
    );
    cancelRef.current = cancel;
    try {
      const seg = await result;
      if (!session.environment) session.environment = seg.environment;
      saveSession(session);
      if (isComplete(session)) {
        // real per-frame compute measured on THIS device, heaviest scene first -
        // shown on the Done screen so the tester sees the number without leaving.
        store.setMeasured(
          session.results
            .map((r) => ({
              label: r.label,
              kind: r.kind,
              frameCpuMs: r.stats.frameCpuMsAvg ?? null,
              frameCpuMsP95: r.stats.frameCpuMsP95 ?? null,
              frameMs: r.stats.frameMsAvg ?? null,
              fps: r.stats.avgFps ?? null,
            }))
            // heaviest first: a scene that DROPS frames is ranked by its real
            // (GPU-inclusive) frame time; a scene holding full rate is ranked
            // by compute, since its wall-clock is just pinned at the vsync
            // ceiling and would tie every smooth scene together.
            .sort((a, b) => sceneCost(b) - sceneCost(a)),
        );
        // measure-only runs are always short; they are the canonical (and only)
        // measurement now, not a truncated "quick" test.
        const upload = assembleUpload(session, seg, false);
        lastUploadRef.current = upload;
        await doUpload(upload);
      } else if (seg.contextLost) {
        // GPU context is dead for this page - reload to continue with a fresh
        // one, resuming from where we left off. No user interaction.
        window.setTimeout(() => window.location.reload(), 500);
      }
    } catch (err) {
      if (err instanceof BenchCancelled) return;
      store.setError(`Benchmark failed: ${(err as Error).message}`);
    }
  };

  /** Fresh run: create a session, then measure the first segment. */
  const start = async () => {
    if (startedRef.current) return;
    startedRef.current = true;
    configureAssetBase();
    const scenes = await loadAllScenes();
    const device = await collectDevice();
    const session = newSession(device, CLIENT_VERSION, scenes.map((s) => s.id));
    saveSession(session);
    await runSegment(session);
  };

  useEffect(() => {
    return () => cancelRef.current?.();
  }, []);

  // On load: resume an in-progress run automatically (recording any scene that
  // crashed the tab), else offer a first-visit countdown.
  useEffect(() => {
    const session = loadSession();
    if (session && !isComplete(session)) {
      startedRef.current = true; // this visit is a resume, not a fresh start
      reconcileOnLoad(session); // a leftover in-progress scene = tab crash -> skip it
      void runSegment(session);
      return;
    }
    if (session) clearSession(); // stale/complete session
    if (pastRuns().length === 0) useRunnerStore.getState().setStage("countdown");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="h-full">
      {stage === "landing" && <Landing onStart={() => void start()} />}

      {stage === "countdown" && (
        <Countdown
          seconds={5}
          onDone={() => void start()}
          onCancel={() => useRunnerStore.getState().setStage("landing")}
        />
      )}

      {(stage === "loading" || stage === "running" || stage === "uploading") && (
        <>
          {/* the loading progress is drawn on the pixi canvas itself (an
              animated spinner + %), so nothing overlays the host here */}
          <div ref={hostRef} className="fixed inset-0" />
          {stage === "running" && hud && <Hud hud={hud} />}
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
            lastUploadRef.current ? () => void doUpload(lastUploadRef.current!) : null
          }
        />
      )}
    </div>
  );
}
