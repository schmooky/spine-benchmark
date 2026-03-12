// Core exports
export { Crawler } from './core/index.js';
export { Scanner } from './core/index.js';
export { Recorder } from './core/index.js';
export { WaterfallSpy } from './core/index.js';
export { CrawlerBridge } from './core/index.js';
export { SpineBudgetTracker } from './core/index.js';
export { isSpine, analyzeSpine } from './core/index.js';
export { openRemotePanel } from './core/index.js';

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

export { DEFAULT_CONFIG, ISSUE_IMPACT, ISSUE_EXPLAIN } from './core/index.js';

// Dynamic UI import helper for tree-shaking
export async function loadUI() {
  return import('./ui/index.js');
}
