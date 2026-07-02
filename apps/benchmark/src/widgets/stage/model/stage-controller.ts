import { Application, Container, Graphics } from "pixi.js";
import { mountCrawler, type Crawler } from "@spine-benchmark/pixi-crawler";
import { animate } from "animejs";
import type { Spine } from "@esotericsoftware/spine-pixi-v8";

import { MaterializeFilter } from "@/entities/skeleton";
import { GRID_MINOR, GRID_MAJOR, MATERIALIZE_MS } from "@/shared/config/constants";
import { useViewStore } from "./view-store";

const STAGE_BG = 0x1e1e1e;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 6;
const EASE = 0.22; // camera smoothing per frame

/**
 * A per-frame draw callback for tool overlays (bones, mesh weights). It draws
 * into a Graphics that is parented to the active Spine, so it shares the
 * skeleton's transform and coordinate space (spine-pixi-v8 reports world coords
 * directly in this local Y-down space) and updates live as bones move.
 */
export type OverlayDraw = (g: Graphics, spine: Spine) => void;

interface Camera {
  /** screen-space offset of the world origin from the screen centre */
  panX: number;
  panY: number;
  zoom: number;
}

/**
 * Imperative owner of the pixi stage. Lives outside React because the pixi
 * Application, the grid, and the active Spine have a lifecycle that does not map
 * cleanly onto render passes.
 *
 * The grid and the skeleton share one world: the skeleton sits at the world
 * origin and the grid's axis cross is the origin, so the skeleton is always at
 * the centre of the grid no matter how the camera pans. An eased camera (pan +
 * zoom) is applied on top: worldLayer is transformed by it, and the grid is
 * re-projected to screen space each time the camera moves (lines stay a crisp
 * 1px at any zoom).
 *
 * Layering (back to front): gridLayer -> worldLayer(spine + overlay).
 */
class StageController {
  private app: Application | null = null;
  /** Live performance crawler mounted on the stage - the site's measurement
   *  instrument (workload/gpu cost, phase timing) for the budget meter. */
  private crawler: Crawler | null = null;
  private gridLayer = new Graphics();
  private worldLayer = new Container();
  private spine: Spine | null = null;
  private initialized = false;

  /** overlay graphics parented to the current spine, redrawn every tick */
  private overlayGfx: Graphics | null = null;
  private overlayDraw: OverlayDraw | null = null;

  private cam: Camera = { panX: 0, panY: 0, zoom: 1 };
  private camTarget: Camera = { panX: 0, panY: 0, zoom: 1 };
  private camDirty = true;
  private lastPct = 100;

  // drag-pan state
  private dragging = false;
  private dragStart = { sx: 0, sy: 0, panX: 0, panY: 0 };

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
    app.canvas.style.cursor = "grab";
    app.canvas.style.touchAction = "none";

    app.stage.addChild(this.gridLayer);
    app.stage.addChild(this.worldLayer);

    app.canvas.addEventListener("wheel", this.onWheel, { passive: false });
    app.canvas.addEventListener("pointerdown", this.onPointerDown);
    window.addEventListener("pointermove", this.onPointerMove);
    window.addEventListener("pointerup", this.onPointerUp);

    app.renderer.on("resize", () => {
      this.camDirty = true;
    });
    app.ticker.add(this.tick);

    // Mount the crawler as the stage's live measurement instrument (headless).
    // The DeviceMeter reads its measured workload/gpu cost each sample.
    this.crawler = mountCrawler(app, {
      hud: false,
      spineProfile: { enabled: true },
      bufferSize: 120,
      autoDispose: false,
    });
    this.camDirty = true;
  }

  private get screenCx(): number {
    return (this.app?.screen.width ?? 0) / 2;
  }
  private get screenCy(): number {
    return (this.app?.screen.height ?? 0) / 2;
  }

  // ---- camera -------------------------------------------------------------

  private tick = (): void => {
    if (this.camDirty) this.stepCamera();
    if (this.overlayGfx && this.spine) {
      this.overlayGfx.clear();
      if (this.overlayDraw) this.overlayDraw(this.overlayGfx, this.spine);
    }
  };

  private stepCamera(): void {
    const t = this.camTarget;
    const c = this.cam;
    c.panX += (t.panX - c.panX) * EASE;
    c.panY += (t.panY - c.panY) * EASE;
    c.zoom += (t.zoom - c.zoom) * EASE;

    const settled =
      Math.abs(t.panX - c.panX) < 0.1 &&
      Math.abs(t.panY - c.panY) < 0.1 &&
      Math.abs(t.zoom - c.zoom) < 0.0005;
    if (settled) {
      this.cam = { ...t };
      this.camDirty = false;
    }

    this.applyCamera();
    this.drawGrid();

    const pct = Math.round(this.cam.zoom * 100);
    if (pct !== this.lastPct) {
      this.lastPct = pct;
      useViewStore.getState().setZoom(this.cam.zoom);
    }
  }

  private applyCamera(): void {
    this.worldLayer.position.set(
      this.screenCx + this.cam.panX,
      this.screenCy + this.cam.panY,
    );
    this.worldLayer.scale.set(this.cam.zoom);
  }

  /** screen position of the world origin under the *target* camera */
  private originScreen(cam: Camera): { x: number; y: number } {
    return { x: this.screenCx + cam.panX, y: this.screenCy + cam.panY };
  }

  /** Zoom toward a screen point (keeps the world point under it fixed). */
  private zoomAt(sx: number, sy: number, factor: number): void {
    const t = this.camTarget;
    const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, t.zoom * factor));
    const o = this.originScreen(t);
    // world point currently under (sx, sy)
    const wx = (sx - o.x) / t.zoom;
    const wy = (sy - o.y) / t.zoom;
    // solve new pan so that same world point stays under the cursor
    t.panX = sx - this.screenCx - wx * nextZoom;
    t.panY = sy - this.screenCy - wy * nextZoom;
    t.zoom = nextZoom;
    this.camDirty = true;
  }

  /** Zoom around the screen centre (used by the +/- buttons). */
  zoomBy(factor: number): void {
    this.zoomAt(this.screenCx, this.screenCy, factor);
  }

  /** Ease the camera back to the default framing. */
  resetView(): void {
    this.camTarget = { panX: 0, panY: 0, zoom: 1 };
    this.camDirty = true;
  }

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    if (!this.app) return;
    const rect = this.app.canvas.getBoundingClientRect();
    const factor = Math.exp(-e.deltaY * 0.0015);
    this.zoomAt(e.clientX - rect.left, e.clientY - rect.top, factor);
  };

  private onPointerDown = (e: PointerEvent): void => {
    if (e.button !== 0 || !this.app) return;
    this.dragging = true;
    this.dragStart = {
      sx: e.clientX,
      sy: e.clientY,
      panX: this.camTarget.panX,
      panY: this.camTarget.panY,
    };
    this.app.canvas.style.cursor = "grabbing";
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (!this.dragging) return;
    this.camTarget.panX = this.dragStart.panX + (e.clientX - this.dragStart.sx);
    this.camTarget.panY = this.dragStart.panY + (e.clientY - this.dragStart.sy);
    this.camDirty = true;
  };

  private onPointerUp = (): void => {
    if (!this.dragging) return;
    this.dragging = false;
    if (this.app) this.app.canvas.style.cursor = "grab";
  };

  // ---- grid ---------------------------------------------------------------

  /**
   * A pixel grid that reads true at scale 1 (one minor cell === GRID_MINOR
   * world px). Drawn in screen space by projecting world-spaced lines through
   * the camera, so lines stay a crisp 1px and the axis cross sits on the world
   * origin (where the skeleton is). Lines fade toward the screen edges; minors
   * drop out when the camera is zoomed far enough that they'd crowd.
   */
  private drawGrid(): void {
    if (!this.app) return;
    const { width, height } = this.app.screen;
    const g = this.gridLayer;
    g.clear();

    const cx = width / 2;
    const cy = height / 2;
    const maxDist = Math.hypot(width, height) / 2;
    const o = this.originScreen(this.cam);
    const step = GRID_MINOR * this.cam.zoom; // minor spacing in screen px
    const majorEvery = GRID_MAJOR / GRID_MINOR;
    const drawMinor = step >= 6; // hide minors when they would crowd

    const color = 0xffffff;
    const axisColor = 0xd8d8d8;
    const falloff = (d: number) => Math.pow(1 - Math.min(d / maxDist, 1), 1.6);

    // vertical lines: world x = k * GRID_MINOR
    const kx0 = Math.floor((0 - o.x) / step);
    const kx1 = Math.ceil((width - o.x) / step);
    for (let k = kx0; k <= kx1; k++) {
      const isMajor = k % majorEvery === 0;
      if (!isMajor && !drawMinor) continue;
      const x = o.x + k * step;
      const alpha = (isMajor ? 0.16 : 0.06) * falloff(Math.abs(x - cx));
      g.moveTo(x, 0).lineTo(x, height).stroke({ width: 1, color, alpha });
    }

    // horizontal lines: world y = k * GRID_MINOR
    const ky0 = Math.floor((0 - o.y) / step);
    const ky1 = Math.ceil((height - o.y) / step);
    for (let k = ky0; k <= ky1; k++) {
      const isMajor = k % majorEvery === 0;
      if (!isMajor && !drawMinor) continue;
      const y = o.y + k * step;
      const alpha = (isMajor ? 0.16 : 0.06) * falloff(Math.abs(y - cy));
      g.moveTo(0, y).lineTo(width, y).stroke({ width: 1, color, alpha });
    }

    // axis cross on the world origin (the skeleton)
    if (o.x >= 0 && o.x <= width) {
      g.moveTo(o.x, 0).lineTo(o.x, height).stroke({ width: 1, color: axisColor, alpha: 0.4 });
    }
    if (o.y >= 0 && o.y <= height) {
      g.moveTo(0, o.y).lineTo(width, o.y).stroke({ width: 1, color: axisColor, alpha: 0.4 });
    }
  }

  // ---- skeleton -----------------------------------------------------------

  /** Install (or clear, with null) the active tool overlay draw callback. */
  setOverlay(draw: OverlayDraw | null): void {
    this.overlayDraw = draw;
    if (!draw && this.overlayGfx) this.overlayGfx.clear();
  }

  /**
   * Mount a freshly-loaded skeleton (or clear it when null). The skeleton is
   * shown on its first setup-pose frame - no animation is ever played - and
   * grains in via the materialize filter. Any previous skeleton is destroyed
   * first, and the camera snaps back to default so the new one is framed.
   */
  setSpine(spine: Spine | null): void {
    if (spine === this.spine) return;
    this.clearSpine();
    if (!spine || !this.app) return;

    // a new skeleton resets the view (snap, not eased)
    this.cam = { panX: 0, panY: 0, zoom: 1 };
    this.camTarget = { panX: 0, panY: 0, zoom: 1 };
    this.camDirty = true;

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

  /** Live measured workload cost of the current frame window (device+game
   *  independent open measure), or undefined before the crawler has frames. */
  getWorkloadCost() {
    return this.crawler?.getWorkloadCost();
  }

  /** Live measured GPU cost (fill footprint + filters) of the current frame. */
  getGpuCost() {
    return this.crawler?.getGpuCost();
  }

  /** ACTUAL measured ms of the latest rendered frame - true GPU time (EXT
   *  timer query, null without one) and total CPU (the whole ticker-tick,
   *  prePixi + pixi). This is a real measurement, not a prediction from
   *  skeleton features - prefer it over predictDeviceCost's estimate when
   *  a live crawler frame is available. */
  getMeasuredMs(): { gpuMs: number | null; cpuMs: number } | undefined {
    const frame = this.crawler?.getLastFrame();
    if (!frame) return undefined;
    return { gpuMs: frame.gpuMs ?? null, cpuMs: frame.measuredCpuMs };
  }

  destroy(): void {
    if (this.app) {
      this.app.canvas.removeEventListener("wheel", this.onWheel);
      this.app.canvas.removeEventListener("pointerdown", this.onPointerDown);
    }
    window.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerup", this.onPointerUp);
    this.clearSpine();
    void this.crawler?.dispose();
    this.crawler = null;
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
