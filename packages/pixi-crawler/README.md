# @spine-benchmark/pixi-crawler

[![npm](https://img.shields.io/npm/v/@spine-benchmark/pixi-crawler?label=npm)](https://www.npmjs.com/package/@spine-benchmark/pixi-crawler)
[![downloads](https://img.shields.io/npm/dm/@spine-benchmark/pixi-crawler?label=downloads)](https://www.npmjs.com/package/@spine-benchmark/pixi-crawler)
[![bundle size](https://img.shields.io/bundlephobia/minzip/@spine-benchmark/pixi-crawler?label=minzip)](https://bundlephobia.com/package/@spine-benchmark/pixi-crawler)

A drop-in **performance profiler for PixiJS 8**: a per-frame breakdown of
where the milliseconds go (CPU pre-work, pixi build / transform / execute,
Spine, true GPU time via `EXT_disjoint_timer_query`), device-invariant
workload counters, an optional muted/plain HUD with a live frame-time
sparkline, and a telemetry sink for shipping the same measurements from a
live game. Add it to any app in one call.

Its open workload/GPU cost measures are built on
[`@spine-benchmark/metrics-impact-formula`](https://www.npmjs.com/package/@spine-benchmark/metrics-impact-formula) -
the same formulas the [offline benchmark site](https://spine.schmooky.dev)
uses, so a device-tier reading from the crawler and a prediction from the
benchmark are grounded in the same math.

## Install

`pixi.js` is a **peer dependency**. It is critical that your app's pixi
version and the package's match exactly: the crawler patches pixi
prototypes, and a version mismatch means it patches the wrong graph.

```bash
npm install @spine-benchmark/pixi-crawler
```

## Quick start

One call: `mountCrawler(app)`. Shows the HUD by default and auto-disposes
itself on `pagehide`.

```typescript
import { Application } from "pixi.js";
import { mountCrawler } from "@spine-benchmark/pixi-crawler";

const app = new Application();
await app.init({ background: "#101317", resizeTo: window });

// HUD visible, auto-dispose on pagehide
const crawler = mountCrawler(app);

// headless (no HUD) + telemetry
const headless = mountCrawler(app, { hud: false, telemetry: { sink } });
```

`mountCrawler` accepts a Pixi `Application`, or any object with
`{ renderer, ticker }` fields; the second argument is a config object plus
an `autoDispose` flag (default `true`).

For full lifecycle control, construct it directly:

```typescript
import { Crawler } from "@spine-benchmark/pixi-crawler";

const crawler = new Crawler({
  targetFrameMs: 1000 / 60,
  hud: !import.meta.env.PROD,
  spineProfile: { enabled: true },
  telemetry: { sink, sampling: { windowMs: 5000 }, rawFrames: "on-overrun" },
});
crawler.attach(app.renderer, app.ticker);

window.addEventListener("pagehide", () => void crawler.dispose());
```

## Contracts

- **The app's ticker must NOT be `Ticker.shared`.** The app must own its own
  ticker - under the shared ticker Spine collides with the crawler. This is
  the one hard incompatibility.
- **Pixi versions must match exactly** - the crawler patches pixi prototypes.
- **`gpuMs` is `null` on Safari / iOS** (no `EXT_disjoint_timer_query_webgl2`
  there). CPU measurements still work; the crawler discards "disjoint"
  (unreliable) GPU-timer readings itself.
- **`dispose()` / `detach()` restore** every patched method. Call one of
  them on unmount.

If your app drives its own render loop (ticker stopped, your own
`requestAnimationFrame`), bracket each frame manually instead of calling
`attach()`:

```typescript
app.ticker.stop();

function frame() {
  crawler.frameStart();
  // ...advance the scene, then render...
  app.render();
  crawler.frameEnd(); // flushes one FrameRecord
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
```

## Configuration

Every `CrawlerConfig` field is optional; each gates one subsystem.

| Field | Default | What it does |
| --- | --- | --- |
| `hud` | off | Show the DOM HUD overlay. On via `mountCrawler`. |
| `targetFrameMs` | 1000/60 | Frame budget in ms; the HUD normalizes bars and status against it. |
| `bufferSize` | 600 | Frame ring-buffer size. |
| `enableGpuTiming` | on | True per-frame GPU time via `EXT_disjoint_timer_query` (`gpuMs`). |
| `deepRenderSplit` | on | CPU render-time split by phase (build / transform / execute / ...). |
| `filterProfile` | on | Filter timing (push / apply / pop) and pass count. |
| `textureTracking` | on | Texture uploads / unloads, bytes, active GPU count. |
| `spineProfile` | off | Per-phase Spine breakdown. **Patches Spine's methods** - do not enable if you separately time inside `spine.update()`. |
| `pipeProfile` | off | Per-render-pipe-call timing. The heaviest overhead of any flag. |
| `workloadCost` | on | Open device-independent workload measure. |
| `gpuCost` | on | Open GPU-heaviness measure (fill footprint + filters). |
| `hudTheme` | `"slate"` | HUD color preset: `"slate"` (default), `"warm"`, or `"contrast"`. CSS variables only - no measurement effect. |
| `hudMotion` | on | Smooth expand/collapse micro-interaction on the HUD. Purely cosmetic. |
| `selfProfile` | off | Per-function self-time via the W3C JS Self-Profiling API (needs a `Document-Policy: js-profiling` header, Chromium only). |
| `memoryProfile` | off | Process memory via `measureUserAgentSpecificMemory()` (needs cross-origin isolation). |
| `telemetry` | off | Periodic aggregate flush to your sink. |

## Reading measurements

The crawler does not require the HUD - read frames directly and build your
own panel:

```typescript
const f = crawler.getLastFrame(); // the latest FrameRecord (or undefined)
f.gpuMs; // true GPU time, ms (null without a timer)
f.counters.drawCalls;
f.counters.verticesDrawn;
f.counters.stencilMaskPasses;
f.counters.renderTargetSwitches;
f.renderSplit?.updateRenderablesMs; // CPU render phase, ms

crawler.getFrames(); // the whole ring buffer
crawler.getWorkloadCost(); // open workload measure + bottleneck
crawler.getGpuCost(); // open GPU-heaviness measure
crawler.getWorstFrame(); // worst frame + a scene dump

// GPU queries land 1-3 frames late; drain them at the end of a window:
await crawler.flushPendingGpu();
```

## Telemetry

```typescript
const sink = {
  send(batch) {
    navigator.sendBeacon("/telemetry", JSON.stringify(batch));
  },
};

const crawler = new Crawler({
  telemetry: { sink, sampling: { windowMs: 5000 }, rawFrames: "on-overrun" },
});
crawler.attach(app.renderer, app.ticker);

crawler.setTelemetryLabel("bonus-game"); // tag the current scene
```

## Recording a session

```typescript
crawler.startRecording();
// ...reproduce the problem scenario...
crawler.stopRecording();
const recording = crawler.getRecording(); // -> serialize to JSON
```

## Full guide

The quick reference above covers the common path; a longer walkthrough
(with the same content in English and Russian) lives in this package:

- [`docs/usage.en.html`](./docs/usage.en.html)
- [`docs/usage.ru.html`](./docs/usage.ru.html)

## Development

This package lives inside the
[spine-benchmark monorepo](https://github.com/schmooky/spine-benchmark).
See [`CONTRIBUTING.md`](https://github.com/schmooky/spine-benchmark/blob/main/CONTRIBUTING.md)
for the workflow. Local commands:

```bash
npm run build       # Build for production
npm run type-check  # Check types without building
npm run clean       # Remove dist directory
```

## See also

- [`@spine-benchmark/metrics-impact-formula`](https://www.npmjs.com/package/@spine-benchmark/metrics-impact-formula) - the canonical cost formulas this package builds on.
- [Spine Benchmark site](https://spine.schmooky.dev) - the offline analyzer that uses the same formulas.

## License

[MIT](https://github.com/schmooky/spine-benchmark/blob/main/LICENSE) (c) Spine Benchmark Contributors
