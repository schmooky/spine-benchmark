import { Application, Container, Graphics } from "pixi.js";
import { animate } from "animejs";
import type { Spine } from "@esotericsoftware/spine-pixi-v8";

import { MaterializeFilter } from "@/entities/skeleton";
import { GRID_MINOR, GRID_MAJOR, MATERIALIZE_MS } from "@/shared/config/constants";

const STAGE_BG = 0x1e1e1e;

/**
 * A per-frame draw callback for tool overlays (bones, mesh weights). It draws
 * into a Graphics that is parented to the active Spine, so it shares the
 * skeleton's transform and coordinate space (spine-pixi-v8 reports world coords
 * directly in this local Y-down space) and updates live as bones move.
 */
export type OverlayDraw = (g: Graphics, spine: Spine) => void;

/**
 * Imperative owner of the pixi stage. Lives outside React because the pixi
 * Application, the grid, and the active Spine display object all have a
 * lifecycle that does not map cleanly onto render passes. The React host
 * (StageCanvas) only drives it: init / resize / setSpine.
 *
 * Layering (back to front): gridLayer -> worldLayer(spine + overlay).
 */
class StageController {
  private app: Application | null = null;
  private gridLayer = new Graphics();
  private worldLayer = new Container();
  private spine: Spine | null = null;
  private initialized = false;

  /** overlay graphics parented to the current spine, redrawn every tick */
  private overlayGfx: Graphics | null = null;
  private overlayDraw: OverlayDraw | null = null;

  async init(parent: HTMLElement): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    const app = new Application();
    await app.init({
      resizeTo: parent,
      background: STAGE_BG,
      antialias: true,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      powerPreference: "high-performance",
    });
    // init() can race with an unmount in React StrictMode; bail cleanly.
    if (!this.initialized) {
      app.destroy(true);
      return;
    }
    this.app = app;
    parent.appendChild(app.canvas);

    app.stage.addChild(this.gridLayer);
    app.stage.addChild(this.worldLayer);

    app.renderer.on("resize", () => this.layout());
    app.ticker.add(this.tick);
    this.layout();
  }

  /** Redraw the active tool overlay every frame so it tracks live bone motion. */
  private tick = (): void => {
    if (!this.overlayGfx || !this.spine) return;
    this.overlayGfx.clear();
    if (this.overlayDraw) this.overlayDraw(this.overlayGfx, this.spine);
  };

  /** Install (or clear, with null) the active tool overlay draw callback. */
  setOverlay(draw: OverlayDraw | null): void {
    this.overlayDraw = draw;
    if (!draw && this.overlayGfx) this.overlayGfx.clear();
  }

  /** Re-centre the world and redraw the grid for the current screen size. */
  private layout(): void {
    if (!this.app) return;
    const { width, height } = this.app.screen;
    this.worldLayer.position.set(width / 2, height / 2);
    this.drawGrid(width, height);
  }

  /**
   * A pixel grid that reads true at scale 1 (one minor cell === GRID_MINOR
   * skeleton px). Lines fade out toward the screen edges via per-line alpha so
   * it feels soft and deep rather than like graph paper. The central axes glow.
   */
  private drawGrid(width: number, height: number): void {
    const g = this.gridLayer;
    g.clear();

    const cx = width / 2;
    const cy = height / 2;
    const maxDist = Math.hypot(width, height) / 2;

    const minorColor = 0xffffff;
    const majorColor = 0xffffff;
    const axisColor = 0xd8d8d8; // neutral light grey, no accent hue

    const falloff = (d: number) => {
      const t = Math.min(d / maxDist, 1);
      return Math.pow(1 - t, 1.6); // crisp centre, soft edges
    };

    // vertical lines
    const firstX = cx - Math.ceil(cx / GRID_MINOR) * GRID_MINOR;
    for (let x = firstX; x <= width; x += GRID_MINOR) {
      const dist = Math.abs(x - cx);
      const isMajor = Math.round((x - cx) / GRID_MINOR) % (GRID_MAJOR / GRID_MINOR) === 0;
      const fade = falloff(dist);
      const baseAlpha = isMajor ? 0.16 : 0.06;
      g.moveTo(x, 0).lineTo(x, height).stroke({
        width: 1,
        color: isMajor ? majorColor : minorColor,
        alpha: baseAlpha * fade,
      });
    }

    // horizontal lines
    const firstY = cy - Math.ceil(cy / GRID_MINOR) * GRID_MINOR;
    for (let y = firstY; y <= height; y += GRID_MINOR) {
      const dist = Math.abs(y - cy);
      const isMajor = Math.round((y - cy) / GRID_MINOR) % (GRID_MAJOR / GRID_MINOR) === 0;
      const fade = falloff(dist);
      const baseAlpha = isMajor ? 0.16 : 0.06;
      g.moveTo(0, y).lineTo(width, y).stroke({
        width: 1,
        color: isMajor ? majorColor : minorColor,
        alpha: baseAlpha * fade,
      });
    }

    // glowing central axes
    g.moveTo(cx, 0).lineTo(cx, height).stroke({ width: 1, color: axisColor, alpha: 0.4 });
    g.moveTo(0, cy).lineTo(width, cy).stroke({ width: 1, color: axisColor, alpha: 0.4 });
  }

  /**
   * Mount a freshly-loaded skeleton (or clear it when null). The skeleton is
   * shown on its first setup-pose frame - no animation is ever played - and
   * grains in via the materialize filter. Any previous skeleton is destroyed
   * first: one active skeleton, nothing remembered.
   */
  setSpine(spine: Spine | null): void {
    if (spine === this.spine) return;
    this.clearSpine();
    if (!spine || !this.app) return;

    this.spine = spine;

    // centre on the skeleton's setup bounds, keep true scale 1
    const b = spine.getLocalBounds();
    spine.pivot.set(b.x + b.width / 2, b.y + b.height / 2);
    spine.position.set(0, 0);
    spine.scale.set(1);

    const filter = new MaterializeFilter(Math.floor(Math.abs(b.width) % 97));
    spine.filters = [filter];

    this.worldLayer.addChild(spine);

    // overlay graphics live inside the spine so tool draws share its transform
    this.overlayGfx = new Graphics();
    spine.addChild(this.overlayGfx);

    const tween = { p: 0 };
    animate(tween, {
      p: 1.15,
      duration: MATERIALIZE_MS,
      ease: "outCubic",
      onUpdate: () => {
        filter.progress = tween.p;
      },
      onComplete: () => {
        // drop the filter once fully materialized - it has done its job
        if (this.spine === spine) spine.filters = [];
      },
    });
  }

  private clearSpine(): void {
    if (!this.spine) return;
    this.worldLayer.removeChild(this.spine);
    this.spine.destroy(); // also destroys the parented overlayGfx
    this.spine = null;
    this.overlayGfx = null;
  }

  destroy(): void {
    this.clearSpine();
    if (this.app) {
      this.app.destroy(true, { children: true });
      this.app = null;
    }
    this.gridLayer = new Graphics();
    this.worldLayer = new Container();
    this.initialized = false;
  }
}

/** Single shared stage for the single active skeleton. */
export const stage = new StageController();
