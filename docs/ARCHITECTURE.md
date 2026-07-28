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

1. User drops a Spine bundle on the page (parsed + cached by the site's
   own vendored loader in `apps/benchmark/src/entities/skeleton`).
2. [`@spine-benchmark/metrics-impact-formula`](../packages/metrics-impact-formula/src/index.ts)'s
   `extractPoseFeatures` walks each posed animation frame into the
   canonical `ImpactFeatures` vector, and `estimatePoseCoverage` adds
   screen-normalized fill/overdraw.
3. The same package's `poseImpact` converts those features into RI/CI
   costs (for the heatmap), while the fitted per-family model
   ([`metrics-model`](../packages/metrics-model/) via
   [`metrics-analyzers`](../packages/metrics-analyzers/)) converts them
   into predicted milliseconds for the selected device.

The per-animation cost curves the workbench shows
(`measureAnimationCostCurves`) call the same walker + fitted model, so
the offline prediction and the live crawler reading cannot drift.

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

The project measures Spine cost as fitted **milliseconds per GPU
family**, not unitless RI/CI scores. The old RI/CI analyzer stack
(`metrics-pipeline`, `metrics-reporting`, `metrics-scoring`,
`metrics-factors`, the `metrics` umbrella) and the `workbench-core`
tool engine (`*-tools`, `asset-store`, `spine-loader`) were removed
once nothing consumed them - see
[ADR 0004](adr/0004-drop-ri-ci-package-stack.md).

```
        metrics-impact-formula   (leaf, zero deps: formulas +
             ^   ^   ^            pose-feature walker + coverage)
             |   |   |
    +--------+   |   +--------------------+-------------------+
    |            |                        |                   |
 cli    pixi-crawler              metrics-model         metrics-sampling
                (live)                  ^   ^              (private)
                                        |   |                  |
                                        |   +----------------- + (site)
                                        |
                                  metrics-analyzers
                                  (deviceFit + deviceClass)
                                        ^
                                        |
                                  apps/bench-server
```

### Groups

- **Canonical leaf.**
  [`metrics-impact-formula`](../packages/metrics-impact-formula/) has
  zero runtime dependencies and is the single source of truth for BOTH
  the scoring formulas (`renderingImpactCost` / `computationalImpactCost`)
  AND the pose-feature walker + coverage estimator (`extractPoseFeatures`,
  `poseImpact`, `estimatePoseCoverage`) that every path feeds them with.
  Extended to feature INPUTS by ADR 0001's addendum.
- **Cost model (public).**
  [`metrics-model`](../packages/metrics-model/) ridge-fits a feature
  vector to milliseconds; [`metrics-analyzers`](../packages/metrics-analyzers/)
  exposes `deviceFit` (per-GPU-family two-stage fit) and `deviceClass`
  (portable-family classifier). Both are pixi-free data packages.
- **Internal measurement + tooling (private).**
  [`gpu-timing`](../packages/gpu-timing/) wraps the WebGL2 timer query;
  [`metrics-sampling`](../packages/metrics-sampling/) walks animation
  timelines; [`calibration-primitives`](../packages/calibration-primitives/)
  is the source of the procedural calibration spines emitted by
  `tools/scene-pipeline`. Consumed only by this repo - never published.
- **Published runtime libraries.**
  [`pixi-crawler`](../packages/pixi-crawler/) is the embeddable live
  profiler (ships to game clients). [`spinefolio`](../packages/spinefolio/)
  is a standalone PixiJS v8 Spine widget used by `apps/reports-api`.
- **Tooling.** [`cli`](../packages/cli/) is a headless skeleton analyzer.

**Direction of dependency** is strictly upward. Nothing below
`metrics-impact-formula` imports from above it, and no PUBLIC package
depends on a private one. The duplication guard
(`scripts/check-no-duplicate-impact-formulas.mjs`) enforces that both
the formulas AND the pose walk stay in the leaf.

## Data flow: skeleton to predicted milliseconds

1. **Pose.** The skeleton is posed - live on the workbench stage, per
   animation frame offline, or per instance in the bench-runner.
2. **Walk.** `metrics-impact-formula`'s `extractPoseFeatures` walks the
   current `drawOrder` once into the canonical `ImpactFeatures` vector
   (vertices incl. region/sequence quads, meshes, constraints,
   draw-call estimate), and `estimatePoseCoverage` adds screen-normalized
   fill/overdraw.
3. **Measure (calibration).** A device client records real per-frame CPU ms
   against those features on real phones and uploads them to a fleet server.
   > **Not in this repo.** The measurement client (`bench-runner` /
   > spine-run) and the fleet server (`bench-server`) are maintained
   > separately: their scene corpus is built from licensed studio game
   > assets, which must not live in this tree. What ships here is the
   > *result* - `packages/metrics-analyzers/data/device-calibration.json`,
   > which contains only device labels, fitted weights and error bands, and
   > no game data.
4. **Predict (workbench).** The site reads that calibration and multiplies
   the current pose's features by the selected device's weights to show a
   predicted CPU ms alongside its held-out `+-N%` band. GPU ms is not
   modelled: browsers withhold the WebGL GPU timer on nearly every platform.
5. **Validate.** Each device's model is scored by 5-fold held-out MAPE at
   build time; only devices inside the trust ceiling are marked `trusted`.

## Apps vs published packages

| Workspace | Published to npm | Deployed | What it is |
|---|---|---|---|
| `@spine-benchmark/site` | no (private) | https://spine.schmooky.dev | Benchmark site / workbench |
| `@spine-benchmark/crawler-demo` | no (private) | separate dev demo | Live crawler showcase |
| `@spine-benchmark/reports-api` | no (private) | backend service | Encrypted report + share link server |
| `@spine-benchmark/metrics-impact-formula` | yes | - | Formulas + pose walker + coverage |
| `@spine-benchmark/metrics-model` | yes | - | Feature-vector to ms ridge fit |
| `@spine-benchmark/metrics-analyzers` | yes | - | `deviceFit` + `deviceClass` toolkit |
| `@spine-benchmark/cli` | yes | - | Command-line analyzer |
| `@spine-benchmark/pixi-crawler` | yes | - | Embeddable PixiJS profiler |
| `@spine-benchmark/spinefolio` | yes | - | Spine widget for portfolios |
| `@spine-benchmark/gpu-timing` | no (private) | - | WebGL2 timer + coverage (internal) |
| `@spine-benchmark/metrics-sampling` | no (private) | - | Timeline sampling (internal) |
| `@spine-benchmark/calibration-primitives` | no (private) | - | Procedural calibration spines (tooling) |

The public API of the project is the set of published npm packages. The apps
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
