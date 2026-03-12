/**
 * @module @spine-benchmark/pixi-crawler/core
 *
 * Core engine for real-time PixiJS scene-graph analysis.
 * Provides scene traversal, Spine skeleton profiling (RI/CI metrics),
 * GL draw-call interception, recording, and remote diagnostic panel.
 */

// ── Primary entry point ──────────────────────────────────────

/** Main crawler - attach to a PixiJS `Application` to start profiling. */
export { Crawler } from './crawler.js';

// ── Building blocks (for advanced / custom integrations) ──────

/** Scene-graph traversal engine that collects per-node metadata and issues. */
export { Scanner } from './scanner.js';

/** Ring-buffer frame history and recording session manager. */
export { Recorder } from './recorder.js';

/** GL draw-call interceptor for real waterfall-style draw call tracking. */
export { WaterfallSpy } from './waterfall.js';

/** BroadcastChannel bridge that streams frame data to the remote panel. */
export { CrawlerBridge } from './bridge.js';

/** Per-skeleton budget tracker with ring-buffer history and aggregate calculation. */
export { SpineBudgetTracker } from './spine-budget-tracker.js';

/**
 * Duck-type check: returns `true` if a PixiJS Container looks like a Spine instance.
 * Works without importing the Spine class, making it safe for tree-shaking.
 */
export { isSpine } from './spine-analyzer.js';

/**
 * Deep-analyze a Spine node's draw order to compute draw-call fragmentation,
 * Rendering Impact (RI), and Computational Impact (CI).
 */
export { analyzeSpine } from './spine-analyzer.js';

/** Open the self-contained remote diagnostic panel in a new browser tab. */
export { openRemotePanel } from './remote-panel.js';

// ── Types ────────────────────────────────────────────────────

export type {
  /** Full set of configurable thresholds and feature flags. */
  CrawlerConfig,
  /** Single-frame performance snapshot (node count, draw calls, issues, budget). */
  FrameSnapshot,
  /** A recorded session of consecutive frame snapshots. */
  Recording,
  /** Per-node metadata stored via WeakMap during scene traversal. */
  NodeMeta,
  /** A performance issue detected on a node during a scan. */
  Issue,
  /** String union of all issue codes (e.g. `'SPINE_EXPENSIVE'`). */
  IssueCode,
  /** Scene-graph node classification (`'sprite'`, `'spine'`, `'graphics'`, …). */
  NodeKind,
  /** Deep analysis result for a single Spine skeleton. */
  SpineAnalysis,
  /** Per-slot breakdown inside a Spine analysis. */
  SpineSlotInfo,
  /** Batch break between two Spine slots. */
  SpineBatchBreak,
  /** Mask analysis for a masked node. */
  MaskAnalysis,
  /** Census of all scene-graph objects found during a scan. */
  ObjectCensus,
  /** Rendering Impact breakdown (blend modes, clipping masks, vertices). */
  RenderingImpact,
  /** Computational Impact breakdown (constraints, weighted/deformed meshes). */
  ComputationalImpact,
  /** Combined RI + CI budget for a single Spine skeleton. */
  SpineBudget,
  /** Ring-buffer history of budget measurements for one skeleton. */
  SpineBudgetHistory,
  /** Aggregate budget across all visible Spine skeletons in a frame. */
  AggregateBudget,
  /** Impact classification: `'minimal'` | `'low'` | `'moderate'` | `'high'` | `'very-high'`. */
  ImpactLevel,
} from './types.js';

// ── Constants and utilities ──────────────────────────────────

/** Default crawler configuration values. */
export { DEFAULT_CONFIG } from './types.js';

/** Impact weight per issue code (higher = more GPU/CPU cost). Used for sorting and filtering. */
export { ISSUE_IMPACT } from './types.js';

/** Human-readable explanation + remediation advice for each issue code. */
export { ISSUE_EXPLAIN } from './types.js';

/** Default impact brackets `[3, 8, 15, 25]` aligned with metrics-reporting. */
export { DEFAULT_IMPACT_BRACKETS } from './types.js';

/**
 * Classify a numeric score into an impact level using configurable brackets.
 *
 * @param score - The RI, CI, or combined budget score to classify.
 * @param brackets - Optional `[low, moderate, high, veryHigh]` thresholds.
 *                   Defaults to `[3, 8, 15, 25]`.
 * @returns One of `'minimal'` | `'low'` | `'moderate'` | `'high'` | `'very-high'`.
 */
export { classifyImpactLevel } from './types.js';

// ── Waterfall types ──────────────────────────────────────────

export type {
  /** A single GL draw call entry in the waterfall timeline. */
  WaterfallEntry,
  /** A state change (blend, stencil, FBO, program) between draw calls. */
  WaterfallBreak,
} from './waterfall.js';

// ── Remote panel types ───────────────────────────────────────

export type {
  /** Frame data payload sent to the remote panel via BroadcastChannel. */
  RemoteFrameData,
  /** Issue entry in the remote panel's issue list. */
  RemoteIssue,
  /** Problem node diagnostic sent to the remote panel. */
  RemoteProblemNode,
  /** Timing breakdown for a single crawler tick (scan, overlay, total). */
  FrameTiming,
} from './bridge.js';
