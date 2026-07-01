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

/** Build a Spine from already-loaded assets using the lenient loader. */
function spineFrom(skelAlias: string, atlasAlias: string): Spine {
  const atlas = Assets.get(atlasAlias) as TextureAtlas;
  const loader = new LenientAtlasAttachmentLoader(atlas);
  const raw = Assets.get(skelAlias) as unknown;
  const parser =
    raw instanceof Uint8Array ? new SkeletonBinary(loader) : new SkeletonJson(loader);
  const skeletonData = parser.readSkeletonData(raw as never);
  buildStats.missingRegions += loader.missing;
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
  return out;
}

const aliasFor = (skel: string) => skel.replace(/[^\w]+/g, "_");

export interface LoadProgress {
  (loaded: number, total: number): void;
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
    if (!Assets.cache.has(skAlias)) Assets.add({ alias: skAlias, src: base + skel });
    if (!Assets.cache.has(atAlias)) Assets.add({ alias: atAlias, src: base + atlas });
    aliases.push(skAlias, atAlias);
  }
  const unique = [...new Set(aliases)];
  let done = 0;
  await Promise.all(
    unique.map(async (a) => {
      await Assets.load(a);
      done++;
      onProgress?.(done, unique.length);
    }),
  );
}

function makeSpine(p: Placement): Spine {
  const spine = spineFrom(aliasFor(p.skel), aliasFor(p.atlas));
  spine.x = p.x;
  spine.y = p.y;
  if (p.scale != null) spine.scale.set(p.scale);
  const anims = spine.skeleton.data.animations;
  const want = p.anim && anims.find((a) => a.name === p.anim) ? p.anim : anims[0]?.name;
  if (want) spine.state.setAnimation(0, want, p.loop ?? true);
  return spine;
}

/**
 * Build the scene into a fresh container (already asset-loaded). Does NOT fit;
 * call {@link fitContainer} with the current viewport afterwards.
 */
export function buildScene(d: SceneDescriptor): Container {
  const root = new Container();

  for (const p of d.background) root.addChild(makeSpine(p));

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
        const spine = spineFrom(aliasFor(sym.skel), aliasFor(sym.atlas));
        spine.x = x0 + c * g.cellW;
        spine.y = y0 + r * g.cellH;
        if (g.scale != null) spine.scale.set(g.scale);
        const anims = spine.skeleton.data.animations;
        const isWin = winSet.has(`${c},${r}`);
        // winning-line cells play their heavier `win` animation when present;
        // everything else idles (desynced so they don't blink in unison)
        const winName = g.winAnim && anims.find((a) => a.name === g.winAnim) ? g.winAnim : null;
        const idleName = g.idleAnim && anims.find((a) => a.name === g.idleAnim) ? g.idleAnim : anims[0]?.name;
        const want = isWin && winName ? winName : idleName;
        if (want) {
          const entry = spine.state.setAnimation(0, want, true);
          entry.trackTime = Math.random() * Math.max(0.01, entry.animation!.duration);
        }
        root.addChild(spine);
      }
    }
  }

  for (const p of d.overlays) root.addChild(makeSpine(p));

  return root;
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
/** Union of children's bounds, skipping any child whose bounds are degenerate
 * or non-finite (a blank attachment from the lenient loader can poison a whole
 * getLocalBounds()). Falls back to the reference frame if nothing is valid. */
function safeBounds(root: Container): Rectangle {
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
      cb.width <= 0 || cb.height <= 0
    ) {
      continue;
    }
    minX = Math.min(minX, cb.x);
    minY = Math.min(minY, cb.y);
    maxX = Math.max(maxX, cb.x + cb.width);
    maxY = Math.max(maxY, cb.y + cb.height);
  }
  if (!Number.isFinite(minX)) return new Rectangle(-960, -540, 1920, 1080);
  return new Rectangle(minX, minY, maxX - minX, maxY - minY);
}

export function fitContainer(
  root: Container,
  vw: number,
  vh: number,
  margin = 0.94,
): FitResult {
  root.scale.set(1);
  root.position.set(0, 0);
  let b: Rectangle;
  try {
    b = root.getLocalBounds();
    if (!Number.isFinite(b.width) || !Number.isFinite(b.height) || b.width <= 0 || b.height <= 0) {
      b = safeBounds(root);
    }
  } catch {
    b = safeBounds(root);
  }
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
