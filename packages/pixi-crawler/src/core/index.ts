export { Crawler } from './crawler.js';
export { Scanner } from './scanner.js';
export { Recorder } from './recorder.js';
export { WaterfallSpy } from './waterfall.js';
export { CrawlerBridge } from './bridge.js';
export { SpineBudgetTracker } from './spine-budget-tracker.js';
export { isSpine, analyzeSpine } from './spine-analyzer.js';
export { openRemotePanel } from './remote-panel.js';

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
} from './types.js';

export { DEFAULT_CONFIG, ISSUE_IMPACT, ISSUE_EXPLAIN } from './types.js';
export type { WaterfallEntry, WaterfallBreak } from './waterfall.js';
export type { RemoteFrameData, RemoteIssue, RemoteProblemNode, FrameTiming } from './bridge.js';
