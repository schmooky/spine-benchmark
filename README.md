<p align="center">
  <img src="./logo.svg" alt="Spine Benchmark logo" width="180" />
</p>

# Spine Benchmark

<p align="center">
  <a href="https://github.com/schmooky/spine-benchmark/actions/workflows/ci.yml"><img src="https://github.com/schmooky/spine-benchmark/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://github.com/schmooky/spine-benchmark/actions/workflows/release.yml"><img src="https://github.com/schmooky/spine-benchmark/actions/workflows/release.yml/badge.svg" alt="Release" /></a>
  <a href="https://github.com/schmooky/spine-benchmark/actions/workflows/codeql.yml"><img src="https://github.com/schmooky/spine-benchmark/actions/workflows/codeql.yml/badge.svg" alt="CodeQL" /></a>
  <a href="https://codecov.io/gh/schmooky/spine-benchmark"><img src="https://codecov.io/gh/schmooky/spine-benchmark/branch/main/graph/badge.svg" alt="Codecov" /></a>
  <a href="https://securityscorecards.dev/viewer/?uri=github.com/schmooky/spine-benchmark"><img src="https://api.securityscorecards.dev/projects/github.com/schmooky/spine-benchmark/badge" alt="OpenSSF Scorecard" /></a>
  <br />
  <a href="https://www.npmjs.com/package/@spine-benchmark/spinefolio"><img src="https://img.shields.io/npm/v/@spine-benchmark/spinefolio?label=spinefolio" alt="spinefolio version" /></a>
  <a href="https://www.npmjs.com/package/@spine-benchmark/spinefolio"><img src="https://img.shields.io/npm/dm/@spine-benchmark/spinefolio?label=downloads" alt="spinefolio downloads" /></a>
  <a href="https://bundlephobia.com/package/@spine-benchmark/spinefolio"><img src="https://img.shields.io/bundlephobia/minzip/@spine-benchmark/spinefolio?label=minzip" alt="spinefolio bundle size" /></a>
  <a href="https://www.npmjs.com/package/@spine-benchmark/pixi-crawler"><img src="https://img.shields.io/npm/v/@spine-benchmark/pixi-crawler?label=pixi-crawler" alt="pixi-crawler version" /></a>
  <a href="https://www.npmjs.com/package/@spine-benchmark/pixi-crawler"><img src="https://img.shields.io/npm/dm/@spine-benchmark/pixi-crawler?label=downloads" alt="pixi-crawler downloads" /></a>
  <a href="https://bundlephobia.com/package/@spine-benchmark/pixi-crawler"><img src="https://img.shields.io/bundlephobia/minzip/@spine-benchmark/pixi-crawler?label=minzip" alt="pixi-crawler bundle size" /></a>
  <br />
  <a href="https://github.com/schmooky/spine-benchmark/blob/main/LICENSE"><img src="https://img.shields.io/github/license/schmooky/spine-benchmark" alt="License" /></a>
  <a href="#contributors"><img src="https://img.shields.io/github/all-contributors/schmooky/spine-benchmark?color=ee8449" alt="All Contributors" /></a>
  <a href="https://t.me/spine_benchmark"><img src="https://img.shields.io/badge/updates-telegram-229ED9?logo=telegram&logoColor=white" alt="Telegram updates" /></a>
</p>

Spine Benchmark is a monorepo for analyzing and optimizing Spine 4.2 animations.
It includes a browser workbench, reusable metrics packages, and runtime tooling.

- Production: https://spine.schmooky.dev/
- Repository: https://github.com/schmooky/spine-benchmark
- Updates: [https://t.me/spine_benchmark](https://t.me/+nwFiDd407Pk4Njdi)

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

The project measures Spine cost as fitted **milliseconds per GPU family**, not
unitless RI/CI scores. The package set is deliberately small - the old RI/CI
analyzer stack and the `workbench-core` tool engine were removed once nothing
consumed them (see [ADR 0004](docs/adr/0004-drop-ri-ci-package-stack.md)).

| Path | Purpose | npm |
|---|---|---|
| `apps/benchmark` | Benchmark UI/workbench (the site) | private |
| `packages/metrics-impact-formula` | Canonical scoring formulas + pose-feature walker + coverage estimator (single source of truth) | **public** |
| `packages/metrics-model` | Ridge fit of feature-vector to milliseconds | **public** |
| `packages/metrics-analyzers` | Device cost-model toolkit: `deviceFit` (per-family fit) + `deviceClass` (portable-family classifier) | **public** |
| `packages/cli` | Headless skeleton analyzer | **public** |
| `packages/pixi-crawler` | Real-time PixiJS scene-graph profiler (embeddable) | **public** |
| `packages/spinefolio` | PixiJS v8 Spine widget library | **public** |
| `packages/gpu-timing` | WebGL2 timer-query + coverage sampling (internal) | private |
| `packages/metrics-sampling` | Animation timeline sampling (internal) | private |

## Build Specific Workspaces

```bash
npm run build:metrics-impact-formula
npm run build:metrics-analyzers
npm run build:spinefolio
```

## Reusing Packages

Use workspace packages directly from this monorepo, or vendor/submodule the repo into your project and import the packages you need.

Example:

```ts
import { poseImpact } from '@spine-benchmark/metrics-impact-formula';

const { ri, ci, features } = poseImpact(spine.skeleton);
console.log(features.vertices, ri, ci);
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

## Docs

- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) - how the pieces fit together end to end.
- [`docs/adr/`](./docs/adr/) - architecture decision records (the "why").
- [`AGENTS.md`](./AGENTS.md) - house style and load-bearing constraints.
- [`CONTRIBUTING.md`](./CONTRIBUTING.md) - contribution workflow.
- [`SUPPORT.md`](./SUPPORT.md) - where to ask questions, file bugs, etc.
- [`SECURITY.md`](./SECURITY.md) - private vulnerability disclosure.

## Contributing

1. Create a branch from `main`.
2. Make focused changes.
3. Run `npm run test` (the formula-duplication and fancy-Unicode lint guards run as part of this).
4. If your change ships user-visible behavior, run `npx changeset` and commit the resulting `.md` file.
5. Open a PR with a short summary.
6. See `AGENTS.md` for the full house style and the load-bearing constraints (heatmap/crawler scoring parity, single source of truth for impact math, ASCII-only punctuation).

## Contributors

Thanks go to these wonderful people ([emoji key](https://allcontributors.org/docs/en/emoji-key)):

<!-- ALL-CONTRIBUTORS-LIST:START - Do not remove or modify this section -->
<!-- prettier-ignore-start -->
<!-- markdownlint-disable -->
<!-- markdownlint-restore -->
<!-- prettier-ignore-end -->
<!-- ALL-CONTRIBUTORS-LIST:END -->

This project follows the [all-contributors](https://allcontributors.org)
specification. Contributions of any kind welcome - see
[`CONTRIBUTING.md`](./CONTRIBUTING.md#crediting-contributors) for how
to get your name on the list.

## License

MIT. See `LICENSE` in the relevant package.
Third-party runtime licenses apply (PixiJS, Spine runtime).
