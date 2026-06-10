import { useCallback } from "react";
import { toast } from "sonner";

import {
  SpineLoader,
  useSkeletonStore,
  type SkeletonMeta,
} from "@/entities/skeleton";
import { runMeasurements } from "@/entities/metrics";
import { usePlaybackStore } from "@/entities/playback";
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

/** Fetch a library bundle's files into File objects the loader understands. */
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

/**
 * The drop/library -> materialize orchestration, in one place.
 *
 *   1. forget everything (resetAll wipes metrics + play controls + clears the
 *      stage's previous skeleton)
 *   2. enter the loading state (spinner shows)
 *   3. parse the bundle into a Spine, then run the background measuring tasks
 *   4. hold for at least MIN_LOAD_MS so the loader never flickers past
 *   5. publish the ready skeleton - the stage mounts it and materializes it in
 */
export function useLoadSkeleton() {
  const run = useCallback(async (files: File[], displayName?: string) => {
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
        name: displayName ?? deriveName(files),
        bones: spine.skeleton.bones.length,
        slots: spine.skeleton.slots.length,
        skins: spine.skeleton.data.skins.length,
        animations: spine.skeleton.data.animations.map((a) => a.name),
      };
      setReady(spine, meta);

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

  const load = useCallback(
    (fileList: FileList | File[]) => run(Array.from(fileList)),
    [run],
  );

  const loadFromLibrary = useCallback(
    async (item: LibraryItem) => {
      try {
        const files = await fetchLibraryFiles(item);
        await run(files, item.name);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to fetch bundle.";
        toast.error("Library load failed", { description: message });
      }
    },
    [run],
  );

  return { load, loadFromLibrary };
}
