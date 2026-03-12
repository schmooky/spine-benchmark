import '@esotericsoftware/spine-pixi-v8';
import { Spine } from '@esotericsoftware/spine-pixi-v8';
import { Application, Assets, Container, Graphics, Text, TextStyle } from 'pixi.js';
import { Crawler } from '@spine-benchmark/pixi-crawler';

/**
 * Pixi Crawler Demo - Spine slot-machine test scene
 *
 * Loads real Spine skeletons from the TPT atlas: backgrounds, reelgrid,
 * symbol grid with active animations, win sequences, meter, etc.
 *
 * Controls:
 *   ~   Toggle overlay         G   Toggle graph (FPS / DC / Budget)
 *   I   Toggle issues list     H   Toggle highlights
 *   R   Start/stop recording   P   Export report
 *   D   Toggle analysis mode   W   Open remote waterfall panel
 *   < > Cycle selected node
 */

const ATLAS = 'assets/TPT_spine.atlas';

// ── All skeletons we want to register with the asset loader ──
const ALL_JSONS = [
  'Backgrounds', 'Reelgrid', 'Logo', 'Meter_Panel', 'Meter_Symbol',
  'Master_Symbol', 'Symbol_Highlight', 'Symbol_Expansion',
  'Big_Win', 'Initial_Win', 'Near_Win', 'Splash',
  'Present_Highlighted_Symbol', 'FS_Intro', 'FS_Outro',
  'sym_M2', 'sym_M3', 'sym_M4', 'sym_H1', 'sym_WR',
  'sym_F5', 'sym_F6', 'sym_F7', 'sym_F8', 'sym_F9', 'sym_F10',
];

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

  const sw = () => app.screen.width;
  const sh = () => app.screen.height;

  // ── Register & load all assets ──
  Assets.add({ alias: 'tpt-atlas', src: ATLAS });
  for (const name of ALL_JSONS) {
    Assets.add({ alias: name, src: `assets/${name}.json` });
  }
  await Assets.load(['tpt-atlas', ...ALL_JSONS]);
  console.log('%c[demo]%c all assets loaded', 'color:#4fc3f7;font-weight:bold', 'color:#888');

  // Helper: create a Spine, set anim, return it
  function makeSpine(
    alias: string, anim: string, loop: boolean,
    x: number, y: number, scale = 1,
  ): Spine | null {
    try {
      const s = Spine.from({ skeleton: alias, atlas: 'tpt-atlas', autoUpdate: true });
      s.label = alias;
      s.scale.set(scale);
      s.position.set(x, y);
      const anims = s.skeleton.data.animations.map((a: any) => a.name);
      if (anims.includes(anim)) {
        s.state.setAnimation(0, anim, loop);
      } else if (anims.length > 0) {
        s.state.setAnimation(0, anims[0], loop);
        console.warn(`[demo] ${alias}: "${anim}" missing, using "${anims[0]}"`);
      }
      return s;
    } catch (err) {
      console.warn(`[demo] Failed: ${alias}`, err);
      return null;
    }
  }

  // ── World ──
  const world = new Container();
  world.label = 'World';
  app.stage.addChild(world);

  const cx = sw() / 2;
  const cy = sh() / 2;

  // ── Layer 0: Background ──
  const bgLayer = new Container();
  bgLayer.label = 'BackgroundLayer';
  world.addChild(bgLayer);

  const bg = makeSpine('Backgrounds', 'basegame', true, cx, cy, 1);
  if (bg) bgLayer.addChild(bg);

  // ── Layer 1: Reelgrid ──
  const reelLayer = new Container();
  reelLayer.label = 'ReelgridLayer';
  world.addChild(reelLayer);

  const reels = makeSpine('Reelgrid', 'state_landscape', true, cx, cy, 0.8);
  if (reels) reelLayer.addChild(reels);

  // ── Layer 2: Symbol grid - 5×3 reel layout with active animations ──
  const symbolLayer = new Container();
  symbolLayer.label = 'SymbolGrid';
  world.addChild(symbolLayer);

  // 5 columns × 3 rows of symbols, mix of high/mid/low
  const REEL_COLS = 5;
  const REEL_ROWS = 3;
  const SYM_W = 130;
  const SYM_H = 130;
  const gridStartX = cx - ((REEL_COLS - 1) * SYM_W) / 2;
  const gridStartY = cy - ((REEL_ROWS - 1) * SYM_H) / 2 - 20;

  // Symbol pool with active animations
  const symbolPool: [string, string][] = [
    // Row 0 - mostly highs with active loops
    ['sym_H1', 'char_idle_loop_regular'],
    ['sym_M2', 'char_idle_loop_regular'],
    ['sym_WR', 'book_hover_loop'],
    ['sym_M3', 'char_idle_loop_regular'],
    ['sym_M4', 'char_idle_loop_regular'],
    // Row 1 - mix of highs doing win anims + expanding
    ['sym_M2', 'fire_loop'],
    ['sym_H1', 'fire_loop'],
    ['sym_M3', 'expand_from_middle'],
    ['sym_M4', 'highlighted_fade_in'],
    ['sym_WR', 'attention3_loop'],
    // Row 2 - lows with some highlights
    ['sym_F5', 'mb'],
    ['sym_F6', 'highlighted_fade_in'],
    ['sym_F7', 'static'],
    ['sym_F8', 'mb'],
    ['sym_F9', 'highlighted_fade_in'],
  ];

  for (let row = 0; row < REEL_ROWS; row++) {
    for (let col = 0; col < REEL_COLS; col++) {
      const idx = row * REEL_COLS + col;
      const [alias, anim] = symbolPool[idx];
      const x = gridStartX + col * SYM_W;
      const y = gridStartY + row * SYM_H;
      const sym = makeSpine(alias, anim, true, x, y, 0.3);
      if (sym) {
        sym.label = `Sym_${row}_${col}_${alias}`;
        symbolLayer.addChild(sym);
      }
    }
  }

  // ── Layer 3: Symbol effects (highlight frames, expansion overlays) ──
  const fxLayer = new Container();
  fxLayer.label = 'SymbolFXLayer';
  world.addChild(fxLayer);

  // Highlight frame on a few positions
  const hlPositions = [
    [0, 2], [1, 1], [1, 3], [2, 1], [2, 4],
  ];
  for (const [row, col] of hlPositions) {
    const x = gridStartX + col * SYM_W;
    const y = gridStartY + row * SYM_H;
    const hl = makeSpine('Symbol_Highlight', 'regular_fade_in', false, x, y, 0.3);
    if (hl) {
      hl.label = `SymHL_${row}_${col}`;
      fxLayer.addChild(hl);
    }
  }

  // Expansion overlays on column 2
  for (let row = 0; row < REEL_ROWS; row++) {
    const x = gridStartX + 2 * SYM_W;
    const y = gridStartY + row * SYM_H;
    const expandAnim = row === 0 ? 'expand_from_top' : row === 1 ? 'expand_from_middle' : 'expand_from_bottom';
    const exp = makeSpine('Symbol_Expansion', expandAnim, false, x, y, 0.3);
    if (exp) {
      exp.label = `SymExpand_${row}`;
      fxLayer.addChild(exp);
    }
  }

  // ── Layer 4: Meter panel + meter symbol ──
  const meterLayer = new Container();
  meterLayer.label = 'MeterLayer';
  world.addChild(meterLayer);

  const meter = makeSpine('Meter_Panel', 'state_landscape', true, cx + 340, cy - 200, 0.35);
  if (meter) meterLayer.addChild(meter);

  const meterSym = makeSpine('Meter_Symbol', 'fire_loop', true, cx + 340, cy - 140, 0.3);
  if (meterSym) meterLayer.addChild(meterSym);

  // ── Layer 5: Master symbol (multiplier indicator) ──
  const master = makeSpine('Master_Symbol', 'mb', true, cx - 340, cy - 200, 0.4);
  if (master) {
    master.label = 'MasterSymbol';
    world.addChild(master);
  }

  // ── Layer 6: Logo at top ──
  const logo = makeSpine('Logo', 'popup', false, cx, 50, 0.45);
  if (logo) {
    logo.label = 'Logo';
    world.addChild(logo);
  }

  // ── Layer 7: Win celebration (Big_Win doing char_idle_loops) ──
  const winLayer = new Container();
  winLayer.label = 'WinLayer';
  world.addChild(winLayer);

  const bigWin = makeSpine('Big_Win', 'char_idle_loops', true, cx, cy, 0.55);
  if (bigWin) {
    bigWin.alpha = 0.7; // semi-transparent so we see symbols behind
    bigWin.label = 'BigWin_CharLoops';
    winLayer.addChild(bigWin);
  }

  // Initial win overlay
  const initWin = makeSpine('Initial_Win', 'initial_win', true, cx, cy + 60, 0.45);
  if (initWin) {
    initWin.label = 'InitialWin';
    winLayer.addChild(initWin);
  }

  // Near-win loop (often most expensive - lots of bones)
  const nearWin = makeSpine('Near_Win', 'loop', true, cx + 250, cy + 100, 0.35);
  if (nearWin) {
    nearWin.label = 'NearWin_Loop';
    winLayer.addChild(nearWin);
  }

  // ── Layer 8: Present Highlighted Symbol (huge - 1013 bones!) ──
  const presentHL = makeSpine(
    'Present_Highlighted_Symbol', 'present_highlighted_symbol', true,
    cx - 200, cy + 150, 0.25,
  );
  if (presentHL) {
    presentHL.label = 'PresentHighlightedSymbol';
    world.addChild(presentHL);
  }

  // ── Extra low symbols scattered for F10 ──
  const f10 = makeSpine('sym_F10', 'mb', true, cx + 320, cy + 220, 0.3);
  if (f10) { f10.label = 'sym_F10_extra'; world.addChild(f10); }

  // ── Some extra Graphics for blend-break / mask testing ──
  const extraContainer = new Container();
  extraContainer.label = 'ExtraEffects';
  world.addChild(extraContainer);

  const addBox = new Graphics();
  addBox.roundRect(0, 0, 60, 60, 8);
  addBox.fill({ color: 0xff6600, alpha: 0.5 });
  addBox.blendMode = 'add';
  addBox.label = 'AdditiveBlendBox';
  addBox.position.set(20, sh() - 80);
  extraContainer.addChild(addBox);

  const maskedGroup = new Container();
  maskedGroup.label = 'MaskedGroup';
  const mask = new Graphics();
  mask.circle(0, 0, 30);
  mask.fill({ color: 0xffffff });
  maskedGroup.mask = mask;
  maskedGroup.addChild(mask);
  const maskedContent = new Graphics();
  maskedContent.rect(-40, -40, 80, 80);
  maskedContent.fill({ color: 0x00ff88, alpha: 0.6 });
  maskedContent.label = 'MaskedContent';
  maskedGroup.addChild(maskedContent);
  maskedGroup.position.set(110, sh() - 50);
  extraContainer.addChild(maskedGroup);

  // Deep nesting
  let nestParent: Container = extraContainer;
  for (let d = 0; d < 8; d++) {
    const child = new Container();
    child.label = `DeepNest_${d}`;
    nestParent.addChild(child);
    nestParent = child;
  }
  const deepLeaf = new Graphics();
  deepLeaf.rect(0, 0, 20, 20);
  deepLeaf.fill({ color: 0xff0000 });
  deepLeaf.label = 'DeepLeaf';
  deepLeaf.position.set(200, sh() - 70);
  nestParent.addChild(deepLeaf);

  // ── HUD ──
  const hudText = new Text({
    text: [
      'PIXI CRAWLER DEMO - Spine Slot Machine Scene',
      '~  overlay   G  graph   I  issues   H  highlights',
      'R  record   P  report   D  analysis   W  remote panel',
    ].join('\n'),
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
  world.addChild(hudText);

  // ── Init Crawler ──
  const crawler = new Crawler(app, {
    scanInterval: 10,
    overlayEnabled: true,
  });

  (globalThis as any).crawler = crawler;

  const totalSpines = world.children.reduce(function countSpines(acc: number, c: any): number {
    const isSp = c.skeleton && c.state ? 1 : 0;
    const kids = c.children ? c.children.reduce(countSpines, 0) : 0;
    return acc + isSp + kids;
  }, 0);

  console.log(
    '%c[demo]%c scene ready - %d spine skeletons across %d layers. Press ~ for overlay.',
    'color:#4fc3f7;font-weight:bold',
    'color:#888',
    totalSpines,
    world.children.length,
  );
})();
