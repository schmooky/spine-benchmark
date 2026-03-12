/**
 * @module @spine-benchmark/pixi-crawler
 *
 * Real-time Spine animation profiler and performance analyzer for PixiJS.
 *
 * @example
 * ```ts
 * import { Crawler } from '@spine-benchmark/pixi-crawler';
 *
 * const crawler = new Crawler(app, {
 *   overlayEnabled: true,
 *   impactBrackets: [3, 8, 15, 25],  // mobile defaults
 * });
 *
 * // On-demand scan
 * const snapshot = crawler.scan();
 * console.log(snapshot.drawCalls, snapshot.issueCount);
 *
 * // Open the remote diagnostic panel
 * // (also available via the W key when overlay is active)
 * ```
 */

// ── Core classes ─────────────────────────────────────────────
export { Crawler } from './core/index.js';
export { Scanner } from './core/index.js';
export { Recorder } from './core/index.js';
export { WaterfallSpy } from './core/index.js';
export { CrawlerBridge } from './core/index.js';
export { SpineBudgetTracker } from './core/index.js';
export { isSpine, analyzeSpine } from './core/index.js';
export { openRemotePanel } from './core/index.js';

// ── Types ────────────────────────────────────────────────────
export type {
  CrawlerConfig,
  FrameSnapshot,
  Recording,
  NodeMeta,
  Issue,
  IssueCode,
  NodeKind,
  SpineAnalysis,
  SpineSlotInfo,
  SpineBatchBreak,
  MaskAnalysis,
  ObjectCensus,
  RenderingImpact,
  ComputationalImpact,
  SpineBudget,
  SpineBudgetHistory,
  AggregateBudget,
  ImpactLevel,
  WaterfallEntry,
  RemoteFrameData,
  FrameTiming,
} from './core/index.js';

// ── Constants ────────────────────────────────────────────────
export { DEFAULT_CONFIG, ISSUE_IMPACT, ISSUE_EXPLAIN, DEFAULT_IMPACT_BRACKETS, classifyImpactLevel } from './core/index.js';

/**
 * Dynamically import the overlay UI module.
 * Use this for tree-shaking: the UI is only loaded when explicitly requested
 * or when the Crawler is constructed with `overlayEnabled: true`.
 */
export async function loadUI() {
  return import('./ui/index.js');
}
