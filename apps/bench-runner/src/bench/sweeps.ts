/**
 * Isolation sweeps: pixi-primitive micro-workloads that each stress ONE GPU
 * cost driver in isolation, so a ramp of the driver against true GPU ms
 * (EXT_disjoint_timer_query) regresses to that driver's weight (ms per unit).
 *
 * Ported from the reelnroll pixi-profiler benchmark harness
 * (fill/filter/mask/vert/rt sweeps). The profiler read its own instrumented
 * FrameRecord.counters to get the driver VALUE; our runner does not instrument
 * pixi's internal counters, but it does not need to: each sweep sets the level
 * N deterministically and the isolated driver value is an analytic function of
 * N (that is the whole point of isolating it), so `driverValue(N)` is exact.
 * The sweep engine ramps N, GPU-times each level, and records
 * (driverValue, gpuMs) pairs for the offline weight fit.
 *
 * These need a LIVE GPU timer (Android Chrome / desktop GL); on Safari/iOS the
 * EXT is absent and the sweep records null gpuMs (still exercises the workload,
 * just no fit signal) - the same first-class fallback the scene path uses.
 */
import {
  Application,
  Container,
  Graphics,
  Sprite,
  Texture,
  BlurFilter,
  ColorMatrixFilter,
  NoiseFilter,
  AlphaFilter,
  type Filter,
} from "pixi.js";

/** The GPU cost axis a sweep isolates. */
export type SweepDriver =
  | "fill"
  | "vertices"
  | "stencilMasks"
  | "renderTargets"
  | "filterPasses";

export interface SweepWorkload {
  /** Stable id / driver axis. */
  readonly id: SweepDriver;
  readonly label: string;
  /** Human note on what is isolated, for the report. */
  readonly description: string;
  /** Ascending ramp levels (N). */
  readonly levels: number[];
  /** Unit label for driverValue (px, verts, passes, ...). */
  readonly unit: string;
  /** Exact isolated-driver value at level N (device-invariant). */
  driverValue(n: number, app: Application): number;
  /** (Re)build the workload at level N on the app stage. */
  setLevel(app: Application, n: number): void;
  /** Optional per-frame update (e.g. invalidate render-texture caches). */
  update?(app: Application): void;
  /** Remove and free everything this workload added. */
  teardown(app: Application): void;
}

const DEFAULT_LEVELS = [1, 2, 4, 8, 16, 24, 32, 48, 64];

/** 4x4 white texture, scaled to fullscreen per instance -> pure overdraw. */
function whiteTex(): Texture {
  const c = document.createElement("canvas");
  c.width = 4;
  c.height = 4;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, 4, 4);
  return Texture.from(c);
}

/**
 * FILL: N fullscreen alpha sprites of one texture. They batch into ~1 draw
 * with no filters/masks, so gpu_ms is dominated by blended overdraw. Driver =
 * total shaded pixels = N x screen area.
 */
export function createFillSweep(): SweepWorkload {
  const root = new Container();
  let tex: Texture | null = null;
  return {
    id: "fill",
    label: "Fill (overdraw)",
    description: "N fullscreen alpha sprites - isolates blended fill-rate.",
    levels: DEFAULT_LEVELS,
    unit: "px",
    driverValue: (n, app) => n * app.screen.width * app.screen.height,
    setLevel(app, n) {
      if (!tex) tex = whiteTex();
      root.removeChildren().forEach((c) => c.destroy());
      if (!root.parent) app.stage.addChild(root);
      const W = app.screen.width;
      const H = app.screen.height;
      for (let i = 0; i < n; i++) {
        const s = new Sprite(tex);
        s.width = W;
        s.height = H;
        s.alpha = 0.5;
        root.addChild(s);
      }
    },
    teardown() {
      root.removeChildren().forEach((c) => c.destroy());
      root.destroy();
      tex?.destroy(true);
      tex = null;
    },
  };
}

/**
 * VERTICES: N 1x1 rects in a SINGLE Graphics, all at (0,0). Fill stays ~1px
 * (degenerate overlap) while index/vertex count grows linearly (6 indices per
 * rect), all in one batch. Isolates vertex-shader + primitive assembly.
 */
export function createVertexSweep(): SweepWorkload {
  let geo: Graphics | null = null;
  return {
    id: "vertices",
    label: "Vertices",
    description: "N 1x1 rects in one Graphics at (0,0) - isolates vertex/index throughput.",
    levels: [64, 256, 1024, 4096, 16384, 49152, 98304],
    unit: "verts",
    driverValue: (n) => n * 6,
    setLevel(app, n) {
      if (geo) {
        geo.destroy();
      }
      geo = new Graphics();
      app.stage.addChild(geo);
      for (let i = 0; i < n; i++) geo.rect(0, 0, 1, 1);
      if (n > 0) geo.fill(0x44aa88);
    },
    teardown() {
      geo?.destroy();
      geo = null;
    },
  };
}

/**
 * STENCIL MASKS: N independent Container-masked nodes (fixed small content +
 * a Graphics rect mask). Each Container mask routes through the StencilMask
 * pipe = one extra geometry pass + stencil test. Content is fixed so fill is
 * ~const. Driver = mask passes = N.
 */
export function createMaskSweep(): SweepWorkload {
  const root = new Container();
  return {
    id: "stencilMasks",
    label: "Stencil masks",
    description: "N container-masked nodes - isolates stencil-mask passes.",
    levels: DEFAULT_LEVELS,
    unit: "passes",
    driverValue: (n) => n,
    setLevel(app, n) {
      root.removeChildren().forEach((c) => c.destroy());
      if (!root.parent) app.stage.addChild(root);
      const W = app.screen.width;
      const H = app.screen.height;
      for (let i = 0; i < n; i++) {
        const x = (i * 37) % Math.max(1, W - 80);
        const y = (i * 53) % Math.max(1, H - 80);
        const masked = new Container();
        masked.addChild(new Graphics().rect(x, y, 60, 60).fill(0xff8844));
        const maskShape = new Graphics().rect(x + 10, y + 10, 40, 40).fill(0xffffff);
        root.addChild(maskShape);
        masked.mask = maskShape;
        root.addChild(masked);
      }
    },
    teardown() {
      root.removeChildren().forEach((c) => c.destroy());
      root.destroy();
    },
  };
}

/**
 * RENDER TARGETS: N cacheAsTexture containers, each invalidated every frame
 * (updateCacheTexture) so each re-renders into its own offscreen render target.
 * Driver = render-target switches = N. On TBDR GPUs this is tile store/load.
 */
export function createRenderTargetSweep(): SweepWorkload {
  const root = new Container();
  const cached: Container[] = [];
  return {
    id: "renderTargets",
    label: "Render targets",
    description: "N per-frame-invalidated cacheAsTexture containers - isolates RT switches.",
    levels: [1, 2, 4, 8, 16, 24, 32],
    unit: "switches",
    driverValue: (n) => n,
    setLevel(app, n) {
      root.removeChildren().forEach((c) => c.destroy());
      cached.length = 0;
      if (!root.parent) app.stage.addChild(root);
      for (let i = 0; i < n; i++) {
        const cachedC = new Container();
        cachedC.position.set((i * 24) % Math.max(1, app.screen.width - 24), 0);
        cachedC.addChild(new Graphics().rect(0, 0, 20, 20).fill(0x33aaee));
        root.addChild(cachedC);
        (cachedC as unknown as { cacheAsTexture(v: boolean): void }).cacheAsTexture(true);
        cached.push(cachedC);
      }
    },
    update() {
      // move a child + invalidate so the cache re-renders (RT switch) each frame
      for (const c of cached) {
        const child = c.children[0];
        if (child) child.x = (child.x + 1) % 4;
        (c as unknown as { updateCacheTexture?(): void }).updateCacheTexture?.();
      }
    },
    teardown() {
      root.removeChildren().forEach((c) => c.destroy());
      cached.length = 0;
      root.destroy();
    },
  };
}

/**
 * FILTER PASSES: one fullscreen sprite with N filters on its container. Each
 * filter is a ~fullscreen post-process pass; content fill is fixed so gpu_ms
 * tracks passes. Driver = filter passes = N.
 */
export function createFilterSweep(): SweepWorkload {
  const filtered = new Container();
  let tex: Texture | null = null;
  const pool: Filter[] = [
    new BlurFilter(),
    new ColorMatrixFilter(),
    new NoiseFilter(),
    new AlphaFilter(),
  ];
  return {
    id: "filterPasses",
    label: "Filter passes",
    description: "1 fullscreen sprite + N filters - isolates post-process passes.",
    levels: [0, 1, 2, 3, 4, 6, 8],
    unit: "passes",
    driverValue: (n) => n,
    setLevel(app, n) {
      if (!tex) tex = whiteTex();
      if (!filtered.parent) {
        const sprite = new Sprite(tex);
        sprite.width = app.screen.width;
        sprite.height = app.screen.height;
        filtered.addChild(sprite);
        app.stage.addChild(filtered);
      }
      // repeat the small pool up to N filters
      filtered.filters = Array.from({ length: n }, (_, i) => pool[i % pool.length]!);
    },
    teardown() {
      filtered.filters = [];
      filtered.removeChildren().forEach((c) => c.destroy());
      filtered.destroy();
      tex?.destroy(true);
      tex = null;
    },
  };
}

/** All isolation sweeps, in run order. */
export function createSweeps(): SweepWorkload[] {
  return [
    createFillSweep(),
    createVertexSweep(),
    createMaskSweep(),
    createRenderTargetSweep(),
    createFilterSweep(),
  ];
}
