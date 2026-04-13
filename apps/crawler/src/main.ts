import '@esotericsoftware/spine-pixi-v8';
import { Spine } from '@esotericsoftware/spine-pixi-v8';
import {
  Application,
  Assets,
  BlurFilter,
  Container,
  Graphics,
  Sprite,
  Text,
  TextStyle,
} from 'pixi.js';
import { Crawler } from '@spine-benchmark/pixi-crawler';

/**
 * Pixi Crawler Demo - issue showcase
 *
 * The demo intentionally builds a scene where every crawler issue category
 * has a labeled subgroup that triggers it. Open the overlay (~) and walk
 * through the issue list - each entry should highlight a specific cell.
 *
 * Keyboard:
 *   ~   Toggle overlay         G   Toggle graph (FPS / DC / Budget)
 *   I   Toggle issues list     H   Toggle highlights
 *   R   Start/stop recording   P   Export report
 *   D   Toggle analysis mode   W   Open remote waterfall panel
 *   < > Cycle selected node
 *
 * Assets are pulled from packages/spinefolio/assets at vite-build time
 * (see vite.config.ts:viteStaticCopy). To extend the demo with your own
 * skeletons, drop them into apps/crawler/public/assets/user/ and reference
 * them in the USER_ASSETS section near the bottom of this file.
 */

// ─────────────────────────────────────────────────────────────────
// Asset registration
// ─────────────────────────────────────────────────────────────────

interface SkeletonRef {
  alias: string;
  jsonPath: string;
  atlasAlias: string;
}

const ATLASES: Record<string, string> = {
  spineboy: 'assets/spineboy/spineboy.atlas',
  high: 'assets/high.atlas',
  low: 'assets/low.atlas',
};

const SKELETONS: SkeletonRef[] = [
  { alias: 'spineboy', jsonPath: 'assets/spineboy/spineboy.json', atlasAlias: 'spineboy' },
  { alias: 'high_1', jsonPath: 'assets/high_1.json', atlasAlias: 'high' },
  { alias: 'high_2', jsonPath: 'assets/high_2.json', atlasAlias: 'high' },
  { alias: 'low_1', jsonPath: 'assets/low_1.json', atlasAlias: 'low' },
  { alias: 'low_2', jsonPath: 'assets/low_2.json', atlasAlias: 'low' },
  { alias: 'scatter', jsonPath: 'assets/scatter.json', atlasAlias: 'high' },
];

// ─────────────────────────────────────────────────────────────────
// Layout helpers
// ─────────────────────────────────────────────────────────────────

interface Cell {
  col: number;
  row: number;
  title: string;
  /** Crawler issue codes the cell is intended to trigger. Used in the label. */
  triggers: string[];
}

const CELL_W = 280;
const CELL_H = 240;
const COLS = 4;
const ROWS = 3;
const GUTTER = 16;

function cellPos(col: number, row: number, app: Application): { x: number; y: number } {
  const totalW = COLS * CELL_W + (COLS - 1) * GUTTER;
  const totalH = ROWS * CELL_H + (ROWS - 1) * GUTTER;
  const startX = (app.screen.width - totalW) / 2;
  const startY = (app.screen.height - totalH) / 2;
  return {
    x: startX + col * (CELL_W + GUTTER),
    y: startY + row * (CELL_H + GUTTER),
  };
}

function cellLabel(cell: Cell): Container {
  const wrap = new Container();
  wrap.label = `Label_${cell.title}`;

  const title = new Text({
    text: cell.title,
    style: new TextStyle({
      fontFamily: '"Courier New", monospace',
      fontSize: 12,
      fill: 0xb0e0ff,
      fontWeight: 'bold',
    }),
  });
  title.position.set(0, 0);

  const triggers = new Text({
    text: cell.triggers.join('  '),
    style: new TextStyle({
      fontFamily: '"Courier New", monospace',
      fontSize: 9,
      fill: 0x666666,
      lineHeight: 12,
    }),
  });
  triggers.position.set(0, 16);

  wrap.addChild(title);
  wrap.addChild(triggers);
  return wrap;
}

function cellFrame(): Graphics {
  const g = new Graphics();
  g.rect(0, 0, CELL_W, CELL_H);
  g.stroke({ color: 0x222a36, width: 1 });
  g.label = 'CellFrame';
  return g;
}

function cellRoot(cell: Cell, app: Application): Container {
  const root = new Container();
  const { x, y } = cellPos(cell.col, cell.row, app);
  root.position.set(x, y);
  root.label = `Cell_${cell.title}`;
  root.addChild(cellFrame());
  root.addChild(cellLabel(cell));
  return root;
}

// ─────────────────────────────────────────────────────────────────
// Spine factory
// ─────────────────────────────────────────────────────────────────

function makeSpine(
  ref: SkeletonRef,
  anim: string | null,
  loop: boolean,
  scale = 1,
): Spine | null {
  try {
    const s = Spine.from({ skeleton: ref.alias, atlas: ref.atlasAlias, autoUpdate: true });
    s.label = ref.alias;
    s.scale.set(scale);
    if (anim) {
      const anims = s.skeleton.data.animations.map((a) => a.name);
      const target = anims.includes(anim) ? anim : anims[0];
      if (target) s.state.setAnimation(0, target, loop);
    }
    return s;
  } catch (err) {
    console.warn(`[demo] Failed to instantiate ${ref.alias}:`, err);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────
// Bootstrap
// ─────────────────────────────────────────────────────────────────

(async () => {
  const app = new Application();
  await app.init({
    background: 0x080c14,
    resizeTo: window,
    antialias: true,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
    preference: 'webgl',
  });

  document.getElementById('pixi-container')!.appendChild(app.canvas);

  // Register all assets, then load.
  for (const [alias, src] of Object.entries(ATLASES)) {
    Assets.add({ alias, src });
  }
  for (const sk of SKELETONS) {
    Assets.add({ alias: sk.alias, src: sk.jsonPath });
  }
  await Assets.load([...Object.keys(ATLASES), ...SKELETONS.map((s) => s.alias)]);

  console.log('%c[demo]%c assets loaded', 'color:#4fc3f7;font-weight:bold', 'color:#888');

  const world = new Container();
  world.label = 'Showcase';
  app.stage.addChild(world);

  // ─────────────────────────────────────────────────────────────
  // Cell (0, 0) - clean spine baseline
  // ─────────────────────────────────────────────────────────────
  {
    const cell: Cell = {
      col: 0,
      row: 0,
      title: '01 Clean Spine',
      triggers: ['(no issues)'],
    };
    const root = cellRoot(cell, app);
    const ref = SKELETONS.find((s) => s.alias === 'spineboy')!;
    const sp = makeSpine(ref, 'walk', true, 0.18);
    if (sp) {
      sp.position.set(CELL_W / 2, CELL_H - 30);
      sp.label = 'CleanSpineboy';
      root.addChild(sp);
    }
    world.addChild(root);
  }

  // ─────────────────────────────────────────────────────────────
  // Cell (1, 0) - multi-atlas spine (uses two pages -> page switches)
  // ─────────────────────────────────────────────────────────────
  {
    const cell: Cell = {
      col: 1,
      row: 0,
      title: '02 Multi-atlas mix',
      triggers: ['SPINE_ATLAS_THRASH', 'SPINE_MULTI_ATLAS'],
    };
    const root = cellRoot(cell, app);
    const high = SKELETONS.find((s) => s.alias === 'high_1')!;
    const low = SKELETONS.find((s) => s.alias === 'low_1')!;
    const a = makeSpine(high, 'idle', true, 0.45);
    const b = makeSpine(low, 'idle', true, 0.45);
    if (a) {
      a.position.set(CELL_W * 0.32, CELL_H - 30);
      a.label = 'HighOne';
      root.addChild(a);
    }
    if (b) {
      b.position.set(CELL_W * 0.68, CELL_H - 30);
      b.label = 'LowOne';
      root.addChild(b);
    }
    world.addChild(root);
  }

  // ─────────────────────────────────────────────────────────────
  // Cell (2, 0) - hidden but updating spine
  // ─────────────────────────────────────────────────────────────
  {
    const cell: Cell = {
      col: 2,
      row: 0,
      title: '03 Hidden updating',
      triggers: ['SPINE_HIDDEN_UPDATING', 'INVISIBLE_SUBTREE'],
    };
    const root = cellRoot(cell, app);
    const wrapper = new Container();
    wrapper.label = 'HiddenWrapper';
    wrapper.visible = false; // INVISIBLE_SUBTREE
    const ref = SKELETONS.find((s) => s.alias === 'spineboy')!;
    const sp = makeSpine(ref, 'run', true, 0.2);
    if (sp) {
      // SPINE_HIDDEN_UPDATING: autoUpdate stays on while parent is hidden
      sp.position.set(CELL_W / 2, CELL_H - 30);
      sp.label = 'HiddenSpineboyTicking';
      wrapper.addChild(sp);
    }
    // Some hint visible to the user that the cell is "intentionally empty"
    const hint = new Text({
      text: '(invisible subtree\n  ticks every frame)',
      style: new TextStyle({
        fontFamily: '"Courier New", monospace',
        fontSize: 11,
        fill: 0x444444,
        align: 'center',
      }),
    });
    hint.anchor.set(0.5);
    hint.position.set(CELL_W / 2, CELL_H / 2);
    root.addChild(wrapper);
    root.addChild(hint);
    world.addChild(root);
  }

  // ─────────────────────────────────────────────────────────────
  // Cell (3, 0) - high-RI spine (lots of vertices)
  // ─────────────────────────────────────────────────────────────
  {
    const cell: Cell = {
      col: 3,
      row: 0,
      title: '04 High RI scatter',
      triggers: ['SPINE_HIGH_RI', 'SPINE_HIGH_BUDGET'],
    };
    const root = cellRoot(cell, app);
    const ref = SKELETONS.find((s) => s.alias === 'scatter')!;
    const sp = makeSpine(ref, 'idle', true, 0.55);
    if (sp) {
      sp.position.set(CELL_W / 2, CELL_H - 30);
      sp.label = 'HighRIScatter';
      root.addChild(sp);
    }
    world.addChild(root);
  }

  // ─────────────────────────────────────────────────────────────
  // Cell (0, 1) - simple mask (single MASK_BREAK)
  // ─────────────────────────────────────────────────────────────
  {
    const cell: Cell = {
      col: 0,
      row: 1,
      title: '05 Simple mask',
      triggers: ['MASK_BREAK'],
    };
    const root = cellRoot(cell, app);
    const masked = new Container();
    masked.label = 'SimpleMaskedContent';
    const mask = new Graphics();
    mask.circle(0, 0, 50);
    mask.fill({ color: 0xffffff });
    mask.label = 'SimpleMask';
    masked.mask = mask;
    masked.addChild(mask);

    const fill = new Graphics();
    fill.rect(-60, -60, 120, 120);
    fill.fill({ color: 0x4fc3f7, alpha: 0.85 });
    fill.label = 'MaskedFill';
    masked.addChild(fill);

    masked.position.set(CELL_W / 2, CELL_H / 2 + 10);
    root.addChild(masked);
    world.addChild(root);
  }

  // ─────────────────────────────────────────────────────────────
  // Cell (1, 1) - nested mask (mask inside masked ancestor)
  // ─────────────────────────────────────────────────────────────
  {
    const cell: Cell = {
      col: 1,
      row: 1,
      title: '06 Nested mask',
      triggers: ['MASK_NESTED', 'MASK_BREAK'],
    };
    const root = cellRoot(cell, app);

    const outerMasked = new Container();
    outerMasked.label = 'OuterMasked';
    const outerMask = new Graphics();
    outerMask.circle(0, 0, 70);
    outerMask.fill({ color: 0xffffff });
    outerMask.label = 'OuterMask';
    outerMasked.mask = outerMask;
    outerMasked.addChild(outerMask);

    const innerMasked = new Container();
    innerMasked.label = 'InnerMasked';
    const innerMask = new Graphics();
    innerMask.rect(-40, -40, 80, 80);
    innerMask.fill({ color: 0xffffff });
    innerMask.label = 'InnerMask';
    innerMasked.mask = innerMask;
    innerMasked.addChild(innerMask);

    const innerFill = new Graphics();
    innerFill.rect(-80, -80, 160, 160);
    innerFill.fill({ color: 0xff6699, alpha: 0.85 });
    innerFill.label = 'InnerFill';
    innerMasked.addChild(innerFill);
    outerMasked.addChild(innerMasked);

    outerMasked.position.set(CELL_W / 2, CELL_H / 2 + 10);
    root.addChild(outerMasked);
    world.addChild(root);
  }

  // ─────────────────────────────────────────────────────────────
  // Cell (2, 1) - filter break
  // ─────────────────────────────────────────────────────────────
  {
    const cell: Cell = {
      col: 2,
      row: 1,
      title: '07 Filter break',
      triggers: ['FILTER_BREAK'],
    };
    const root = cellRoot(cell, app);
    const filtered = new Container();
    filtered.label = 'BlurredContent';
    const fill = new Graphics();
    fill.roundRect(-60, -60, 120, 120, 12);
    fill.fill({ color: 0xa3e635 });
    fill.label = 'BlurredFill';
    filtered.addChild(fill);
    filtered.filters = [new BlurFilter({ strength: 6 })];
    filtered.position.set(CELL_W / 2, CELL_H / 2 + 10);
    root.addChild(filtered);
    world.addChild(root);
  }

  // ─────────────────────────────────────────────────────────────
  // Cell (3, 1) - blend break (additive Graphics)
  // ─────────────────────────────────────────────────────────────
  {
    const cell: Cell = {
      col: 3,
      row: 1,
      title: '08 Blend break',
      triggers: ['BLEND_BREAK'],
    };
    const root = cellRoot(cell, app);
    const additive = new Graphics();
    additive.circle(0, 0, 55);
    additive.fill({ color: 0xff8800, alpha: 0.6 });
    additive.blendMode = 'add';
    additive.label = 'AdditiveBlob';
    additive.position.set(CELL_W / 2 - 25, CELL_H / 2 + 10);
    root.addChild(additive);

    const additive2 = new Graphics();
    additive2.circle(0, 0, 45);
    additive2.fill({ color: 0xffaa00, alpha: 0.6 });
    additive2.blendMode = 'screen';
    additive2.label = 'ScreenBlob';
    additive2.position.set(CELL_W / 2 + 25, CELL_H / 2 + 10);
    root.addChild(additive2);
    world.addChild(root);
  }

  // ─────────────────────────────────────────────────────────────
  // Cell (0, 2) - deep nesting
  // ─────────────────────────────────────────────────────────────
  {
    const cell: Cell = {
      col: 0,
      row: 2,
      title: '09 Deep nesting',
      triggers: ['DEEP_NESTING'],
    };
    const root = cellRoot(cell, app);
    let parent: Container = root;
    for (let d = 0; d < 22; d++) {
      const child = new Container();
      child.label = `Nest_${d}`;
      parent.addChild(child);
      parent = child;
    }
    const leaf = new Graphics();
    leaf.circle(0, 0, 18);
    leaf.fill({ color: 0xff5577 });
    leaf.label = 'DeepLeaf';
    leaf.position.set(CELL_W / 2, CELL_H / 2 + 10);
    parent.addChild(leaf);
    world.addChild(root);
  }

  // ─────────────────────────────────────────────────────────────
  // Cell (1, 2) - excessive children + empty containers
  // ─────────────────────────────────────────────────────────────
  {
    const cell: Cell = {
      col: 1,
      row: 2,
      title: '10 Excessive children',
      triggers: ['EXCESSIVE_CHILDREN', 'EMPTY_CONTAINER'],
    };
    const root = cellRoot(cell, app);
    const swarm = new Container();
    swarm.label = 'SwarmContainer';
    for (let i = 0; i < 140; i++) {
      // Half are real graphics, half are deliberately empty containers
      // so EMPTY_CONTAINER fires as well.
      if (i % 2 === 0) {
        const dot = new Graphics();
        dot.circle(0, 0, 3);
        dot.fill({ color: 0xa3e635 });
        dot.position.set(20 + (i % 12) * 18, 60 + Math.floor(i / 12) * 14);
        dot.label = `SwarmDot_${i}`;
        swarm.addChild(dot);
      } else {
        const empty = new Container();
        empty.label = `EmptyChild_${i}`;
        swarm.addChild(empty);
      }
    }
    root.addChild(swarm);
    world.addChild(root);
  }

  // ─────────────────────────────────────────────────────────────
  // Cell (2, 2) - zero alpha but visible
  // ─────────────────────────────────────────────────────────────
  {
    const cell: Cell = {
      col: 2,
      row: 2,
      title: '11 Zero alpha visible',
      triggers: ['ZERO_ALPHA_VISIBLE'],
    };
    const root = cellRoot(cell, app);
    const ghost = new Graphics();
    ghost.roundRect(-60, -60, 120, 120, 8);
    ghost.fill({ color: 0xfb923c });
    ghost.alpha = 0; // visible=true, alpha=0
    ghost.visible = true;
    ghost.label = 'TransparentBox';
    ghost.position.set(CELL_W / 2, CELL_H / 2 + 10);
    root.addChild(ghost);

    const hint = new Text({
      text: '(alpha=0 with visible=true\n  still walked + transformed)',
      style: new TextStyle({
        fontFamily: '"Courier New", monospace',
        fontSize: 10,
        fill: 0x444444,
        align: 'center',
      }),
    });
    hint.anchor.set(0.5);
    hint.position.set(CELL_W / 2, CELL_H / 2 + 10);
    root.addChild(hint);
    world.addChild(root);
  }

  // ─────────────────────────────────────────────────────────────
  // Cell (3, 2) - frequent reorder
  // ─────────────────────────────────────────────────────────────
  {
    const cell: Cell = {
      col: 3,
      row: 2,
      title: '12 Frequent reorder',
      triggers: ['FREQUENT_REORDER'],
    };
    const root = cellRoot(cell, app);
    const stack = new Container();
    stack.label = 'ReorderStack';
    const layers: Graphics[] = [];
    for (let i = 0; i < 6; i++) {
      const g = new Graphics();
      g.roundRect(-35, -35, 70, 70, 6);
      g.fill({ color: [0xfb923c, 0x4fc3f7, 0xa3e635, 0xff6699, 0xffd166, 0xb084ff][i] });
      g.alpha = 0.6;
      g.position.set(CELL_W / 2 + (i - 2.5) * 8, CELL_H / 2 + 10 + (i - 2.5) * 8);
      g.label = `ReorderTile_${i}`;
      stack.addChild(g);
      layers.push(g);
    }
    root.addChild(stack);

    // Reorder children every frame to trigger FREQUENT_REORDER
    let tick = 0;
    app.ticker.add(() => {
      tick++;
      if (tick % 4 === 0) {
        const idx = tick % layers.length;
        stack.swapChildren(layers[idx], layers[(idx + 1) % layers.length]);
      }
    });
    world.addChild(root);
  }

  // ─────────────────────────────────────────────────────────────
  // Off-screen object (deliberately positioned outside the viewport)
  // Triggers OFF_SCREEN. Lives outside the grid so it doesn't visually
  // collide with the labelled cells.
  // ─────────────────────────────────────────────────────────────
  {
    const offscreen = new Sprite();
    offscreen.label = 'OffScreenSprite';
    const off = new Graphics();
    off.rect(0, 0, 80, 80);
    off.fill({ color: 0x666666 });
    off.label = 'OffScreenFill';
    const wrap = new Container();
    wrap.label = 'OffScreenContainer';
    wrap.addChild(off);
    wrap.position.set(-500, -500); // far outside any viewport
    world.addChild(wrap);
  }

  // ─────────────────────────────────────────────────────────────
  // USER_ASSETS
  // Drop your own Spine bundles into apps/crawler/public/assets/user/
  // and instantiate them here. They will be served at /assets/user/<file>.
  // Example:
  //
  //   Assets.add({ alias: 'my-atlas', src: 'assets/user/my.atlas' });
  //   Assets.add({ alias: 'my-skel',  src: 'assets/user/my.json'  });
  //   await Assets.load(['my-atlas', 'my-skel']);
  //   const my = Spine.from({ skeleton: 'my-skel', atlas: 'my-atlas' });
  //   my.position.set(window.innerWidth - 200, 200);
  //   app.stage.addChild(my);
  // ─────────────────────────────────────────────────────────────

  // ─────────────────────────────────────────────────────────────
  // Welcome overlay dismiss
  // ─────────────────────────────────────────────────────────────
  const welcomeEl = document.getElementById('welcome');
  if (welcomeEl) {
    const dismiss = () => {
      welcomeEl.classList.add('hidden');
      welcomeEl.removeEventListener('click', dismiss);
      document.removeEventListener('keydown', dismiss);
    };
    welcomeEl.addEventListener('click', dismiss);
    document.addEventListener('keydown', dismiss);
  }

  // ─────────────────────────────────────────────────────────────
  // HUD (minimal - detailed controls are on the welcome screen)
  // ─────────────────────────────────────────────────────────────
  const hudText = new Text({
    text: 'PIXI CRAWLER ISSUE SHOWCASE  ·  press ~ for overlay',
    style: new TextStyle({
      fontFamily: '"Courier New", monospace',
      fontSize: 11,
      fill: 0x666666,
      lineHeight: 16,
      letterSpacing: 0.5,
    }),
  });
  hudText.label = 'HUDText';
  hudText.position.set(8, 8);
  app.stage.addChild(hudText);

  // ─────────────────────────────────────────────────────────────
  // Crawler init
  // ─────────────────────────────────────────────────────────────
  const crawler = new Crawler(app, {
    scanInterval: 10,
    overlayEnabled: true,
  });
  (globalThis as any).crawler = crawler;

  console.log(
    '%c[demo]%c showcase ready - %d top-level cells. Press ~ for overlay.',
    'color:#4fc3f7;font-weight:bold',
    'color:#888',
    world.children.length,
  );
})();
