<p align="center">
  <img src="./logo.svg" alt="Spine Benchmark logo" width="180" />
</p>

# Spine Benchmark

Spine Benchmark is a monorepo for analyzing and optimizing Spine 4.2 animations.
It includes a browser workbench, reusable metrics packages, and runtime tooling.

- Production: https://spine.schmooky.dev/
- Repository: https://github.com/schmooky/spine-benchmark
- Updates: https://t.me/spine_benchmark

## Quick Start

```bash
git clone https://github.com/schmooky/spine-benchmark.git
cd spine-benchmark
npm install
npm run dev
```

Useful commands:

```bash
npm run build      # build benchmark site
npm run preview    # preview production build
npm run test       # run tests
```

## Monorepo Layout

| Path | Purpose |
|---|---|
| `apps/benchmark` | Benchmark UI/workbench |
| `packages/metrics` | Compatibility facade over metrics packages |
| `packages/metrics-pipeline` | End-to-end analysis orchestration |
| `packages/metrics-factors` | Shared weights/constants |
| `packages/metrics-scoring` | Impact calculators and impact UI helpers |
| `packages/metrics-sampling` | Animation sampling + active component detection |
| `packages/metrics-analyzers` | Low-level analyzers (bones/mesh/clipping/blend/constraints) |
| `packages/metrics-reporting` | JSON/report export helpers |
| `packages/asset-store` | Asset persistence + bundle validation |
| `packages/spine-loader` | Spine JSON/SKEL + atlas loading utilities |
| `packages/mesh-tools` | Mesh optimization + preview helpers |
| `packages/constraint-tools` | Constraint inspection + bake tools |
| `packages/drawcall-tools` | Draw-call analysis + atlas repack planning |
| `packages/render-tools` | Camera/background/debug rendering tools |
| `packages/file-tools` | File and drag-drop processing helpers |
| `packages/workbench-core` | Compatibility aggregator for workbench tooling |
| `packages/spinefolio` | PixiJS v8 Spine widget library |

## Impact Model (Current)

The benchmark UI classifies performance by impact cost (not weighted component score).
It tracks worst-case impact across animations in two buckets:

- Rendering impact
- Computational impact

Rendering impact cost:

```text
renderCost = (activeNonNormalBlendModes * 3)
           + (activeClipMasks * 5)
           + (totalVertices / 200)
```

Computational impact cost:

```text
computeCost = (activePhysics * 4)
            + (activeIK * 2)
            + (activeTransform * 1.5)
            + (activePath * 2.5)
            + (deformedMeshes * 1.5)
            + (weightedMeshes * 2)
```

Impact levels:

| Cost | Level |
|---:|---|
| `< 3` | Minimal |
| `3 - <8` | Low |
| `8 - <15` | Moderate |
| `15 - <25` | High |
| `>= 25` | Very high |

## Build Specific Workspaces

```bash
npm run build:metrics
npm run build:metrics-pipeline
npm run build:metrics-analyzers
npm run build:spinefolio
npm run build:workbench-core
```

## Reusing Packages

Use workspace packages directly from this monorepo, or vendor/submodule the repo into your project and import the packages you need.

Example:

```ts
import { SpineAnalyzer } from '@spine-benchmark/metrics';

const result = SpineAnalyzer.analyze(spineInstance);
console.log(result.skeleton.metrics.totalBones);
```

## Contributing

1. Create a branch from `main`.
2. Make focused changes.
3. Run `npm run test`.
4. Open a PR with a short summary.

## License

MIT. See `LICENSE` in the relevant package.
Third-party runtime licenses apply (PixiJS, Spine runtime).
