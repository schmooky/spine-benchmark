import {
  Application,
  Container,
  Graphics,
  Sprite,
  Texture,
  BlurFilter,
  ColorMatrixFilter,
} from "pixi.js";
import { mountCrawler } from "@spine-benchmark/pixi-crawler";

/**
 * Pixi Crawler demo - a minimal, self-contained scene that exercises the
 * crawler's measurement axes (draw calls, transforms, fill, filters, masks) so
 * the HUD has something to show. The whole crawler integration is the single
 * `mountCrawler(app)` call below; everything else is just moving sprites.
 *
 * Press +/- to add or remove instances and watch the HUD react.
 */

const host = document.getElementById("pixi-container") as HTMLElement;

async function main(): Promise<void> {
  const app = new Application();
  await app.init({
    background: 0x0e1116,
    resizeTo: window,
    antialias: false,
    // The Application owns its ticker (NOT Ticker.shared) - a crawler contract.
  });
  host.appendChild(app.canvas);

  // A small sprite texture drawn once and reused (batches well).
  const g = new Graphics().circle(16, 16, 15).fill(0x6ea8fe);
  const tex: Texture = app.renderer.generateTexture(g);

  // Layer 1: a swarm of moving sprites (draw calls + transforms + fill).
  const swarm = new Container();
  app.stage.addChild(swarm);
  const sprites: { s: Sprite; vx: number; vy: number }[] = [];
  const add = (n: number) => {
    for (let i = 0; i < n; i++) {
      const s = new Sprite(tex);
      s.anchor.set(0.5);
      s.x = Math.random() * app.screen.width;
      s.y = Math.random() * app.screen.height;
      s.tint = Math.random() * 0xffffff;
      swarm.addChild(s);
      sprites.push({ s, vx: (Math.random() - 0.5) * 3, vy: (Math.random() - 0.5) * 3 });
    }
  };
  const remove = (n: number) => {
    for (let i = 0; i < n && sprites.length; i++) sprites.pop()!.s.destroy();
  };
  add(200);

  // Layer 2: a filtered container (filter passes) with a masked child (stencil).
  const fancy = new Container();
  fancy.filters = [new BlurFilter({ strength: 4 }), new ColorMatrixFilter()];
  const panel = new Graphics().roundRect(0, 0, 220, 140, 16).fill(0x1b2330);
  panel.position.set(24, 24);
  const maskShape = new Graphics().roundRect(0, 0, 220, 140, 16).fill(0xffffff);
  maskShape.position.set(24, 24);
  panel.mask = maskShape;
  fancy.addChild(maskShape, panel);
  app.stage.addChild(fancy);

  app.ticker.add(() => {
    const w = app.screen.width;
    const h = app.screen.height;
    for (const it of sprites) {
      it.s.x += it.vx;
      it.s.y += it.vy;
      it.s.rotation += 0.02;
      if (it.s.x < 0 || it.s.x > w) it.vx *= -1;
      if (it.s.y < 0 || it.s.y > h) it.vy *= -1;
    }
  });

  window.addEventListener("keydown", (e) => {
    if (e.key === "+" || e.key === "=") add(100);
    else if (e.key === "-" || e.key === "_") remove(100);
  });

  // The entire integration: one call. HUD visible; auto-dispose on page hide.
  mountCrawler(app);

  const overlay = document.getElementById("welcome");
  const dismiss = () => overlay?.remove();
  window.addEventListener("keydown", dismiss, { once: true });
  overlay?.addEventListener("click", dismiss);
}

void main();
