/**
 * Standalone scene viewer (dev only): reconstructs a scene descriptor and
 * uniform-fits it to the window, with a small HUD. Lets us eyeball how a
 * reconstructed real-game scene looks before wiring it into the run plan.
 * Open /viewer.html; ?scene=<id> selects a scene, arrow keys cycle.
 */
import { Application, Container } from "pixi.js";
import { buildScene, loadSceneAssets, fitContainer, buildStats } from "../scenes/reconstruct";
import { starsOfEgyptScenes } from "../scenes/data/stars-of-egypt";
import type { SceneDescriptor } from "../scenes/types";

const SCENES: SceneDescriptor[] = [...starsOfEgyptScenes];

// generated descriptors for the rest of the games (public/scenes/scenes.json)
async function loadGenerated() {
  try {
    const res = await fetch("/scenes/scenes.json");
    if (res.ok) {
      const arr = (await res.json()) as SceneDescriptor[];
      SCENES.push(...arr);
    }
  } catch {
    /* dev-only; ignore */
  }
}

const hud = document.createElement("div");
hud.style.cssText =
  "position:fixed;left:8px;top:8px;z-index:10;font:12px ui-monospace,monospace;" +
  "color:#e6e6e6;background:#000a;padding:8px 10px;border-radius:8px;max-width:52ch;line-height:1.4;white-space:pre-wrap";
document.body.appendChild(hud);

async function main() {
  const app = new Application();
  await app.init({ background: 0x101014, resizeTo: window, antialias: false, autoDensity: true, resolution: Math.min(2, window.devicePixelRatio || 1) });
  document.body.appendChild(app.canvas);

  await loadGenerated();

  let idx = 0;
  const params = new URLSearchParams(location.search);
  // ?src=s3 loads assets from the bucket; otherwise the local /games/ symlink.
  if (params.get("src") === "s3") {
    (window as unknown as { __ASSET_BASE: string }).__ASSET_BASE =
      "https://s3.twcstorage.ru/spine-run/";
  }
  const want = params.get("scene");
  if (want) {
    const i = SCENES.findIndex((s) => s.id === want);
    if (i >= 0) idx = i;
  }

  let current: Container | null = null;

  async function show(i: number) {
    idx = (i + SCENES.length) % SCENES.length;
    const d = SCENES[idx];
    hud.textContent = `loading ${d.id} ...`;
    try {
      await loadSceneAssets(d, (l, t) => (hud.textContent = `${d.id}: loading assets ${l}/${t}`));
    } catch (e) {
      hud.textContent = `${d.id}: ASSET LOAD FAILED\n${(e as Error).message}`;
      (window as unknown as { __err: string }).__err = String(e);
      return;
    }
    (window as unknown as { __stage: string }).__stage = "assets-loaded";
    if (current) {
      app.stage.removeChild(current);
      current.destroy({ children: true });
    }
    buildStats.missingRegions = 0;
    buildStats.spines = 0;
    try {
      current = buildScene(d);
      (window as unknown as { __stage: string; __stats: unknown }).__stage = "built";
      (window as unknown as { __stats: unknown }).__stats = { ...buildStats };
    } catch (e) {
      hud.textContent = `${d.id}: BUILD FAILED\n${(e as Error).message}`;
      (window as unknown as { __err: string }).__err = String((e as Error).stack || e);
      return;
    }
    app.stage.addChild(current);
    const fit = fitContainer(current, app.screen.width, app.screen.height);
    hud.textContent =
      `${d.id}  (${idx + 1}/${SCENES.length})  tier=${d.tier}\n` +
      `${d.description}\n` +
      `fit-scale=${fit.scale.toFixed(3)}  bounds=${Math.round(fit.bounds.w)}x${Math.round(fit.bounds.h)}  ` +
      `on-screen~${Math.round(fit.areaPx / 1000)}k px2\n` +
      `[left/right] cycle scenes`;
    (window as unknown as { __fit: unknown }).__fit = fit;
  }

  window.addEventListener("resize", () => {
    if (current) fitContainer(current, app.screen.width, app.screen.height);
  });
  window.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") void show(idx + 1);
    if (e.key === "ArrowLeft") void show(idx - 1);
  });

  await show(idx);
}

void main();
