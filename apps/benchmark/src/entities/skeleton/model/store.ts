import { create } from "zustand";
import type { Spine } from "@esotericsoftware/spine-pixi-v8";

/**
 * Lifecycle of the single, currently-active skeleton.
 *
 *   idle     - nothing loaded, drop zone is waiting
 *   loading  - files dropped, measuring + parsing in the background
 *   ready    - Spine instance exists and is mounted on the stage
 *   error    - last load attempt failed
 */
export type SkeletonStatus = "idle" | "loading" | "ready" | "error";

export interface SkeletonMeta {
  name: string;
  /** counts pulled straight off the parsed skeleton data */
  bones: number;
  slots: number;
  skins: number;
  animations: string[];
}

interface SkeletonState {
  status: SkeletonStatus;
  /** The live pixi Spine display object. Owned here, mounted by the stage. */
  spine: Spine | null;
  meta: SkeletonMeta | null;
  error: string | null;

  beginLoad: () => void;
  setReady: (spine: Spine, meta: SkeletonMeta) => void;
  setError: (message: string) => void;
  /** Forget the active skeleton entirely. */
  reset: () => void;
}

const initial = {
  status: "idle" as SkeletonStatus,
  spine: null,
  meta: null,
  error: null,
};

export const useSkeletonStore = create<SkeletonState>((set) => ({
  ...initial,
  beginLoad: () => set({ status: "loading", error: null }),
  setReady: (spine, meta) => set({ status: "ready", spine, meta, error: null }),
  setError: (message) =>
    set({ status: "error", spine: null, meta: null, error: message }),
  reset: () => set({ ...initial }),
}));
