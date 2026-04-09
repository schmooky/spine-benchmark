# AGENTS.md

Operating manual for AI coding agents working in `spine-benchmark`. Read this before opening files. The rules below are not stylistic preferences - they are load-bearing constraints that protect properties the project relies on.

## What this repo is

A Spine animation profiling toolkit. Two views of the same data:

1. **Offline benchmark** (`apps/benchmark`) - parses a `.skel`/`.json` + atlas, computes per-animation impact scores from the static data, renders the result as the public site. The numbers it shows are the canonical "this is how expensive this skeleton is" verdict.
2. **Live crawler** (`packages/pixi-crawler`, demo in `apps/crawler`) - attaches to a running PixiJS `Application`, walks the live scene graph each frame, and computes the same scores against whatever the GPU is actually drawing right now.

The crawler also analyzes non-Spine objects (sprites, masks, filters, blend breaks, draw call counts) - it is the eye in the scene graph, the spider in the web. Its job is to look at any PixiJS scene and answer "what is going wrong here, and what would the offline benchmark say if it could see it?".

## Core values (do not violate)

### 1. Single source of truth for scoring math

Every impact score in this repo - per-frame heatmap, offline animation score, runtime crawler budget, summary tab, mesh tab, physics tab - flows through one file:

```
packages/metrics-impact-formula/src/index.ts
```

That package exports `renderingImpactCost`, `computationalImpactCost`, `impactFromCost`, `classifyImpactLevel`, `DEFAULT_IMPACT_BRACKETS`, and the `ImpactLevel` union. It has zero dependencies so even the crawler (which is published to npm and must stay tiny) can pull it in.

**Never inline the weights.** If you find yourself writing `* 0.7` next to `* 0.55` next to `* 0.35`, or `Math.min(0.5, x / 500)`, or `/ 200` for a vertex divisor, you are reimplementing the formula. Stop and import it instead.

There is a CI guard at `scripts/check-no-duplicate-impact-formulas.mjs` that fails the build if the canonical numbers appear outside the leaf package. The guard runs as part of `npm test`. Do NOT add files to its allowlist to make it shut up - fix the duplication.

### 2. Heatmap / crawler / offline benchmark must be 1:1

If the same skeleton is observed by the offline benchmark, the in-app heatmap, and the live crawler at the same instant, all three must produce the same RI/CI numbers. Identical formulas alone are not enough - the *inputs* to the formulas must also match:

- **Visibility** is `slot.color.a > 0 && (slot.bone?.active !== false)`. The crawler used to read `slot.data.visible`, which does not exist on the real `spine-core` `SlotData` shape; that read returned `undefined` and silently zeroed every score in production. If you need to test slot visibility, use the `isSlotActive` predicate in `spine-analyzer.ts` (or the equivalent inline check in `useAnimationHeatmap.ts`).
- **Constraints** must be filtered by `constraint.active`. Spine flips this on/off via skin overrides and constraint controllers. The crawler used to count `skeleton.ikConstraints.length` unconditionally and overshoot CI on skeletons with deactivated constraints.
- **Blend mode RI input** is the count of currently visible slots whose blend mode is non-normal. It is NOT the count of blend mode transitions. Transitions are used separately for draw-call estimation; do not feed them into `renderingImpactCost`.

The crawler test suite includes an explicit parity check that asserts these inputs match. If you change the analyzer, run that test and add a new one if you discover another parity gap.

### 3. The crawler is a published package

`@spine-benchmark/pixi-crawler` ships to npm. That means:

- Public types are part of the API. Renaming, removing, or changing the union of `ImpactLevel`, `CrawlerConfig`, `SpineAnalysis`, etc. is a breaking change. Bump the major (or 0.x minor) accordingly.
- Dependencies on workspace packages must be on **published** versions, not `file:..` paths, otherwise `npm publish` will rewrite the path and break the consumer install. The leaf package `@spine-benchmark/metrics-impact-formula` is also published for this reason.
- Any new runtime dependency added to the crawler is paid for by every consumer. Prefer duck typing over importing optional runtimes (the analyzer never imports `@esotericsoftware/spine-core` directly; it uses a `SpineLike` interface).

### 4. House style: ASCII only for arrows and dashes

This repo forbids "fancy" Unicode punctuation in source, docs, locales, and CI files:

| Forbidden | Use instead |
|-----------|-------------|
| em-dash `U+2014` | `-` (or `--` between code sections) |
| en-dash `U+2013` | `-` |
| right arrow `U+2192` | `->` |
| left arrow `U+2190` | `<-` |
| double arrow `U+21D2` | `=>` |
| any other Unicode arrow | the closest ASCII equivalent |

Reason: AI agents (this one included) drift toward em-dashes and arrows by default, which makes diffs noisy, breaks grep, and signals "AI slop" to readers. Keeping the rule mechanical lets the linter catch slip-ups instead of relying on reviewer attention.

The check lives at `scripts/check-no-fancy-unicode.mjs` and runs as part of `npm test`. If you must reference one of these characters in documentation about itself, the only allowlisted file is `AGENTS.md` (this file).

### 5. Commit attribution

Commits made by AI agents on behalf of the maintainer must be attributed to the maintainer, not to the agent. Use:

```
git -c user.name="Dmitry Vasiliev" -c user.email="dvasiliev97@yandex.ru" commit ...
```

Do NOT add `Co-Authored-By: Claude` (or similar) trailers. The community has explicit reasons not to want AI co-author lines in this repo's history.

## Repo layout

```
apps/
  benchmark/        # the public site (React + Vite)
  crawler/          # demo app for the runtime crawler
packages/
  metrics-impact-formula/   # CANONICAL scoring math (zero deps)
  metrics/                  # umbrella re-exports
  metrics-factors/          # raw measurement primitives
  metrics-analyzers/        # per-feature analyzers (mesh, physics, etc.)
  metrics-sampling/         # animation timeline sampling
  metrics-pipeline/         # AnimationAnalysis builder
  metrics-reporting/        # offline ImpactReportModel + adapters
  metrics-scoring/          # public scorer + color palette
  asset-store/              # parses .skel/.atlas/.png triples
  spine-loader/             # loader plumbing
  mesh-tools/               # mesh-density factor
  constraint-tools/         # constraint factor
  drawcall-tools/           # draw call inspector
  render-tools/             # render utilities
  file-tools/               # file IO
  workbench-core/           # shared workbench plumbing
  pixi-crawler/             # PUBLISHED runtime profiler library
  spinefolio/               # PUBLISHED spine widget for portfolios
scripts/
  check-no-duplicate-impact-formulas.mjs   # formula duplication guard
  check-no-fancy-unicode.mjs                # punctuation guard
```

## Workflow

- `npm install` from the repo root - npm workspaces handles symlinks.
- `npm run dev` runs the public site. Its `predev` builds every dependency in topological order; if you add a new metrics package the script needs an entry.
- `npm test` runs the linter checks (formula guard + unicode guard) then the vitest suites for every package that has tests.
- `npm run build` runs the equivalent prebuild then the vite build.
- The crawler demo runs separately: `npm run dev:crawler`.

Vitest configuration lives in the root `vitest.config.ts`. Adding a new test file? Make sure its package directory is included in the `test.include` glob and that any cross-package import alias is registered in `resolve.alias` (vitest does not consume tsconfig paths automatically).

## Things that look wrong but are intentional

- The crawler uses duck-typed `SpineLike` interfaces instead of importing `@esotericsoftware/spine-core`. This is so consumers can use the crawler without paying for the spine runtime if they only need pixi-side analysis.
- `pixi-crawler/src/core/types.ts` re-exports `classifyImpactLevel` and `DEFAULT_IMPACT_BRACKETS` from the leaf package. That re-export exists so existing crawler consumers (`import { classifyImpactLevel } from '@spine-benchmark/pixi-crawler'`) keep working. Do not delete the re-exports without bumping the crawler major.
- `metrics-reporting/impactReportModel.ts` exports `renderingImpactCost(animation)` and `computationalImpactCost(animation)` even though the canonical functions live in the leaf package. These are *adapters* that pull the right fields out of the offline `AnimationAnalysis` shape and feed them into the shared formula. Do not delete them - removing them would break the offline reporter and the test suite.

## Things to do before you commit

1. Run `npm test` from the repo root. Both linter checks and every vitest suite must pass.
2. If you touched a published package (`@spine-benchmark/pixi-crawler` or `@spine-benchmark/spinefolio` or `@spine-benchmark/metrics-impact-formula`), bump its `version` according to the change you made.
3. Use the maintainer's name + email for the commit (see "Commit attribution" above).
4. Write the commit subject in conventional-commit form (`fix: ...`, `feat: ...`, `chore: ...`, `docs: ...`). semantic-release reads this to decide version bumps.

## Things to never do

- Never copy the RI / CI weights into a new file. Always import from the leaf package.
- Never replace `slot.color.a > 0 && slot.bone?.active !== false` with anything looser - you will silently desync the crawler from the heatmap.
- Never add a `Co-Authored-By: Claude` (or any other AI) trailer to a commit in this repo.
- Never use Unicode em-dashes or arrows in any tracked file except this one.
- Never bypass `npm test` with `--no-verify` on a commit. If a hook fails, fix the underlying issue.
- Never publish a workspace package with `file:..` deps. Use semver ranges so the npm registry copy resolves correctly.
