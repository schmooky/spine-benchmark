import { create } from "zustand";

/**
 * Track-mixer state, modeled as a timeline: a fixed number of tracks (Spine
 * track indices, 0 = base) and a flat list of clips. A clip places one
 * animation on one track at a start time for its (locked) real duration.
 * The MixerTool renders this with react-timeline-editor and drives the live
 * AnimationState from the playhead. Lives here so resetAll() wipes it when a
 * new skeleton loads.
 */
export interface MixerClip {
  /** stable id, also used as the timeline action id */
  id: string;
  animation: string;
  /** spine track index / timeline row (0 = base) */
  trackIndex: number;
  /** start time on the timeline, seconds */
  startSec: number;
  /** locked to the animation's real duration (with a sliver minimum), seconds */
  durationSec: number;
}

interface MixerState {
  trackCount: number;
  clips: MixerClip[];
  playing: boolean;
  speed: number;
  loop: boolean;
  nextId: number;
  setClips: (clips: MixerClip[]) => void;
  addClip: (clip: MixerClip) => void;
  updateClip: (id: string, patch: Partial<MixerClip>) => void;
  removeClip: (id: string) => void;
  setTrackCount: (n: number) => void;
  addTrack: () => void;
  removeTrack: (index: number) => void;
  allocId: () => string;
  setPlaying: (playing: boolean) => void;
  setSpeed: (speed: number) => void;
  setLoop: (loop: boolean) => void;
  reset: () => void;
}

const initial = {
  trackCount: 1,
  clips: [] as MixerClip[],
  playing: false,
  speed: 1,
  loop: true,
  nextId: 1,
};

export const useMixerStore = create<MixerState>((set, get) => ({
  ...initial,
  setClips: (clips) => set({ clips }),
  addClip: (clip) => set((s) => ({ clips: [...s.clips, clip] })),
  updateClip: (id, patch) =>
    set((s) => ({
      clips: s.clips.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    })),
  removeClip: (id) => set((s) => ({ clips: s.clips.filter((c) => c.id !== id) })),
  setTrackCount: (trackCount) => set({ trackCount }),
  addTrack: () => set((s) => ({ trackCount: s.trackCount + 1 })),
  removeTrack: (index) =>
    set((s) => ({
      trackCount: Math.max(1, s.trackCount - 1),
      // drop this track's clips, shift higher tracks down to stay contiguous
      clips: s.clips
        .filter((c) => c.trackIndex !== index)
        .map((c) =>
          c.trackIndex > index ? { ...c, trackIndex: c.trackIndex - 1 } : c,
        ),
    })),
  allocId: () => {
    const id = get().nextId;
    set({ nextId: id + 1 });
    return `clip-${id}`;
  },
  setPlaying: (playing) => set({ playing }),
  setSpeed: (speed) => set({ speed }),
  setLoop: (loop) => set({ loop }),
  reset: () => set({ ...initial, clips: [] }),
}));
