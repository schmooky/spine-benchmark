import { create } from "zustand";

/**
 * Track-mixer state: a stack of Spine animation tracks the user layers to
 * preview mixing. `index` is the stable spine track index (0 = base; higher
 * tracks blend on top by `alpha`). Lives here so resetAll() wipes it when a new
 * skeleton loads. The MixerTool owns applying this to the live AnimationState.
 */
export interface MixerTrack {
  /** stable React key */
  id: number;
  /** spine track index (0 = base) */
  index: number;
  animation: string | null;
  loop: boolean;
  /** 0..1 blend over the tracks below */
  alpha: number;
}

interface MixerState {
  tracks: MixerTrack[];
  playing: boolean;
  speed: number;
  nextId: number;
  setTracks: (tracks: MixerTrack[]) => void;
  addTrack: (track: MixerTrack) => void;
  updateTrack: (id: number, patch: Partial<MixerTrack>) => void;
  removeTrack: (id: number) => void;
  allocId: () => number;
  setPlaying: (playing: boolean) => void;
  setSpeed: (speed: number) => void;
  reset: () => void;
}

const initial = {
  tracks: [] as MixerTrack[],
  playing: true,
  speed: 1,
  nextId: 1,
};

export const useMixerStore = create<MixerState>((set, get) => ({
  ...initial,
  setTracks: (tracks) => set({ tracks }),
  addTrack: (track) => set((s) => ({ tracks: [...s.tracks, track] })),
  updateTrack: (id, patch) =>
    set((s) => ({
      tracks: s.tracks.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    })),
  removeTrack: (id) =>
    set((s) => ({ tracks: s.tracks.filter((t) => t.id !== id) })),
  allocId: () => {
    const id = get().nextId;
    set({ nextId: id + 1 });
    return id;
  },
  setPlaying: (playing) => set({ playing }),
  setSpeed: (speed) => set({ speed }),
  reset: () => set({ ...initial }),
}));
