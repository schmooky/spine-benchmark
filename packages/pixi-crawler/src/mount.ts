import type { Application, Renderer, Ticker } from "pixi.js";

import { Crawler } from "./crawler";
import type { CrawlerConfig } from "./types";

/** A pixi Application, or any object exposing a renderer + ticker pair. */
export type CrawlerTarget = Application | { renderer: Renderer; ticker: Ticker };

export interface MountOptions extends CrawlerConfig {
  /** Auto-dispose the crawler on the window `pagehide` event (default true). */
  autoDispose?: boolean;
}

/**
 * One-call embed. Mounts a {@link Crawler} on a pixi Application (or a
 * renderer+ticker pair) and returns it. The HUD is shown by default so you see
 * it working immediately; pass `hud: false` to keep it headless. Call
 * `crawler.dispose()` to detach (or let `autoDispose` do it on page hide).
 *
 * @example
 * ```ts
 * import { mountCrawler } from "@spine-benchmark/pixi-crawler";
 * const crawler = mountCrawler(app);                 // HUD visible
 * const headless = mountCrawler(app, { hud: false, telemetry: { sink } });
 * ```
 *
 * Contract: `app.ticker` must NOT be `Ticker.shared` (Spine collides). The
 * package's pixi peer version must match the app's exactly - the crawler
 * patches prototypes.
 */
export function mountCrawler(target: CrawlerTarget, options: MountOptions = {}): Crawler {
  const { autoDispose = true, hud = true, ...rest } = options;
  const crawler = new Crawler({ hud, ...rest });
  crawler.attach(target.renderer, target.ticker);
  if (autoDispose && typeof window !== "undefined") {
    window.addEventListener("pagehide", () => void crawler.dispose(), { once: true });
  }
  return crawler;
}
