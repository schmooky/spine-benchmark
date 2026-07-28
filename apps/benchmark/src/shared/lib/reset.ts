import { useSkeletonStore } from "@/entities/skeleton";
import { useMetricsStore } from "@/entities/metrics";
import {
  usePlaybackStore,
  useMixerStore,
  useEventLogStore,
} from "@/entities/playback";

/**
 * The single "forget everything" switch. The whole app revolves around one
 * active skeleton, so whenever the skeleton state changes (a new one is being
 * loaded, or the current one is cleared) every derived store is wiped back to
 * its initial state: metrics, play-control inputs, and the skeleton itself.
 *
 * Pass `{ keepSkeleton: true }` when the caller is *about* to populate the
 * skeleton store itself (e.g. the loader, which sets it to "loading") and only
 * wants the satellite stores cleared.
 */
export function resetAll(opts: { keepSkeleton?: boolean } = {}): void {
  useMetricsStore.getState().reset();
  usePlaybackStore.getState().reset();
  useMixerStore.getState().reset();
  useEventLogStore.getState().reset();
  if (!opts.keepSkeleton) {
    useSkeletonStore.getState().reset();
  }
}
