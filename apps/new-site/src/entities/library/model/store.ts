import { create } from "zustand";

import {
  listBundles,
  deleteBundle,
  type BundleMeta,
} from "../lib/bundle-db";

/** Read model over the IndexedDB-saved bundles, for the Library drawer. */
interface LibraryState {
  bundles: BundleMeta[];
  loaded: boolean;
  refresh: () => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export const useLibraryStore = create<LibraryState>((set) => ({
  bundles: [],
  loaded: false,
  refresh: async () => {
    try {
      const bundles = await listBundles();
      set({ bundles, loaded: true });
    } catch (err) {
      console.warn("[library] failed to read saved bundles", err);
      set({ loaded: true });
    }
  },
  remove: async (id) => {
    try {
      await deleteBundle(id);
    } catch (err) {
      console.warn("[library] failed to delete bundle", err);
    }
    set((s) => ({ bundles: s.bundles.filter((b) => b.id !== id) }));
  },
}));
