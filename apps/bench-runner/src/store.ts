import { create } from "zustand";

import type { HudState } from "./bench/engine";

export type Stage =
  | "landing"
  | "countdown"
  | "loading"
  | "running"
  | "uploading"
  | "done"
  | "error";

export interface CrashReportNotice {
  id: string;
  scenario: string;
  instances: number;
}

interface RunnerState {
  stage: Stage;
  hud: HudState | null;
  runId: string | null;
  reportUrl: string | null;
  error: string | null;
  /** Set when upload failed: the finished payload, offered as a download. */
  pendingPayload: string | null;
  /** A previous run crashed the browser; its report was uploaded as this id. */
  crashReport: CrashReportNotice | null;
  /** Asset preload progress [loaded, total] while stage === "loading". */
  loadProgress: [number, number];
  setStage: (stage: Stage) => void;
  setHud: (hud: HudState) => void;
  setLoadProgress: (loaded: number, total: number) => void;
  setResult: (runId: string, reportUrl: string | null) => void;
  setError: (error: string, pendingPayload?: string | null) => void;
  setCrashReport: (crashReport: CrashReportNotice | null) => void;
}

export const useRunnerStore = create<RunnerState>((set) => ({
  stage: "landing",
  hud: null,
  runId: null,
  reportUrl: null,
  error: null,
  pendingPayload: null,
  crashReport: null,
  loadProgress: [0, 0],
  setStage: (stage) => set({ stage }),
  setHud: (hud) => set({ hud }),
  setLoadProgress: (loaded, total) => set({ loadProgress: [loaded, total] }),
  setResult: (runId, reportUrl) =>
    set({ stage: "done", runId, reportUrl, error: null }),
  setError: (error, pendingPayload = null) =>
    set({ stage: "error", error, pendingPayload }),
  setCrashReport: (crashReport) => set({ crashReport }),
}));
