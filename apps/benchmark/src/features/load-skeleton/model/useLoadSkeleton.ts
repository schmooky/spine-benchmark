import { useCallback } from "react";
import { toast } from "sonner";

import {
  SpineLoader,
  useSkeletonStore,
  type SkeletonMeta,
} from "@/entities/skeleton";
import { runMeasurements } from "@/entities/metrics";
import { usePlaybackStore } from "@/entities/playback";
import { useEventLogStore } from "@/entities/playback";
import {
  saveBundle,
  getBundleFiles,
  useLibraryStore,
  type BundleMeta,
} from "@/entities/library";
import { resetAll } from "@/shared/lib/reset";
import { sleep } from "@/shared/lib/sleep";
import { MIN_LOAD_MS } from "@/shared/config/constants";
import { LIBRARY_BASE, type LibraryItem } from "@/shared/config/library";

const loader = new SpineLoader();

function deriveName(files: File[]): string {
  const skel = files.find(
    (f) => f.name.endsWith(".json") || f.name.endsWith(".skel"),
  );
  return (skel?.name ?? "skeleton").replace(/\.(json|skel)$/i, "");
}

/** Fetch a static library bundle's files into File objects. */
async function fetchLibraryFiles(item: LibraryItem): Promise<File[]> {
  return Promise.all(
    item.files.map(async (name) => {
      const res = await fetch(LIBRARY_BASE + name);
      if (!res.ok) throw new Error(`Could not fetch ${name}`);
      const blob = await res.blob();
      return new File([blob], name, { type: blob.type });
    }),
  );
}

interface RunOpts {
  displayName?: string;
  /** save the bundle to IndexedDB so it shows up in the Library later */
  persist?: boolean;
}

/**
 * The drop/library -> materialize orchestration, in one place.
 *
 *   1. forget everything (resetAll wipes metrics + play controls + clears the
 *      stage's previous skeleton)
 *   2. enter the loading state (spinner shows)
 *   3. parse the bundle into a Spine, then run the background measuring tasks
 *   4. hold for at least MIN_LOAD_MS so the loader never flickers past
 *   5. publish the ready skeleton - the stage mounts it and materializes it in
 *   6. (drops only) persist the bundle to IndexedDB for the Library
 */
export function useLoadSkeleton() {
  const run = useCallback(async (files: File[], opts: RunOpts = {}) => {
    if (files.length === 0) return;

    const { beginLoad, setReady, setError } = useSkeletonStore.getState();

    resetAll();
    beginLoad();

    const started = performance.now();
    try {
      const spine = await loader.loadSpineFiles(files);
      if (!spine) throw new Error("Could not build a Spine from these files.");

      await runMeasurements(spine);

      const remaining = MIN_LOAD_MS - (performance.now() - started);
      if (remaining > 0) await sleep(remaining);

      const meta: SkeletonMeta = {
        name: opts.displayName ?? deriveName(files),
        bones: spine.skeleton.bones.length,
        slots: spine.skeleton.slots.length,
        skins: spine.skeleton.data.skins.length,
        animations: spine.skeleton.data.animations.map((a) => a.name),
      };
      setReady(spine, meta);

      // capture user events fired by any track (transport or mixer) for the
      // Events monitor; the listener dies with the spine on the next load
      spine.state.addListener({
        event: (entry, ev) => {
          useEventLogStore.getState().push({
            name: ev.data.name,
            animation: entry.animation?.name ?? "?",
            track: entry.trackIndex,
            time: ev.time,
            intValue: ev.intValue,
            floatValue: ev.floatValue,
            stringValue: ev.stringValue ?? "",
          });
        },
      });

      // the default skin is selected (and applied) by default
      const defaultSkin =
        spine.skeleton.data.defaultSkin?.name ??
        spine.skeleton.data.skins[0]?.name ??
        null;
      if (defaultSkin) {
        spine.skeleton.setSkinByName(defaultSkin);
        spine.skeleton.setSlotsToSetupPose();
        usePlaybackStore.getState().setSelectedSkin(defaultSkin);
      }

      // keep this drop around for next time
      if (opts.persist) {
        try {
          await saveBundle(meta.name, meta.name, files);
          await useLibraryStore.getState().refresh();
        } catch (err) {
          console.warn("[library] could not save bundle", err);
        }
      }

      toast.success(`Loaded ${meta.name}`, {
        description: `${meta.bones} bones · ${meta.slots} slots · ${meta.animations.length} animations`,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load skeleton.";
      setError(message);
      toast.error("Load failed", { description: message });
    }
  }, []);

  /** A fresh drop: load and persist it to the Library. */
  const load = useCallback(
    (fileList: FileList | File[]) =>
      run(Array.from(fileList), { persist: true }),
    [run],
  );

  /** Re-load a previously-saved bundle from IndexedDB (no re-save). */
  const loadSaved = useCallback(
    async (bundle: BundleMeta) => {
      try {
        const files = await getBundleFiles(bundle.id);
        if (files.length === 0) throw new Error("Saved files are missing.");
        await run(files, { displayName: bundle.name });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to open bundle.";
        toast.error("Could not open saved bundle", { description: message });
      }
    },
    [run],
  );

  /** Load a bundled (static-catalog) spine. */
  const loadFromLibrary = useCallback(
    async (item: LibraryItem) => {
      try {
        const files = await fetchLibraryFiles(item);
        await run(files, { displayName: item.name });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to fetch bundle.";
        toast.error("Library load failed", { description: message });
      }
    },
    [run],
  );

  return { load, loadSaved, loadFromLibrary };
}
