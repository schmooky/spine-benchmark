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
| `packages/metrics-impact-formula` | Canonical RI / CI scoring formulas (single source of truth) |
| `packages/pixi-crawler` | Real-time PixiJS scene-graph profiler (published) |
| `packages/spinefolio` | PixiJS v8 Spine widget library (published) |

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

## Releases

Every package under `packages/` is published to npm by [changesets](https://github.com/changesets/changesets) on every merge to `main`. The flow:

1. **Authoring a change.** When you open a PR that ships user-visible changes, run `npx changeset` from the repo root and pick the affected packages plus the bump kind (`patch` / `minor` / `major`). Commit the generated `.changeset/*.md` file in your PR.
2. **Version PR.** When your PR merges, the release workflow opens (or updates) a "chore: version packages" PR that applies the bumps, regenerates each affected package's `CHANGELOG.md`, and removes the consumed `.changeset` files.
3. **Publish.** When the version PR is merged, the workflow runs `npm run release` which builds every publishable package in topological order and publishes the bumped ones to npm.

### Dependency-graph cascade

Bumping a producer package cascades to its consumers. For example, a release of `@spine-benchmark/metrics-impact-formula` automatically forces a patch bump of `@spine-benchmark/pixi-crawler` (and every other workspace package that depends on it). This means a published `pixi-crawler@x.y.z` always references the matching `metrics-impact-formula` version - the npm registry never has a mismatched pair.

The cascade is governed by `updateInternalDependencies: "patch"` in `.changeset/config.json`.

### Per-package changelogs

After the first release, each package gets its own `CHANGELOG.md` (e.g. `packages/pixi-crawler/CHANGELOG.md`) maintained by changesets. Treat those as the canonical "what shipped when" for each library.

### Apps are not published

`@spine-benchmark/site` (the public benchmark site) and `@spine-benchmark/crawler-demo` are deployed, not published to npm, so they are listed in `.changeset/config.json:ignore` and never receive version bumps.

### Nightly snapshot releases from version branches

Long-lived release branches (`v*`) publish throwaway preview releases to npm so reviewers can install work-in-progress packages without waiting for a merge to `main` or disturbing the `latest` dist-tag. This is driven by `.github/workflows/snapshot.yml` + `scripts/snapshot-release.mjs`.

**When snapshots publish.** The workflow runs in three situations:

- On every push to a `v*` branch, so each commit replaces the previous preview for that branch.
- On a `0 3 * * *` cron, so long-lived branches stay fresh even with no new pushes.
- On-demand via `Actions -> Snapshot Release -> Run workflow`, with an optional branch input so you can preview any branch by hand.

**What gets published.** Only packages with a pending `.changeset/*.md` file on the branch. Version strings look like `2.3.0-v3-2-20260411143022` (`<base>-<sanitized-tag>-<timestamp>`) and never overwrite an existing version. No git commit, no tag, no writeback to the branch - the version bump only lives on the runner.

**Dist-tag naming.** The dist-tag is derived from the branch name with everything outside `[a-z0-9-]` collapsed to a hyphen, so `v3.2` -> `v3-2`, `release/hotfix` -> `release-hotfix`. Publishes from `main` are refused by the script; use the regular release workflow instead.

**How reviewers install a snapshot.**

```bash
# Latest snapshot for branch v3.2
npm i @spine-benchmark/spinefolio@v3-2

# Or pin a specific timestamped version for reproducibility
npm i @spine-benchmark/spinefolio@2.3.0-v3-2-20260411143022
```

**Producing a snapshot locally.** For debugging the flow without publishing (for example, to see what versions the script would produce), the same script runs from the repo root:

```bash
SNAPSHOT_TAG=v3-2 GITHUB_TOKEN=<gh-pat> npm run snapshot
```

The `GITHUB_TOKEN` is only needed because `@changesets/changelog-github` queries the GitHub API to attribute changelog entries; any classic PAT with `read:user` and `repo:status` scopes works. The runner on CI gets it for free. The script refuses to run against `main` and no-ops cleanly when there are no pending changesets, so you can't accidentally publish from the wrong branch.

## Contributing

1. Create a branch from `main`.
2. Make focused changes.
3. Run `npm run test` (the formula-duplication and fancy-Unicode lint guards run as part of this).
4. If your change ships user-visible behavior, run `npx changeset` and commit the resulting `.md` file.
5. Open a PR with a short summary.
6. See `AGENTS.md` for the full house style and the load-bearing constraints (heatmap/crawler scoring parity, single source of truth for impact math, ASCII-only punctuation).

## License

MIT. See `LICENSE` in the relevant package.
Third-party runtime licenses apply (PixiJS, Spine runtime).
