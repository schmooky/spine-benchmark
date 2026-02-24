# Spine Benchmark

Performance analysis tool for Spine animations.

**Production URL**: https://spine.schmooky.dev/  
**Repository**: https://github.com/schmooky/spine-benchmark  
**Updates**: https://t.me/spine_benchmark

## Table of Contents

1. [Overview](#overview)
2. [System Requirements](#system-requirements)
3. [Performance Scoring Algorithm](#performance-scoring-algorithm)
4. [Installation](#installation)
5. [Usage](#usage)
6. [API Reference](#api-reference)
7. [Architecture](#architecture)
8. [Contributing](#contributing)
9. [License](#license)

## Overview

Spine Benchmark analyzes Spine animation performance through quantitative metrics and visual debugging tools. The application performs frame-by-frame analysis to identify performance bottlenecks in Spine 4.2.x animations.

The repository is organized as a monorepo:
- `apps/benchmark` - benchmark website/workbench UI
- `packages/metrics` - compatibility facade for metrics ecosystem packages
- `packages/metrics-pipeline` - high-level orchestration pipeline for full analysis
- `packages/metrics-factors` - shared performance constants
- `packages/metrics-scoring` - score and impact calculators
- `packages/metrics-reporting` - JSON/report export helpers
- `packages/metrics-sampling` - animation sampling and active component detection
- `packages/metrics-analyzers` - low-level analyzers for skeleton/mesh/clipping/blend/constraints
- `packages/asset-store` - asset persistence and validation
- `packages/mesh-tools` - mesh optimization and preview helpers
- `packages/constraint-tools` - constraint bake and inspection helpers
- `packages/drawcall-tools` - draw call and atlas planning helpers
- `packages/render-tools` - camera/background/debug visualization helpers
- `packages/spine-loader` - Spine JSON/SKEL + atlas loading flows
- `packages/file-tools` - file and folder processing helpers
- `packages/workbench-core` - compatibility aggregator over the packages above

### Core Functionality

- Frame-by-frame performance analysis at 60 FPS
- Logarithmic scoring system (0-100 scale)
- Debug visualization for constraints and meshes
- Multi-format file loading (JSON, SKEL, Atlas)
- Internationalization support (8 languages)

## System Requirements

### Browser Compatibility

| Browser | Minimum Version | Features |
|---------|----------------|----------|
| Chrome | 90+ | Full support including folder drag-drop |
| Firefox | 88+ | File drag-drop only |
| Safari | 14.1+ | File drag-drop only |
| Edge | 90+ | Full support including folder drag-drop |

### Technical Requirements

- WebGL 2.0 support
- JavaScript ES2020
- Minimum 4GB RAM recommended
- GPU with 512MB VRAM

## Performance Scoring Algorithm

### Score Calculation

The overall performance score is calculated as the weighted sum of component penalties, with a minimum floor of 40:

**Formula**: performanceScore = max(40, 100 - Σ(componentPenalty × componentWeight))

### Component Weights

The scoring system assigns different weights to each component based on their relative performance impact:

| Component | Weight | Description |
|-----------|--------|-------------|
| Bone Structure | 0.15 | Fifteen percent weight for skeleton complexity |
| Mesh Complexity | 0.25 | Twenty-five percent weight for mesh and vertex operations |
| Clipping Masks | 0.20 | Twenty percent weight for stencil buffer operations |
| Blend Modes | 0.15 | Fifteen percent weight for rendering state changes |
| Constraints | 0.25 | Twenty-five percent weight for runtime constraint calculations |

### Component Scoring Functions

#### 1. Bone Structure Score

The bone structure score evaluates skeleton complexity using logarithmic scaling:

**Formula**: boneScore = 100 - log₂(totalBones / idealBones + 1) × 15 - (maxDepth × depthFactor)

**Constants**:
- Ideal bone count: 30 bones
- Bone depth factor: 1.5 per hierarchy level

This formula applies a logarithmic penalty based on the ratio of actual bones to the ideal count, plus an additional linear penalty for deep bone hierarchies.

#### 2. Mesh Complexity Score

The mesh complexity score accounts for vertex count, deformation, and bone weighting:

**Formula**: meshScore = 100 - log₂(totalMeshes / idealMeshes + 1) × 15 - log₂(totalVertices / idealVertices + 1) × 10 - (deformedMeshCount × deformationFactor) - (weightedMeshCount × weightFactor)

**Constants**:
- Ideal mesh count: 15 meshes
- Ideal vertex count: 300 vertices
- Mesh deformation factor: 1.5 penalty per deformed mesh
- Mesh weight factor: 2.0 penalty per weighted mesh

The scoring applies logarithmic penalties for mesh and vertex counts, with additional linear penalties for meshes requiring runtime deformation or bone weight calculations.

#### 3. Clipping Mask Score

Clipping masks significantly impact performance due to stencil buffer operations:

**Formula**: clippingScore = 100 - log₂(maskCount / idealMasks + 1) × 20 - log₂(totalVertices + 1) × 5 - (complexMaskCount × 10)

**Constants**:
- Ideal clipping count: 2 masks
- Complex mask threshold: masks with more than 4 vertices

Complex masks receive an additional penalty of 10 points per mask due to increased fill rate requirements.

#### 4. Blend Mode Score

Non-normal blend modes require additional rendering passes:

**Formula**: blendModeScore = 100 - log₂(nonNormalCount / idealBlendModes + 1) × 20 - (additiveCount × 2)

**Constants**:
- Ideal blend mode count: 2 non-normal blend modes

Additive blend modes receive an extra penalty of 2 points each due to their higher performance impact.

#### 5. Constraint Score

Constraints are weighted by their computational complexity:

**Formula**: constraintScore = 100 - (totalConstraintImpact × 0.5)

**Total Impact Calculation**: totalConstraintImpact = (ikImpact × ikWeight) + (transformImpact × transformWeight) + (pathImpact × pathWeight) + (physicsImpact × physicsWeight)

**Constraint Weights**:
- IK constraint weight: 0.20 (20% of total constraint impact)
- Transform constraint weight: 0.15 (15% of total constraint impact)
- Path constraint weight: 0.25 (25% of total constraint impact)
- Physics constraint weight: 0.40 (40% of total constraint impact)

##### Constraint Impact Calculations

**IK Constraint Impact**: ikImpact = log₂(ikCount + 1) × 20 + log₂(totalBones + 1) × 10 + Σ(chainLength^chainLengthFactor) × 2

Where the IK chain length factor is 1.3, causing exponential impact growth for longer IK chains.

**Transform Constraint Impact**: transformImpact = log₂(transformCount + 1) × 15 + log₂(totalBones + 1) × 8 + Σ(affectedProperties) × 5

Each affected property (position, rotation, scale, shear) adds 5 points to the impact.

**Path Constraint Impact**: pathImpact = log₂(pathCount + 1) × 20 + log₂(totalBones + 1) × 10 + Σ(modeComplexity) × 7

Mode complexity varies by type: tangent mode = 1, chain mode = 2, chain scale mode = 3.

**Physics Constraint Impact**: physicsImpact = log₂(physicsCount + 1) × 30 + Σ(propertyCount × iterationFactor) × 5

The iteration factor is calculated as: max(1, 3 - damping) × strength / 50, representing the computational cost of physics iterations.

### Score Interpretation

| Score Range | Classification | Performance Impact |
|-------------|---------------|-------------------|
| 85-100 | Excellent | <5ms frame time on mid-range hardware |
| 70-84 | Good | 5-10ms frame time on mid-range hardware |
| 55-69 | Moderate | 10-16ms frame time, optimization recommended |
| 40-54 | Poor | >16ms frame time, optimization required |

## Installation

### Prerequisites

- Node.js 18.0.0 or higher
- npm 9.0.0 or higher

### Local Development Setup

```bash
# Clone repository
git clone https://github.com/schmooky/spine-benchmark.git
cd spine-benchmark

# Install dependencies
npm install

# Start development server
npm run dev

# Production build
npm run build

# Preview production build
npm run preview
```

### Workspace Scripts

```bash
# Build only metrics package
npm run build:metrics

# Build only metrics-factors package
npm run build:metrics-factors

# Build only metrics-scoring package
npm run build:metrics-scoring

# Build only metrics-sampling package
npm run build:metrics-sampling

# Build only metrics-analyzers package
npm run build:metrics-analyzers

# Build only metrics-pipeline package
npm run build:metrics-pipeline

# Build only metrics-reporting package
npm run build:metrics-reporting

# Build only asset-store package
npm run build:asset-store

# Build only mesh-tools package
npm run build:mesh-tools

# Build only constraint-tools package
npm run build:constraint-tools

# Build only drawcall-tools package
npm run build:drawcall-tools

# Build only render-tools package
npm run build:render-tools

# Build only spine-loader package
npm run build:spine-loader

# Build only file-tools package
npm run build:file-tools

# Build only benchmark site
npm run build:site
```

### Reusing Metrics In Another Project

Until npm publishing is enabled, use one of these options:

```bash
# Option 1: from local clone
npm install ../spine-benchmark/packages/metrics
npm install ../spine-benchmark/packages/metrics-factors
npm install ../spine-benchmark/packages/metrics-scoring
npm install ../spine-benchmark/packages/metrics-reporting
npm install ../spine-benchmark/packages/metrics-sampling
npm install ../spine-benchmark/packages/metrics-analyzers
npm install ../spine-benchmark/packages/metrics-pipeline

# Option 2: via git submodule in your project
git submodule add https://github.com/schmooky/spine-benchmark.git vendor/spine-benchmark
npm install ./vendor/spine-benchmark/packages/metrics
npm install ./vendor/spine-benchmark/packages/metrics-factors
npm install ./vendor/spine-benchmark/packages/metrics-scoring
npm install ./vendor/spine-benchmark/packages/metrics-reporting
npm install ./vendor/spine-benchmark/packages/metrics-sampling
npm install ./vendor/spine-benchmark/packages/metrics-analyzers
npm install ./vendor/spine-benchmark/packages/metrics-pipeline
```

Usage example:

```typescript
import { SpineAnalyzer } from '@spine-benchmark/metrics';

const result = SpineAnalyzer.analyze(spineInstance);
console.log(result.medianScore);
```

### Reusing Atomic Core Packages In Another Project

```bash
# Option 1: from local clone
npm install ../spine-benchmark/packages/asset-store
npm install ../spine-benchmark/packages/mesh-tools
npm install ../spine-benchmark/packages/constraint-tools
npm install ../spine-benchmark/packages/drawcall-tools
npm install ../spine-benchmark/packages/render-tools
npm install ../spine-benchmark/packages/spine-loader
npm install ../spine-benchmark/packages/file-tools

# Option 2: via git submodule in your project
git submodule add https://github.com/schmooky/spine-benchmark.git vendor/spine-benchmark
npm install ./vendor/spine-benchmark/packages/asset-store
npm install ./vendor/spine-benchmark/packages/mesh-tools
npm install ./vendor/spine-benchmark/packages/constraint-tools
npm install ./vendor/spine-benchmark/packages/drawcall-tools
npm install ./vendor/spine-benchmark/packages/render-tools
npm install ./vendor/spine-benchmark/packages/spine-loader
npm install ./vendor/spine-benchmark/packages/file-tools
```

Usage example:

```typescript
import { optimizeJson } from '@spine-benchmark/mesh-tools';
import { bakeConstraints } from '@spine-benchmark/constraint-tools';
import { SpineLoader } from '@spine-benchmark/spine-loader';

const { optimizedText } = optimizeJson(rawSkeletonJson);
const { bakedText, report } = bakeConstraints(spineInstance, optimizedText, { sampleRate: 30 });
const loader = new SpineLoader(app);
const loaded = await loader.loadSpineFiles(files);
console.log(report.totalKeyframesGenerated);
console.log(loaded?.skeleton?.data?.name);
```

### Environment Variables

```env
VITE_APP_VERSION=1.2.0
VITE_SPINE_VERSION=4.2.*
```

## Usage

### File Loading Methods

#### 1. Drag and Drop

Supported file combinations:
- `.json` + `.atlas` + image files
- `.skel` + `.atlas` + image files
- Complete folder structure

#### 2. URL Loading

Query parameters:
```
https://spine.schmooky.dev/?json=<json_url>&atlas=<atlas_url>
```

Command palette:
1. Press `Ctrl+K` (Windows/Linux) or `Cmd+K` (macOS)
2. Execute "Load Spine from URL"
3. Input JSON and Atlas URLs

#### 3. Programmatic Loading

```typescript
const loader = new SpineLoader(app);
const spineInstance = await loader.loadSpineFromUrls(jsonUrl, atlasUrl);
```

### Debug Visualization

| Feature | Toggle Method | Visualizes |
|---------|--------------|------------|
| Mesh Debug | `toggleMeshes()` | Triangles, vertices, hulls |
| Physics Debug | `togglePhysics()` | Constraints, springs |
| IK Debug | `toggleIk()` | Chain connections, targets |

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl/Cmd+K` | Open command palette |
| `Escape` | Close active panel |
| `Arrow Up/Down` | Navigate command palette |
| `Enter` | Execute selected command |

## API Reference

### Core Classes

#### SpineAnalyzer

```typescript
import { SpineAnalyzer } from '@spine-benchmark/metrics';

class SpineAnalyzer {
  static analyze(spineInstance: Spine): SpineAnalysisResult
  static exportJSON(analysisResult: SpineAnalysisResult): object
}
```

#### SpineLoader

```typescript
class SpineLoader {
  constructor(app: Application)
  async loadSpineFiles(files: FileList): Promise<Spine | null>
  async loadSpineFromUrls(jsonUrl: string, atlasUrl: string): Promise<Spine | null>
}
```

#### CameraContainer

```typescript
class CameraContainer extends Container {
  constructor(options: { width: number; height: number; app: Application })
  lookAtChild(spine: Spine): void
  toggleMeshes(visible?: boolean): void
  togglePhysics(visible?: boolean): void
  toggleIkConstraints(visible?: boolean): void
  setDebugFlags(flags: Partial<DebugFlags>): void
}
```

### Data Structures

#### SpineAnalysisResult

```typescript
interface SpineAnalysisResult {
  skeletonName: string
  totalAnimations: number
  totalSkins: number
  skeleton: SkeletonAnalysis
  animations: AnimationAnalysis[]
  globalMesh: GlobalMeshAnalysis
  globalClipping: GlobalClippingAnalysis
  globalBlendMode: GlobalBlendModeAnalysis
  globalPhysics: GlobalPhysicsAnalysis
  medianScore: number
  bestAnimation: AnimationAnalysis | null
  worstAnimation: AnimationAnalysis | null
  stats: AnalysisStatistics
}
```

#### AnimationAnalysis

```typescript
interface AnimationAnalysis {
  name: string
  duration: number
  overallScore: number
  meshMetrics: MeshMetrics
  clippingMetrics: ClippingMetrics
  blendModeMetrics: BlendModeMetrics
  constraintMetrics: ConstraintMetrics
  activeComponents: ActiveComponents
}
```

## Architecture

### Directory Structure

```
apps/
└── benchmark/
    ├── src/
    │   ├── components/
    │   ├── hooks/
    │   ├── routes/
    │   ├── workbench/
    │   └── core/
    │       ├── debug/
    │       ├── tools/
    │       ├── storage/
    │       ├── SpineLoader.ts (shim re-export from spine-loader package)
    │       ├── CameraContainer.ts (shim re-export from render-tools package)
    │       ├── BackgroundManager.ts (shim re-export from render-tools package)
    │       ├── utils/fileProcessor.ts (shim re-export from file-tools package)
    │       └── SpineAnalyzer.ts (shim re-export from metrics package)
    ├── scripts/
    ├── vite.config.ts
    └── package.json
packages/
├── metrics/
│   ├── src/
│   │   ├── analysis/
│   │   ├── SpineAnalyzer.ts
│   │   └── index.ts
│   └── package.json
├── metrics-pipeline/
│   ├── src/
│   │   ├── animationPipeline.ts
│   │   └── index.ts
│   └── package.json
├── metrics-factors/
│   ├── src/
│   │   ├── performanceFactors.ts
│   │   └── index.ts
│   └── package.json
├── metrics-scoring/
│   ├── src/
│   │   ├── scoreCalculator.ts
│   │   └── index.ts
│   └── package.json
├── metrics-reporting/
│   ├── src/
│   │   ├── exportJson.ts
│   │   └── index.ts
│   └── package.json
├── metrics-sampling/
│   ├── src/
│   │   ├── animationSampler.ts
│   │   ├── animationUtils.ts
│   │   └── index.ts
│   └── package.json
├── metrics-analyzers/
│   ├── src/
│   │   ├── skeletonAnalyzer.ts
│   │   ├── meshAnalyzer.ts
│   │   ├── clippingAnalyzer.ts
│   │   ├── blendModeAnalyzer.ts
│   │   ├── physicsAnalyzer.ts
│   │   └── index.ts
│   └── package.json
├── asset-store/
│   ├── src/
│   │   ├── assetStore.ts
│   │   └── index.ts
│   └── package.json
├── mesh-tools/
│   ├── src/
│   │   ├── meshOptimizer.ts
│   │   ├── meshPreviewRenderer.ts
│   │   └── index.ts
│   └── package.json
├── constraint-tools/
│   ├── src/
│   │   ├── constraintBaker.ts
│   │   └── index.ts
│   └── package.json
├── drawcall-tools/
│   ├── src/
│   │   ├── drawCallUtils.ts
│   │   └── index.ts
│   └── package.json
├── render-tools/
│   ├── src/
│   │   ├── CameraContainer.ts
│   │   ├── BackgroundManager.ts
│   │   ├── debug/
│   │   └── index.ts
│   └── package.json
├── spine-loader/
│   ├── src/
│   │   ├── SpineLoader.ts
│   │   └── index.ts
│   └── package.json
├── file-tools/
│   ├── src/
│   │   ├── fileProcessor.ts
│   │   └── index.ts
│   └── package.json
└── workbench-core/
    ├── src/
    │   └── index.ts
    └── package.json
```

### Technology Stack

| Layer | Technology | Version |
|-------|------------|---------|
| UI Framework | React | 19.x |
| Rendering | Pixi.js | 8.x |
| Spine Runtime | @esotericsoftware/spine-pixi-v8 | 4.2.* |
| Build Tool | Vite | 7.x |
| Language | TypeScript | 5.9.x |
| Internationalization | i18next | 25.x |

### Performance Characteristics

- Memory usage: ~50-200MB per loaded animation
- Analysis time: <100ms for typical animations
- Frame sampling rate: 60 FPS
- Maximum file size: 100MB recommended

## Contributing

### Development Workflow

1. Fork repository
2. Create feature branch: `git checkout -b feature/feature-name`
3. Implement changes following TypeScript strict mode
4. Add unit tests for new analyzers
5. Update localization files
6. Submit pull request

### Code Standards

- TypeScript strict mode enabled
- ESLint configuration enforced
- Prettier formatting required
- Component tests required for new features

### Feature Requests and Bounties

- Submit feature requests via [GitHub Issues](https://github.com/schmooky/spine-benchmark/issues)
- Bounty placement available through issues or direct contact: [@schm00ky](https://t.me/schm00ky)

## License

MIT License. See [LICENSE](LICENSE) file for details.

### Third-Party Licenses

- Spine Runtime: Spine Runtime License
- Pixi.js: MIT License
- React: MIT License
- i18next: MIT License
