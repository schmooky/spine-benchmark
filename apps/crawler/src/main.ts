import '@esotericsoftware/spine-pixi-v8';
import { Application, Container, Graphics, Text, TextStyle, Sprite, Texture } from 'pixi.js';
import { Crawler, ISSUE_IMPACT } from '@spine-benchmark/pixi-crawler';

/**
 * Pixi Crawler Demo
 *
 * Demonstrates the crawler analyzing a synthetic PixiJS scene.
 * Replace the demo objects with your own Spine skeletons and assets.
 *
 * Controls:
 *   ~   Toggle overlay
 *   G   Toggle graph (FPS / DC / Budget)
 *   I   Toggle issues list
 *   H   Toggle highlights
 *   R   Start/stop recording
 *   P   Export report
 *   D   Toggle analysis mode
 *   < > Cycle selected node
 *   W   Open remote waterfall panel
 */
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

  // ── Build a synthetic demo scene ──
  const world = new Container();
  world.label = 'World';
  app.stage.addChild(world);

  const sw = () => app.screen.width;
  const sh = () => app.screen.height;

  // Grid of colored boxes to simulate display objects
  const gridContainer = new Container();
  gridContainer.label = 'ObjectGrid';
  world.addChild(gridContainer);

  const COLS = 6;
  const ROWS = 4;
  const cellW = 120;
  const cellH = 100;
  const colors = [0x4fc3f7, 0xce93d8, 0xffa726, 0x66bb6a, 0xef5350, 0xffee58];

  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const g = new Graphics();
      g.label = `Cell_${row}_${col}`;
      const color = colors[(row + col) % colors.length];

      g.roundRect(0, 0, cellW - 8, cellH - 8, 8);
      g.fill({ color, alpha: 0.6 });
      g.roundRect(0, 0, cellW - 8, cellH - 8, 8);
      g.stroke({ color: 0xffffff, width: 1, alpha: 0.2 });

      g.position.set(
        (sw() - COLS * cellW) / 2 + col * cellW + 4,
        (sh() - ROWS * cellH) / 2 + row * cellH + 4,
      );

      // Add some variety: masks, filters, nested containers
      if (row === 1 && col === 2) {
        // Masked graphics
        const mask = new Graphics();
        mask.circle(cellW / 2, cellH / 2, 30);
        mask.fill({ color: 0xffffff });
        g.mask = mask;
        g.addChild(mask);
        g.label = 'MaskedCell';
      }

      if (row === 2 && col === 3) {
        // Deep nesting example
        let parent: Container = g;
        for (let d = 0; d < 5; d++) {
          const child = new Container();
          child.label = `Nested_${d}`;
          parent.addChild(child);
          parent = child;
        }
        const deepSprite = new Graphics();
        deepSprite.rect(0, 0, 20, 20);
        deepSprite.fill({ color: 0xff0000 });
        deepSprite.label = 'DeepLeaf';
        parent.addChild(deepSprite);
      }

      if (row === 0 && col === 4) {
        // Non-normal blend mode
        g.blendMode = 'add';
        g.label = 'AdditiveCell';
      }

      gridContainer.addChild(g);
    }
  }

  // An invisible container with children (issue: INVISIBLE_SUBTREE)
  const hiddenGroup = new Container();
  hiddenGroup.label = 'HiddenGroup';
  hiddenGroup.visible = false;
  for (let i = 0; i < 10; i++) {
    const child = new Container();
    child.label = `HiddenChild_${i}`;
    child.visible = false;
    hiddenGroup.addChild(child);
  }
  world.addChild(hiddenGroup);

  // ── HUD ──
  const hudText = new Text({
    text: [
      'PIXI CRAWLER DEMO',
      '',
      '~  toggle overlay      G  toggle graph',
      'R  record  P  report   D  analysis mode',
      'H  highlights  W  remote panel',
    ].join('\n'),
    style: new TextStyle({
      fontFamily: '"Courier New", monospace',
      fontSize: 13,
      fill: 0x888888,
      lineHeight: 18,
      letterSpacing: 0.5,
    }),
  });
  hudText.label = 'HUDText';
  hudText.position.set(12, sh() - 110);
  world.addChild(hudText);

  // ── Animate ──
  app.ticker.add((ticker) => {
    const t = performance.now() * 0.001;
    // Gentle wave animation on grid items
    for (let i = 0; i < gridContainer.children.length; i++) {
      const child = gridContainer.children[i];
      const baseY = (sh() - ROWS * cellH) / 2 + Math.floor(i / COLS) * cellH + 4;
      child.y = baseY + Math.sin(t * 2 + i * 0.5) * 4;
    }
  });

  // ── Resize handler ──
  window.addEventListener('resize', () => {
    hudText.position.set(12, sh() - 110);
  });

  // ── Init Crawler ──
  const crawler = new Crawler(app, {
    scanInterval: 10,
    overlayEnabled: true,
  });

  // Expose on window for console debugging
  (globalThis as unknown as { crawler: typeof crawler }).crawler = crawler;

  console.log(
    '%c[demo]%c Crawler initialized. Press ~ to toggle overlay, R to record, P for report.',
    'color:#4fc3f7;font-weight:bold',
    'color:#888',
  );
})();
