/**
 * Generic scene reconstructor. Turns a {@link SceneDescriptor} into a single
 * pixi Container of live Spine instances, then uniform-"contain"-fits the whole
 * composition to a viewport so it is 100% visible (never cropped), centered,
 * with a small margin. Fit is recomputed on resize via {@link fitContainer}.
 *
 * The same asset-loading convention as the bench engine is used: each unique
 * skeleton/atlas is registered once with Pixi Assets under a stable alias, then
 * Spine.from() builds instances from those aliases.
 */
import { Assets, Container, Rectangle } from "pixi.js";
import {
  AtlasAttachmentLoader,
  MeshAttachment,
  RegionAttachment,
  SkeletonBinary,
  SkeletonJson,
  Spine,
  TextureAtlas,
} from "@esotericsoftware/spine-pixi-v8";
import type { SkeletonData } from "@esotericsoftware/spine-pixi-v8";
import type { SceneDescriptor, Placement } from "./types";

/**
 * Tolerates atlas regions a skeleton references but the paired atlas lacks.
 * Our scene reconstruction pairs each skeleton with its best-matching atlas,
 * but some game spines reference regions spread across several atlases; rather
 * than crash the whole scene (and the run), a missing region renders blank.
 */
class LenientAtlasAttachmentLoader extends AtlasAttachmentLoader {
  missing = 0;
  newRegionAttachment(skin: unknown, name: string, path: string, seq: unknown): RegionAttachment {
    try {
      return super.newRegionAttachment(skin as never, name, path, seq as never);
    } catch (err) {
      if ((err as Error)?.message?.includes("Region not found")) {
        this.missing++;
        return new RegionAttachment(name, path);
      }
      throw err;
    }
  }
  newMeshAttachment(skin: unknown, name: string, path: string, seq: unknown): MeshAttachment {
    try {
      return super.newMeshAttachment(skin as never, name, path, seq as never);
    } catch (err) {
      if ((err as Error)?.message?.includes("Region not found")) {
        this.missing++;
        return new MeshAttachment(name, path);
      }
      throw err;
    }
  }
}

/** Missing-region tally for the scene currently being built (diagnostics). */
export const buildStats = { missingRegions: 0, spines: 0 };

/** Parsed-skeleton cache. Parsing costs ~ms per skeleton; without this, a
 * stress-ramp doubling step (spawn 2048 instances inside one tick) re-parses
 * the SAME skeleton thousands of times - a multi-second frame that lands
 * inside the measured window and can trip the stall-abort on devices that
 * render the density fine. SkeletonData is immutable + shareable across Spine
 * instances (this mirrors what Spine.from does with its own Cache). */
const skeletonDataCache = new Map<string, SkeletonData>();

/** Build a Spine from already-loaded assets using the lenient loader. */
function spineFrom(skelAlias: string, atlasAlias: string): Spine {
  const key = `${skelAlias}\n${atlasAlias}`;
  let skeletonData = skeletonDataCache.get(key);
  if (!skeletonData) {
    const atlas = Assets.get(atlasAlias) as TextureAtlas;
    const loader = new LenientAtlasAttachmentLoader(atlas);
    const raw = Assets.get(skelAlias) as unknown;
    const parser =
      raw instanceof Uint8Array ? new SkeletonBinary(loader) : new SkeletonJson(loader);
    skeletonData = parser.readSkeletonData(raw as never);
    skeletonDataCache.set(key, skeletonData);
    buildStats.missingRegions += loader.missing;
  }
  buildStats.spines++;
  return new Spine({ skeletonData, autoUpdate: true });
}

/** Where scene assets are served from. Local dev serves the symlinked game
 * tree at /games/; production points at the S3 bucket. Override at runtime via
 * `window.__ASSET_BASE` (set before building a scene). */
function assetBase(): string {
  const g = (globalThis as { __ASSET_BASE?: string }).__ASSET_BASE;
  return g ?? "/games/";
}

/** Collect every unique skeleton+atlas pair referenced by a descriptor. */
function collectAssets(d: SceneDescriptor): Map<string, { skel: string; atlas: string }> {
  const out = new Map<string, { skel: string; atlas: string }>();
  const add = (skel: string, atlas: string) => {
    if (!out.has(skel)) out.set(skel, { skel, atlas });
  };
  for (const p of d.background) add(p.skel, p.atlas);
  for (const p of d.overlays) add(p.skel, p.atlas);
  if (d.grid) for (const s of d.grid.symbols) add(s.skel, s.atlas);
  if (d.stress) for (const s of d.stress.symbols) add(s.skel, s.atlas);
  return out;
}

const aliasFor = (skel: string) => skel.replace(/[^\w]+/g, "_");

/** Aliases already registered with Assets, so we never re-`add` (which spams
 * pixi's "already has key overwriting" warning). */
const registered = new Set<string>();
function addOnce(alias: string, src: string): void {
  if (registered.has(alias)) return;
  Assets.add({ alias, src });
  registered.add(alias);
}

export interface LoadProgress {
  (loaded: number, total: number): void;
}

/**
 * One dedup'd preload of every asset across ALL scenes. This is the load-all
 * gate: it resolves only when every asset has settled (loaded or failed), so
 * the runner never starts measuring on a cold cache. Each alias is registered
 * exactly once (no re-add spam); `allSettled` keeps a bad path non-fatal.
 * `onProgress` reports a 0..1 fraction.
 */
export async function preloadAllScenes(
  scenes: SceneDescriptor[],
  onProgress?: (fraction: number) => void,
): Promise<void> {
  const base = assetBase();
  const srcByAlias = new Map<string, string>();
  for (const d of scenes) {
    for (const { skel, atlas } of collectAssets(d).values()) {
      srcByAlias.set(aliasFor(skel), base + skel);
      srcByAlias.set(aliasFor(atlas), base + atlas);
    }
  }
  const entries = [...srcByAlias.entries()];
  for (const [alias, src] of entries) addOnce(alias, src);
  let done = 0;
  onProgress?.(0);
  await Promise.allSettled(
    entries.map(async ([alias]) => {
      try {
        await Assets.load(alias);
      } finally {
        done++;
        onProgress?.(done / entries.length);
      }
    }),
  );
}

/** The Assets aliases (skeleton + atlas) a scene references. */
export function sceneAssetAliases(d: SceneDescriptor): string[] {
  const out: string[] = [];
  for (const { skel, atlas } of collectAssets(d).values()) {
    out.push(aliasFor(skel), aliasFor(atlas));
  }
  return out;
}

/** Unload assets (frees CPU + GPU texture memory). Used to release a game's
 * atlases once no later scene needs them, so 18 games' textures don't all stay
 * resident on the GPU (the main cause of iOS WebGL context loss). */
export async function unloadAliases(aliases: string[]): Promise<void> {
  // parsed SkeletonData holds references into the unloaded atlas textures -
  // drop every cache entry touching an unloaded alias so a later (resume)
  // build can't construct spines over destroyed textures.
  for (const key of [...skeletonDataCache.keys()]) {
    const [sk, at] = key.split("\n");
    if (aliases.includes(sk) || aliases.includes(at)) skeletonDataCache.delete(key);
  }
  for (const a of aliases) {
    registered.delete(a);
    try {
      await Assets.unload(a);
    } catch {
      /* not loaded / already gone */
    }
  }
}

/** Register + load every asset a descriptor needs. Resolves when ready. */
export async function loadSceneAssets(
  d: SceneDescriptor,
  onProgress?: LoadProgress,
): Promise<void> {
  const assets = collectAssets(d);
  const base = assetBase();
  const aliases: string[] = [];
  for (const { skel, atlas } of assets.values()) {
    const skAlias = aliasFor(skel);
    const atAlias = aliasFor(atlas);
    addOnce(skAlias, base + skel);
    addOnce(atAlias, base + atlas);
    aliases.push(skAlias, atAlias);
  }
  const unique = [...new Set(aliases)];
  let done = 0;
  // allSettled: a single bad asset path must not fail the whole scene load -
  // the reconstructor tolerates the missing piece (blank) and renders the rest.
  await Promise.allSettled(
    unique.map(async (a) => {
      try {
        await Assets.load(a);
      } finally {
        done++;
        onProgress?.(done, unique.length);
      }
    }),
  );
}

interface AnimDef {
  name: string;
  duration: number;
}

/**
 * Pick an animation to loop. Prefers an exact requested name, then a
 * conventional idle/loop name, then the longest animation (the most
 * representative continuous motion) - so a symbol without a literal "idle"
 * still visibly animates instead of sitting in its setup pose.
 */
function pickLoopAnim(anims: AnimDef[], preferred?: string | null): string | undefined {
  if (anims.length === 0) return undefined;
  if (preferred) {
    const exact = anims.find((a) => a.name === preferred);
    if (exact) return exact.name;
  }
  const idle =
    anims.find((a) => /^(idle|loop|idle_?loop|idle_?1|main|animation)$/i.test(a.name)) ??
    anims.find((a) => /idle|loop/i.test(a.name));
  if (idle) return idle.name;
  return anims.reduce((a, b) => (b.duration > a.duration ? b : a)).name;
}

function makeSpine(p: Placement): Spine {
  const spine = spineFrom(aliasFor(p.skel), aliasFor(p.atlas));
  spine.x = p.x;
  spine.y = p.y;
  if (p.scale != null) spine.scale.set(p.scale);
  const want = pickLoopAnim(spine.skeleton.data.animations, p.anim);
  if (want) spine.state.setAnimation(0, want, p.loop ?? true);
  return spine;
}

/**
 * Build the scene into a fresh container (already asset-loaded). Does NOT fit;
 * call {@link fitContainer} with the current viewport afterwards.
 */
/** Build a placement spine, tolerating a failed/absent asset (returns null). */
function tryMakeSpine(p: Placement): Spine | null {
  try {
    return makeSpine(p);
  } catch (err) {
    console.warn(`[scene] placement ${p.id} failed: ${(err as Error).message}`);
    return null;
  }
}

export function buildScene(d: SceneDescriptor): Container {
  const root = new Container();

  for (const p of d.background) {
    const s = tryMakeSpine(p);
    if (s) root.addChild(s);
  }

  if (d.grid) {
    const g = d.grid;
    const gw = g.cols * g.cellW;
    const gh = g.rows * g.cellH;
    const x0 = g.x - gw / 2 + g.cellW / 2;
    const y0 = g.y - gh / 2 + g.cellH / 2;
    const winSet = new Set((g.winCells ?? []).map(([c, r]) => `${c},${r}`));
    let k = 0;
    for (let r = 0; r < g.rows; r++) {
      for (let c = 0; c < g.cols; c++) {
        const sym = g.symbols[k % g.symbols.length];
        k++;
        let spine: Spine;
        try {
          spine = spineFrom(aliasFor(sym.skel), aliasFor(sym.atlas));
        } catch {
          continue;
        }
        spine.x = x0 + c * g.cellW;
        spine.y = y0 + r * g.cellH;
        if (g.scale != null) spine.scale.set(g.scale);
        const anims = spine.skeleton.data.animations;
        const isWin = winSet.has(`${c},${r}`);
        // winning-line cells play their heavier `win` animation when present;
        // everything else loops an idle (desynced so they don't blink in unison)
        const winName =
          isWin && g.winAnim ? anims.find((a) => a.name === g.winAnim)?.name : undefined;
        const want = winName ?? pickLoopAnim(anims, g.idleAnim);
        if (want) {
          const entry = spine.state.setAnimation(0, want, true);
          entry.trackTime = Math.random() * Math.max(0.01, entry.animation!.duration);
        }
        root.addChild(spine);
      }
    }
  }

  for (const p of d.overlays) {
    const s = tryMakeSpine(p);
    if (s) root.addChild(s);
  }

  return root;
}

/** Every live Spine in a built scene (all are direct children of the root). */
export function sceneSpines(root: Container): Spine[] {
  return root.children.filter((c): c is Spine => c instanceof Spine);
}

/**
 * One randomized symbol instance for a density stress ramp. Animation is chosen
 * per {@link mode} (idle / win / a random mix) and desynced; the caller places
 * and scales it. autoUpdate is off (the engine drives updates). Returns null if
 * the asset failed so the caller can try another.
 */
export function makeStressSpine(
  sym: { skel: string; atlas: string },
  mode: "idle" | "win" | "mix" = "mix",
): Spine | null {
  let spine: Spine;
  try {
    spine = spineFrom(aliasFor(sym.skel), aliasFor(sym.atlas));
  } catch {
    return null;
  }
  const all = spine.skeleton.data.animations;
  let name: string | undefined;
  if (mode === "win") name = all.find((a) => /win/i.test(a.name))?.name ?? pickLoopAnim(all);
  else if (mode === "mix") name = all.length ? all[Math.floor(Math.random() * all.length)].name : undefined;
  else name = pickLoopAnim(all);
  if (name) {
    const entry = spine.state.setAnimation(0, name, true);
    entry.trackTime = Math.random() * Math.max(0.01, entry.animation!.duration);
  }
  spine.autoUpdate = false;
  return spine;
}

export interface FitResult {
  scale: number;
  areaPx: number;
  bounds: { w: number; h: number };
}

/**
 * Uniform "contain" fit: scale the whole container down (or up) so its bounds
 * fit inside viewport with `margin` (0..1) padding, centered. Returns the
 * applied scale + resulting on-screen area (for the report to normalise RI).
 */
/**
 * Robust fit bounds. Unions each child's bounds but DISCARDS outliers - a
 * background spine with a stray far-off bone/attachment (or a blank attachment
 * from the lenient loader) would otherwise blow the union up and shrink the
 * whole scene to a black speck. Anything wider/taller than `maxW`/`maxH`
 * (a multiple of the game's reference frame) is ignored, and the result is
 * unioned with the reference frame so small scenes don't over-zoom.
 */
function robustBounds(root: Container, refW: number, refH: number): Rectangle {
  const maxW = refW * 2.5;
  const maxH = refH * 2.5;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const child of root.children) {
    let cb: Rectangle;
    try {
      cb = child.getBounds().rectangle;
    } catch {
      continue;
    }
    if (
      !Number.isFinite(cb.x) || !Number.isFinite(cb.y) ||
      !Number.isFinite(cb.width) || !Number.isFinite(cb.height) ||
      cb.width <= 0 || cb.height <= 0 ||
      cb.width > maxW || cb.height > maxH
    ) {
      continue;
    }
    minX = Math.min(minX, cb.x);
    minY = Math.min(minY, cb.y);
    maxX = Math.max(maxX, cb.x + cb.width);
    maxY = Math.max(maxY, cb.y + cb.height);
  }
  // anchor to the reference frame (centered on origin) so the scene sits at a
  // sane scale even when content is tiny or entirely skipped
  minX = Math.min(minX, -refW / 2);
  minY = Math.min(minY, -refH / 2);
  maxX = Math.max(maxX, refW / 2);
  maxY = Math.max(maxY, refH / 2);
  return new Rectangle(minX, minY, maxX - minX, maxY - minY);
}

export function fitContainer(
  root: Container,
  vw: number,
  vh: number,
  refW = 1920,
  refH = 1080,
  margin = 0.94,
): FitResult {
  root.scale.set(1);
  root.position.set(0, 0);
  const b = robustBounds(root, refW, refH);
  const w = Math.max(1, b.width);
  const h = Math.max(1, b.height);
  const scale = Math.min((vw * margin) / w, (vh * margin) / h);
  root.scale.set(scale);
  // center the bounds in the viewport
  root.position.set(
    vw / 2 - (b.x + w / 2) * scale,
    vh / 2 - (b.y + h / 2) * scale,
  );
  return { scale, areaPx: w * scale * (h * scale), bounds: { w, h } };
}
