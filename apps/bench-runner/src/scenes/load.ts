/**
 * Assembles the scene list for a run: hand-authored descriptors + the generated
 * scenes.json, and points the reconstructor's asset base at S3 in production
 * (local dev serves the symlinked game tree at /games/).
 */
import { starsOfEgyptScenes } from "./data/stars-of-egypt";
import type { SceneDescriptor } from "./types";

/** Public S3 base for game assets (path-mirrored keys). */
const S3_BASE = "https://s3.twcstorage.ru/spine-run/";

export function configureAssetBase(): void {
  const params = new URLSearchParams(location.search);
  // default to S3 unless explicitly told to use the local symlink (?src=local)
  const useLocal = params.get("src") === "local";
  (globalThis as { __ASSET_BASE?: string }).__ASSET_BASE = useLocal ? "/games/" : S3_BASE;
}

export async function loadAllScenes(): Promise<SceneDescriptor[]> {
  const scenes: SceneDescriptor[] = [...starsOfEgyptScenes];
  try {
    const res = await fetch("/scenes/scenes.json");
    if (res.ok) scenes.push(...((await res.json()) as SceneDescriptor[]));
  } catch {
    /* generated scenes are optional in dev */
  }
  // ?scenes=N measures only the first N (testing / short runs)
  const n = Number(new URLSearchParams(location.search).get("scenes"));
  return Number.isFinite(n) && n > 0 ? scenes.slice(0, n) : scenes;
}
