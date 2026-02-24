# @spine-benchmark/metrics

Reusable Spine benchmark metrics package extracted from Spine Benchmark.

This package is now a compatibility facade over:
- `@spine-benchmark/metrics-pipeline`
- `@spine-benchmark/metrics-factors`
- `@spine-benchmark/metrics-scoring`
- `@spine-benchmark/metrics-reporting`
- `@spine-benchmark/metrics-sampling`
- `@spine-benchmark/metrics-analyzers`

## What it exports

- `SpineAnalyzer` - high-level full skeleton + animation analysis
- Pipeline helpers in `analysis/*`
- Analyzer helpers in `analyzers/*`
- Scoring helpers in `utils/scoreCalculator`
- JSON/report export helpers
- Constants in `constants/performanceFactors`

## Usage

```ts
import { SpineAnalyzer } from '@spine-benchmark/metrics';

const result = SpineAnalyzer.analyze(spineInstance);
console.log(result.skeleton.metrics.totalBones);
```

## Build

```bash
npm run build
```
