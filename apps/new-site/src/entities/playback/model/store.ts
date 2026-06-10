import { create } from "zustand";

/**
 * Play-control + skin inputs, driven by the top anim/skin panel. Lives in its
 * own store so the "forget everything on skeleton change" reset wipes the
 * transport back to defaults for free when a new skeleton spawns.
 */
interface PlaybackState {
  selectedAnimation: string | null;
  selectedSkin: string | null;
  isPlaying: boolean;
  loop: boolean;
  speed: number;
  setSelectedAnimation: (name: string | null) => void;
  setSelectedSkin: (name: string | null) => void;
  setPlaying: (playing: boolean) => void;
  setLoop: (loop: boolean) => void;
  setSpeed: (speed: number) => void;
  reset: () => void;
}

const initial = {
  selectedAnimation: null,
  selectedSkin: null,
  isPlaying: false,
  loop: true,
  speed: 1,
};

export const usePlaybackStore = create<PlaybackState>((set) => ({
  ...initial,
  setSelectedAnimation: (selectedAnimation) => set({ selectedAnimation }),
  setSelectedSkin: (selectedSkin) => set({ selectedSkin }),
  setPlaying: (isPlaying) => set({ isPlaying }),
  setLoop: (loop) => set({ loop }),
  setSpeed: (speed) => set({ speed }),
  reset: () => set({ ...initial }),
}));
