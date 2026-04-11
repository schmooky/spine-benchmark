# Architecture

This document is the "how the pieces fit together" companion to
[`README.md`](../README.md) (surface) and [`AGENTS.md`](../AGENTS.md)
(house style). If you want to understand why a file lives where it
lives, you are in the right place.

> **Scope.** This is a living document. It describes the repo as of
> the `v3.2` line. Where the code and this document disagree, fix
> both.

## Contents

- [Bird's-eye view](#birds-eye-view)
- [The two scoring paths](#the-two-scoring-paths)
- [Package topology](#package-topology)
- [Data flow: skeleton to score](#data-flow-skeleton-to-score)
- [Apps vs published packages](#apps-vs-published-packages)
- [Load-bearing constraints](#load-bearing-constraints)
- [Release + snapshot flow](#release--snapshot-flow)
- [Where to find things](#where-to-find-things)

## Bird's-eye view

Spine Benchmark is a **two-view profiling system** for Spine 4.2
animations. The same scoring math drives both views, which is the
whole point - a number you see in the hosted benchmark must match
the number a live PixiJS scene reports at runtime.

```
       +-------------------------+            +-----------------------------+
       |  Offline path           |            |  Live path                  |
       |  (apps/benchmark)       |            |  (@spine-benchmark/         |
       |                         |            |   pixi-crawler)             |
       |  user uploads a         |            |  attaches to a running      |
       |  .skel + .atlas + .png  |            |  PixiJS Application, walks  |
       |  bundle                 |            |  the scene graph each frame|
       +-----------+-------------+            +--------------+--------------+
                   |                                         |
                   |   both import the canonical formulas    |
                   v                                         v
            +--------------------------------------------------------+
            |  @spine-benchmark/metrics-impact-formula                |
            |  RI (Rendering Impact) + CI (Computational Impact)      |
            |  zero deps, pure math, single source of truth           |
            +--------------------------------------------------------+
```

The offline path samples an uploaded skeleton across its whole
animation timeline, runs analyzers over each frame, and produces a
detailed per-animation report. The live path sees whatever is on
screen right now and scores it against the same formulas. Neither
path owns the math - both import it from a leaf package so the two
cannot drift.

## The two scoring paths

### Offline (hosted benchmark)

Entry point: [`apps/benchmark/src/main.tsx`](../apps/benchmark/src/main.tsx).

1. User drops a Spine bundle on the page.
2. [`@spine-benchmark/asset-store`](../packages/asset-store/) and
   [`@spine-benchmark/spine-loader`](../packages/spine-loader/) parse
   the skeleton and cache it.
3. [`@spine-benchmark/metrics-sampling`](../packages/metrics-sampling/)
   walks each animation timeline and collects per-frame inputs.
4. [`@spine-benchmark/metrics-analyzers`](../packages/metrics-analyzers/)
   produces feature-specific numbers (mesh vertices, constraint counts,
   blend modes, clipping regions, physics).
5. [`@spine-benchmark/metrics-impact-formula`](../packages/metrics-impact-formula/src/index.ts)
   converts those numbers into RI/CI costs.
6. [`@spine-benchmark/metrics-scoring`](../packages/metrics-scoring/)
   classifies costs into impact levels (`minimal` | `low` | `moderate`
   | `high` | `veryHigh`) using `DEFAULT_IMPACT_BRACKETS`.
7. [`@spine-benchmark/metrics-reporting`](../packages/metrics-reporting/)
   aggregates everything into an `ImpactReportModel`, which the UI
   renders (and which [`apps/reports-api`](../apps/reports-api/) can
   server-render for encrypted share links).

The heatmap visualisation in
[`apps/benchmark/src/hooks/useAnimationHeatmap.ts`](../apps/benchmark/src/hooks/useAnimationHeatmap.ts)
calls `renderingImpactCost()` + `computationalImpactCost()` directly
from the leaf package.

### Live (pixi-crawler)

Entry point:
[`packages/pixi-crawler/src/core/spine-analyzer.ts`](../packages/pixi-crawler/src/core/spine-analyzer.ts).

The crawler attaches to a running `PIXI.Application`. Each frame it
walks the scene graph, finds Spine instances, and computes the same
RI/CI numbers using the same leaf package. It intentionally imports
only `metrics-impact-formula` and `pixi.js` - nothing from the
offline analyzer stack - so the footprint shipped to consumers stays
minimal.

### How parity is enforced

Three things keep the two paths in agreement:

1. **One formula source.** Both paths import
   `renderingImpactCost()` + `computationalImpactCost()` from
   `@spine-benchmark/metrics-impact-formula`. A lint guard
   (`scripts/check-no-duplicate-impact-formulas.mjs`) fails the
   build if anyone reimplements the math outside that package.
2. **Shared visibility rules.** "Is this slot contributing to the
   frame right now?" is answered the same way in both paths:
   `slot.color.a > 0 && slot.bone?.active !== false`. Constraint
   activation follows the same rule (`constraint.active === true`).
3. **A parity test.** The suite at
   [`packages/pixi-crawler/src/core/__tests__/spine-analyzer.test.ts`](../packages/pixi-crawler/src/core/__tests__/spine-analyzer.test.ts)
   feeds a skeleton to both code paths and asserts the RI/CI numbers
   match.

If you are editing scoring math: edit the leaf, run the tests, and
move on. If you are editing the visibility heuristic: edit both
paths in the same PR and extend the parity test.

## Package topology

```
                  metrics-impact-formula  (leaf, zero deps)
                         ^            ^
                         |            |
                         |            +------------------+
                         |                               |
                  metrics-factors                   pixi-crawler
                         ^                              (live)
                         |
                  metrics-analyzers
                         ^
              +----------+----------+
              |                     |
     metrics-sampling        metrics-scoring
              \                     /
               +--------+----------+
                        v
                 metrics-pipeline
                        ^
                        |
                 metrics-reporting
                        ^
                        |
                     metrics          (umbrella re-export)
                        ^
                        |
                  apps/benchmark      apps/reports-api
```

### Groups

- **Canonical leaf.**
  [`metrics-impact-formula`](../packages/metrics-impact-formula/) has
  zero runtime dependencies, ships RI/CI math, and is the "single
  source of truth" every consumer imports.
- **Measurement primitives.**
  [`metrics-factors`](../packages/metrics-factors/) defines the raw
  fields analyzers collect (vertex counts, blend modes, etc.).
- **Analyzers.**
  [`metrics-analyzers`](../packages/metrics-analyzers/) plus the
  specialised `mesh-tools`, `constraint-tools`, `drawcall-tools`,
  `render-tools`, and `file-tools` packages compute per-feature
  numbers from a parsed skeleton.
- **Sampling + scoring.**
  [`metrics-sampling`](../packages/metrics-sampling/) walks animation
  timelines; [`metrics-scoring`](../packages/metrics-scoring/)
  classifies cost numbers into impact levels.
- **Orchestration.**
  [`metrics-pipeline`](../packages/metrics-pipeline/) wires sampling,
  analyzers, and scoring into one callable pipeline.
  [`metrics-reporting`](../packages/metrics-reporting/) builds the
  `ImpactReportModel` offline consumers use.
- **Umbrella.** [`metrics`](../packages/metrics/) re-exports the
  above so the benchmark app can `import { SpineAnalyzer } from
  '@spine-benchmark/metrics'` without reaching into sub-packages.
- **Asset + loading.**
  [`asset-store`](../packages/asset-store/),
  [`spine-loader`](../packages/spine-loader/), and
  [`workbench-core`](../packages/workbench-core/) manage parsed
  Spine data and shared UI plumbing.
- **Published runtime libraries.**
  [`pixi-crawler`](../packages/pixi-crawler/) is the live profiler.
  [`spinefolio`](../packages/spinefolio/) is a standalone Spine
  widget for PixiJS v8 portfolios, independent of the analysis
  stack, used by `apps/reports-api` to render per-animation previews
  in share links.
- **Tooling.** [`cli`](../packages/cli/) is a thin command-line
  wrapper around the pipeline.

**Direction of dependency** is strictly upward in the diagram above.
Nothing below `metrics-impact-formula` may import from anything
above it. The duplication guard enforces that the formulas
themselves do not leak out of the leaf.

## Data flow: skeleton to score

A single function call from the benchmark app walks the whole
pipeline: `SpineAnalyzer.analyze(spine)` in
[`packages/metrics/src/SpineAnalyzer.ts`](../packages/metrics/src/SpineAnalyzer.ts).

1. **Parse.** `spine-loader` turns `.skel` + `.atlas` + textures into
   a Spine instance. `asset-store` caches it.
2. **Sample.** `metrics-sampling` walks each animation at a fixed
   rate (`sampleRate: 30` by default). At each sample the skeleton
   is posed, then handed off to the analyzers.
3. **Analyze.** Per-feature analyzers in `metrics-analyzers` read
   the posed skeleton and produce raw counts: visible mesh vertices,
   active constraints, blend mode transitions, clipping regions,
   physics behaviours.
4. **Score.** `metrics-impact-formula` turns those counts into RI
   and CI cost numbers. `metrics-scoring` classifies each number
   into an impact level using `DEFAULT_IMPACT_BRACKETS`.
5. **Report.** `metrics-reporting.buildImpactReportModel()` rolls
   the per-animation results into a `SpineAnalysisResult` shaped
   like:

   ```ts
   {
     skeletonName: string;
     totalAnimations: number;
     totalSkins: number;
     skeleton: SkeletonAnalysis;
     animations: AnimationAnalysis[]; // per-animation mesh/clip/blend/constraint
     globalMesh: GlobalMeshAnalysis;
     globalClipping: GlobalClippingAnalysis;
     globalBlendMode: GlobalBlendModeAnalysis;
     globalPhysics: GlobalPhysicsAnalysis;
     stats: AnalysisStatistics;
   }
   ```

   The same type is consumed by the UI, by the share-link renderer,
   and by the CLI.

## Apps vs published packages

| Workspace | Published to npm | Deployed | What it is |
|---|---|---|---|
| `@spine-benchmark/site` | no (private) | https://spine.schmooky.dev | Public benchmark site |
| `@spine-benchmark/crawler-demo` | no (private) | separate dev demo | Live crawler showcase |
| `@spine-benchmark/reports-api` | no (private) | backend service | Encrypted report + share link server |
| `@spine-benchmark/metrics-impact-formula` | yes | - | Canonical RI/CI math |
| `@spine-benchmark/pixi-crawler` | yes | - | Live PixiJS profiler |
| `@spine-benchmark/spinefolio` | yes | - | Spine widget for portfolios |
| `@spine-benchmark/cli` | yes | - | Command-line analyzer |
| ...and the 14 other `metrics-*` / `*-tools` packages | yes | - | Reusable building blocks |

The public API of the project is the set of npm packages. The apps
are the reference consumers - they exist so the packages get real
mileage before shipping. Anything in `apps/` can assume it is the
last link in the chain and is free to import any workspace package,
but packages never import from apps.

## Load-bearing constraints

Three rules are enforced by lint guards that run as part of
`npm test` (and therefore block CI). Read
[`AGENTS.md`](../AGENTS.md) for the full rationale; in short:

- **No duplicate impact formulas.**
  [`scripts/check-no-duplicate-impact-formulas.mjs`](../scripts/check-no-duplicate-impact-formulas.mjs)
  scans for the mesh-clamp and constraint-weight signatures and
  fails the build if either shows up outside
  `packages/metrics-impact-formula/src/index.ts`. This is what
  makes the "single source of truth" real.
- **No fancy Unicode.**
  [`scripts/check-no-fancy-unicode.mjs`](../scripts/check-no-fancy-unicode.mjs)
  forbids em-dash, en-dash, curly quotes, and decorative arrows in
  source, commit messages, changelog entries, and UI strings. Use
  ASCII: `->`, `<-`, `-`, `"`. The guard has a short allowlist for
  `AGENTS.md` itself.
- **No hardcoded UI strings.** The `check:i18n` check fails if a
  component under `apps/benchmark/src/components` references a
  string not present in both `locales/en.json` and `locales/ru.json`.
  Add the key, wire it via `t(...)`, and it will pass.

## Release + snapshot flow

The release story has two paths and one leaf invariant.

**Leaf invariant.** Bumping `metrics-impact-formula` cascades a
patch bump to every workspace package that depends on it, so the
npm registry never has a published consumer referencing stale
formulas. Configured via `updateInternalDependencies: "patch"` in
[`.changeset/config.json`](../.changeset/config.json).

**Production releases (`main`).** Author a changeset
(`npx changeset`), commit it, open a PR, merge. The `release`
workflow opens or updates a "chore: version packages" PR with the
bumps and regenerated changelogs. Merging *that* PR triggers
`npm run release`, which builds every publishable package in
topological order and publishes the bumped ones with npm
provenance.

**Snapshots (`v*` branches).** Long-lived version branches publish
preview releases to npm under a per-branch dist-tag on every push
(and on a nightly cron). Versions are stamped
`<base>-<sanitized-branch>-<timestamp>`, never overwrite, and are
signed with npm provenance just like production releases. The
snapshot script refuses to run against `main`. See the
[Releases section of the README](../README.md#releases) for the
full story.

## Where to find things

| Topic | File |
|---|---|
| Canonical RI/CI math | [`packages/metrics-impact-formula/src/index.ts`](../packages/metrics-impact-formula/src/index.ts) |
| Headless pipeline entry | [`packages/metrics/src/SpineAnalyzer.ts`](../packages/metrics/src/SpineAnalyzer.ts) |
| Report model builder | [`packages/metrics-reporting/src/impactReportModel.ts`](../packages/metrics-reporting/src/impactReportModel.ts) |
| Heatmap in the UI | [`apps/benchmark/src/hooks/useAnimationHeatmap.ts`](../apps/benchmark/src/hooks/useAnimationHeatmap.ts) |
| Live crawler entry | [`packages/pixi-crawler/src/core/spine-analyzer.ts`](../packages/pixi-crawler/src/core/spine-analyzer.ts) |
| Parity test | [`packages/pixi-crawler/src/core/__tests__/spine-analyzer.test.ts`](../packages/pixi-crawler/src/core/__tests__/spine-analyzer.test.ts) |
| Formula-duplication guard | [`scripts/check-no-duplicate-impact-formulas.mjs`](../scripts/check-no-duplicate-impact-formulas.mjs) |
| Unicode guard | [`scripts/check-no-fancy-unicode.mjs`](../scripts/check-no-fancy-unicode.mjs) |
| House style and tone | [`AGENTS.md`](../AGENTS.md) |
| Contribution workflow | [`CONTRIBUTING.md`](../CONTRIBUTING.md) |

If you change anything on the right side of this table, check
whether the left side is still accurate.
