import { create } from "zustand";

import type { HudState } from "./bench/engine";

export type Stage = "landing" | "running" | "uploading" | "done" | "error";

interface RunnerState {
  stage: Stage;
  hud: HudState | null;
  runId: string | null;
  reportUrl: string | null;
  error: string | null;
  /** Set when upload failed: the finished payload, offered as a download. */
  pendingPayload: string | null;
  setStage: (stage: Stage) => void;
  setHud: (hud: HudState) => void;
  setResult: (runId: string, reportUrl: string | null) => void;
  setError: (error: string, pendingPayload?: string | null) => void;
}

export const useRunnerStore = create<RunnerState>((set) => ({
  stage: "landing",
  hud: null,
  runId: null,
  reportUrl: null,
  error: null,
  pendingPayload: null,
  setStage: (stage) => set({ stage }),
  setHud: (hud) => set({ hud }),
  setResult: (runId, reportUrl) =>
    set({ stage: "done", runId, reportUrl, error: null }),
  setError: (error, pendingPayload = null) =>
    set({ stage: "error", error, pendingPayload }),
}));
