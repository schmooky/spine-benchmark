# Spine Benchmark

Advanced performance analysis tool for Spine 4.2.x animations with real-time optimization insights.

**Production URL**: https://spine.schmooky.dev/  
**Repository**: https://github.com/schmooky/spine-benchmark  
**Updates**: https://t.me/spine_benchmark

## Overview

Spine Benchmark provides comprehensive performance analysis through quantitative metrics, visual debugging tools, and optimization recommendations. Features include frame-by-frame analysis, draw call batching analysis, game state performance testing, and multi-language support.

### Key Features

- **Performance Analysis**: Logarithmic scoring system (0-100) with CI/RI/TI metrics
- **Batching Analysis**: Draw call optimization with batch break detection
- **Visual Debugging**: Mesh, physics, and constraint visualization
- **Game State Testing**: E2E performance validation for complex scenes
- **Asset Management**: History tracking with reload capabilities
- **Multi-format Support**: JSON, SKEL, Atlas with drag-drop loading
- **Internationalization**: 8+ languages with auto-detection
- **Background Customization**: Custom background images for context
- **Toast Notifications**: Real-time feedback system
- **Command Palette**: Keyboard-driven workflow (`Ctrl/Cmd+K`)

## System Requirements

**Browser Support**: Chrome 90+, Firefox 88+, Safari 14.1+, Edge 90+  
**Technical**: WebGL 2.0, ES2020, 4GB RAM, 512MB VRAM

## Performance Metrics

### Scoring System
`performanceScore = max(40, 100 - Σ(componentPenalty × weight))`

**Component Weights**:
- Bone Structure: 15%
- Mesh Complexity: 25% 
- Clipping Masks: 20%
- Blend Modes: 15%
- Constraints: 25%

### Impact Metrics
- **CI (Computation Impact)**: Runtime calculations (constraints, physics)
- **RI (Rendering Impact)**: GPU operations (draw calls, geometry)
- **TI (Total Impact)**: CI + RI combined score

**Score Ranges**:
- 85-100: Excellent (<5ms frame time)
- 70-84: Good (5-10ms frame time)
- 55-69: Moderate (10-16ms, optimization recommended)
- 40-54: Poor (>16ms, optimization required)

## Installation

```bash
git clone https://github.com/schmooky/spine-benchmark.git
cd spine-benchmark
npm install
npm run dev
```

**Scripts**:
- `npm run build` - Production build
- `npm run test` - Unit tests
- `npm run test:e2e` - Game state performance tests
- `npm run test:coverage` - Coverage report

## Usage

### Loading Assets

**Drag & Drop**: JSON/SKEL + Atlas + images or complete folders  
**URL Loading**: `?json=<url>&atlas=<url>` or Command Palette (`Ctrl/Cmd+K`)  
**Programmatic**: [`SpineLoader.loadSpineFromUrls()`](src/core/SpineLoader.ts:25)

### Analysis Features

**Performance Analysis**: Detailed breakdown of all performance components  
**Batching Analysis**: Draw call optimization with batch break detection  
**Visual Debug**: Toggle mesh, physics, and constraint overlays  
**Asset History**: Track loaded assets with performance comparisons

### Game State Testing

Create performance validation tests for complex scenes:

```bash
# Create test configuration
mkdir tests/e2e/game-states/my-scene
# Add config.json with spine instances and thresholds
npm run test:e2e
```

**Example config.json**:
```json
{
  "name": "Battle Scene",
  "description": "5 characters with effects",
  "spines": [
    {
      "skeletonPath": "assets/character.json",
      "atlasPath": "assets/character.atlas", 
      "count": 5,
      "animation": "attack"
    }
  ],
  "thresholds": {
    "maxCI": 50,
    "maxRI": 30,
    "maxTI": 80,
    "minScore": 70
  }
}
```

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl/Cmd+K` | Command palette |
| `Escape` | Close panels |
| `Arrow Keys` | Navigate palette |

## API Reference

### Core Classes

**[`SpinePerformanceAnalyzer`](src/core/SpinePerformanceAnalyzer.ts:71)**
```typescript
static analyze(spine: Spine): SpinePerformanceAnalysisResult
static exportJSON(result: SpinePerformanceAnalysisResult): object
```

**[`SpineLoader`](src/core/SpineLoader.ts:12)**
```typescript
async loadSpineFiles(files: FileList): Promise<Spine | null>
async loadSpineFromUrls(jsonUrl: string, atlasUrl: string): Promise<Spine | null>
```

**[`CameraContainer`](src/core/CameraContainer.ts:6)**
```typescript
lookAtChild(spine: Spine): void
toggleMeshes(visible?: boolean): void
togglePhysics(visible?: boolean): void
setDebugFlags(flags: DebugFlags): void
```

### Components

**Analysis UI**: [`Summary`](src/components/analysis/Summary.tsx), [`BatchingAnalysis`](src/components/analysis/BatchingAnalysis.tsx), [`MeshAnalysis`](src/components/analysis/MeshAnalysis.tsx)  
**Controls**: [`AnimationControls`](src/components/AnimationControls.tsx), [`CommandPalette`](src/components/CommandPalette.tsx)  
**Utilities**: [`ToastProvider`](src/hooks/ToastContext.tsx), [`BackgroundManager`](src/core/BackgroundManager.ts)

## Architecture

```
src/
├── components/
│   ├── analysis/          # Analysis panels and visualization
│   └── [controls]         # UI controls and modals  
├── core/
│   ├── analyzers/         # Performance analysis engines
│   ├── utils/             # Scoring and calculation utilities
│   └── [managers]         # Asset and rendering management
├── hooks/                 # React hooks and context providers
├── locales/              # Internationalization files
└── tests/e2e/            # Game state performance tests
```

**Tech Stack**:
- React 19.2 + TypeScript 5.9
- Pixi.js 8.14 + Spine Runtime 4.2.94  
- Vite 7.1 + Jest 30.2
- i18next 25.6 + React-Toastify 11.0

## Contributing

1. Fork repository
2. Create feature branch
3. Add tests for new analyzers/components
4. Update localization files
5. Submit pull request

**Standards**: TypeScript strict mode, ESLint + Prettier, component tests required

**Feature Requests**: [GitHub Issues](https://github.com/schmooky/spine-benchmark/issues) or [@schm00ky](https://t.me/schm00ky)

## License

MIT License - see [LICENSE](LICENSE)

**Third-Party**: Spine Runtime (Spine License), Pixi.js/React/i18next (MIT)