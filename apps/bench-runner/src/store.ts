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

/** One scene's real, measured per-frame cost on THIS device. */
export interface MeasuredScene {
  label: string;
  kind: string;
  /** avg spine.update + render-side CPU per frame (ms), vsync-independent,
   * clamped to the frame's wall-clock (can never exceed it). */
  frameCpuMs: number | null;
  frameCpuMsP95: number | null;
  /** avg wall-clock frame time (ms) - the REAL, GPU-inclusive cost. Vsync-
   * capped near the refresh ceiling while the scene holds full frame rate. */
  frameMs: number | null;
  /** avg frames per second for the scene (real render rate). */
  fps: number | null;
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
  /** Real per-frame compute measured on THIS device, heaviest scene first. */
  measured: MeasuredScene[] | null;
  setStage: (stage: Stage) => void;
  setHud: (hud: HudState) => void;
  setLoadProgress: (loaded: number, total: number) => void;
  setMeasured: (measured: MeasuredScene[]) => void;
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
  measured: null,
  setStage: (stage) => set({ stage }),
  setHud: (hud) => set({ hud }),
  setLoadProgress: (loaded, total) => set({ loadProgress: [loaded, total] }),
  setMeasured: (measured) => set({ measured }),
  setResult: (runId, reportUrl) =>
    set({ stage: "done", runId, reportUrl, error: null }),
  setError: (error, pendingPayload = null) =>
    set({ stage: "error", error, pendingPayload }),
  setCrashReport: (crashReport) => set({ crashReport }),
}));
