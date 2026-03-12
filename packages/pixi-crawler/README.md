# @spine-benchmark/pixi-crawler

A real-time Spine animation profiler and performance analyzer for PixiJS applications. Provides in-game debugging overlay, frame recording, statistical analysis, and remote waterfall visualization for identifying and fixing performance bottlenecks.

## Features

- **Real-time Scene Analysis**: Traverse PixiJS scene graph, detect performance issues, track node statistics
- **Spine Animation Profiling**: Deep analysis of Spine skeleton draw order, batch breaks, rendering and computational impact
- **GL Draw Call Counting**: Intercept and count WebGL draw calls with state change detection
- **Frame Recording & Playback**: Capture performance data over time, generate detailed reports
- **In-Game Debug Overlay**: Toggle-able overlay showing FPS, draw calls, budget metrics, problem nodes, and detailed analysis
- **Remote Waterfall Panel**: Open a separate browser window to view detailed flamechart, waterfall analysis, and frame thumbnails
- **Budget Tracking**: Monitor rendering impact (RI) and computational impact (CI) per skeleton
- **Keyboard Controls**: Quick toggles for overlay, graphs, issues, highlights, recording, reports

## Installation

```bash
npm install @spine-benchmark/pixi-crawler pixi.js
```

## Quick Start

```typescript
import { Application } from 'pixi.js';
import { Crawler } from '@spine-benchmark/pixi-crawler';

const app = new Application();

// Initialize crawler with default configuration
const crawler = new Crawler(app, {
  overlayEnabled: true,
  scanInterval: 4, // scan every 4 frames
  maxDepth: 20,    // traverse up to 20 levels deep
});

// Crawler automatically:
// - Installs GL waterfall spy (if WebGL context available)
// - Mounts overlay to stage
// - Installs keyboard event listener
// - Starts scanning and recording frame data

// Keyboard shortcuts:
// ~ - toggle overlay
// G - toggle graph (FPS/DC/Budget)
// I - toggle issues display
// H - toggle highlights on problem nodes
// R - start/stop recording
// P - export report
// T - dump configuration and thresholds
// D - toggle detailed analysis mode
// W - open remote waterfall panel
// < > - cycle selected node
```

## API

### Crawler

Main class for profiling and analysis.

```typescript
const crawler = new Crawler(app, config);

// Access components
crawler.scanner    // Scene graph scanner
crawler.recorder   // Frame recording and history
crawler.overlay    // In-game debug overlay (nullable)

// Configuration (mutable at runtime)
crawler.config.overlayImpactThreshold = 5; // adjust threshold

// Methods
crawler.scan()              // Manually scan scene
crawler.startRecording()    // Start recording frames
crawler.stopRecording()     // Stop and return recording
crawler.getReport()         // Get formatted report
crawler.destroy()           // Cleanup
```

### Configuration

```typescript
type CrawlerConfig = {
  scanInterval: number;                    // Frames between scans (default: 4)
  historySize: number;                     // Frame history buffer size (default: 600)
  maxDepth: number;                        // Max tree depth to scan (default: 20)
  spineDrawCallThreshold: number;          // DCs for SPINE_HEAVY issue (default: 20)
  maskComplexityThreshold: number;         // Instructions for MASK_COMPLEX (default: 5000)
  excessiveChildrenThreshold: number;      // Children count for EXCESSIVE_CHILDREN (default: 50)
  deepNestingThreshold: number;            // Depth for DEEP_NESTING (default: 15)
  oversizedTextureThreshold: number;       // Pixels for OVERSIZED_TEXTURE (default: 2048)
  invisibleChildrenThreshold: number;      // Invisible children for INVISIBLE_SUBTREE (default: 10)
  overlayEnabled: boolean;                 // Show overlay (default: true)
  overlayImpactThreshold: number;          // Min impact to show problem node (default: 3)
  thumbnails: boolean;                     // Capture thumbnails (default: true)
};
```

### Types

#### FrameSnapshot
```typescript
type FrameSnapshot = {
  frame: number;
  time: number;
  fps: number;
  dt: number;              // Delta time in ms
  drawCalls: number;       // GL draw call count
  nodeCount: number;       // Total nodes in scene
  visibleNodes: number;    // Visible nodes
  issueCount: number;      // Issues detected
  heavyNodes: Array<{ node, label, score }>;
  census: ObjectCensus;
  budget: AggregateBudget;
};
```

#### Issue
```typescript
type Issue = {
  code: IssueCode;
  severity: 'warning' | 'error';
  message: string;
};

type IssueCode =
  | 'EXCESSIVE_CHILDREN'
  | 'DEEP_NESTING'
  | 'INVISIBLE_SUBTREE'
  | 'MASK_COMPLEX'
  | 'FILTER_BREAK'
  | 'BLEND_BREAK'
  | 'OVERSIZED_TEXTURE'
  | 'SPINE_HEAVY'
  | 'SPINE_BATCH_BREAK'
  | 'SPINE_CLIPPING';
```

#### SpineAnalysis
```typescript
type SpineAnalysis = {
  skeletonName: string;
  slotCount: number;
  drawOrderLength: number;
  batchBreaks: SpineBatchBreak[];
  clippingMasks: number;
  vertices: number;
  renderingImpact: RenderingImpact;
  computationalImpact: ComputationalImpact;
  budget: SpineBudget;
};

type RenderingImpact = {
  score: number;
  level: ImpactLevel;
};

type ImpactLevel = 'minimal' | 'low' | 'moderate' | 'high' | 'very-high';
```

### Functions

#### analyzeSpine
```typescript
import { analyzeSpine, isSpine } from '@spine-benchmark/pixi-crawler';

if (isSpine(node)) {
  const analysis = analyzeSpine(node);
  console.log(`Skeleton: ${analysis.skeletonName}`);
  console.log(`Impact: ${analysis.budget.level}`);
  console.log(`Batch breaks: ${analysis.batchBreaks.length}`);
}
```

#### openRemotePanel
```typescript
import { openRemotePanel } from '@spine-benchmark/pixi-crawler';

// Automatically called via 'W' key, but can be called manually:
const window = openRemotePanel();
```

### SpineBudgetTracker

Track Spine skeleton budgets across frames.

```typescript
import { SpineBudgetTracker } from '@spine-benchmark/pixi-crawler';

const tracker = new SpineBudgetTracker(maxHistory);
tracker.recordBudget('skeleton-name', budget);
const avg = tracker.calculateAverage('skeleton-name');
const agg = tracker.calculateAggregate(visibleSkeletons);
```

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| ` (backtick) | Toggle overlay |
| G | Cycle graph (FPS / Draw Calls / Budget) |
| I | Toggle issues panel |
| H | Toggle problem node highlights |
| R | Start/stop recording |
| P | Export and download report |
| T | Dump config and thresholds to console |
| D | Toggle detailed analysis mode |
| W | Open remote waterfall panel |
| < / > | Cycle selected node (analysis mode) |

## Remote Waterfall Panel

Press **W** to open a separate analysis window with:

- **Timeline**: Flamechart of scan/overlay/other timings
- **FPS Graph**: Live FPS mini-graph
- **Waterfall**: Detailed GL draw call state changes
- **Issues**: List of detected performance problems
- **Thumbnails**: Hover to see frame previews
- **Controls**: Space (pause), arrow keys (step frames), Home/End (jump)

## Report Generation

Press **P** to export a detailed performance report with:

- Duration and frame count
- FPS statistics (min, max, avg, p95)
- Draw call statistics
- Scene census (node kinds, spine skeletons, textures)
- Issues grouped by code with explanations
- Heavy frame analysis
- Mask usage analysis

## Performance Notes

- Scanning is **configurable** - adjust `scanInterval` to every 2-4 frames for minimal overhead
- GL spy uses **monkey-patching** - only active if WebGL context is available
- Overlay rendering is **very lightweight** - uses BitmapText and reuses graphics
- Remote panel uses **BroadcastChannel** for inter-window IPC - safe and isolated
- Thumbnails are **captured at reduced resolution** (5% by default) for bandwidth efficiency

## Troubleshooting

### Remote panel won't open
- Check if popup blocker is enabled
- Ensure BroadcastChannel is supported (all modern browsers)

### GL spy not active
- Some environments don't expose WebGL context - falls back to estimation
- Check console: `[crawler] GL waterfall spy installed` vs `GL context not found`

### Overlay not visible
- Check `overlayEnabled` config
- Ensure overlay container is added to stage (automatic)

### Performance overhead
- Reduce `scanInterval` (scan less frequently)
- Disable `thumbnails` if not using remote panel
- Disable `overlayEnabled` if using programmatic API only

## Development

```bash
npm run build       # Build for production
npm run build:dev   # Build with source maps
npm run type-check  # Check types without building
npm run clean       # Remove dist directory
```

## License

MIT
