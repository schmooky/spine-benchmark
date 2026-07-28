import { create } from "zustand";

/**
 * Rolling log of user events fired by the active skeleton's animations. Fed by
 * an AnimationState listener attached at load (so it captures events from any
 * track - transport or mixer), drained by the Events monitor. Newest first,
 * capped. Wiped by resetAll when a new skeleton loads.
 */
export interface EventLogEntry {
  id: number;
  name: string;
  animation: string;
  track: number;
  /** event time within its animation, seconds */
  time: number;
  intValue: number;
  floatValue: number;
  stringValue: string;
}

const MAX = 250;

interface EventLogState {
  events: EventLogEntry[];
  nextId: number;
  push: (entry: Omit<EventLogEntry, "id">) => void;
  clear: () => void;
  reset: () => void;
}

export const useEventLogStore = create<EventLogState>((set, get) => ({
  events: [],
  nextId: 1,
  push: (entry) => {
    const id = get().nextId;
    set((s) => ({
      nextId: id + 1,
      events: [{ ...entry, id }, ...s.events].slice(0, MAX),
    }));
  },
  clear: () => set({ events: [] }),
  reset: () => set({ events: [], nextId: 1 }),
}));
