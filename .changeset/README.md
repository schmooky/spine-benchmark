# Changesets

This folder is the source of truth for releases of every publishable package in `spine-benchmark`. Changesets reads `.md` files in this directory, decides per-package version bumps, generates per-package CHANGELOGs, and publishes to npm.

## Quick reference

| Action | Command |
|--------|---------|
| Add a new changeset (run this in your PR) | `npx changeset` |
| See what would be released | `npx changeset status` |
| Apply pending changesets locally (CI does this in the version PR) | `npm run version-packages` |
| Publish (CI does this on merge of the version PR) | `npm run release` |

## How to write a good changeset

1. Run `npx changeset` from the repo root.
2. Pick the packages your change affects with `<space>`, then `<enter>`. If the change is purely internal scaffolding (build tooling, lint config) and ships no new behavior to consumers, skip the changeset entirely.
3. Pick the bump for each package:
   - **patch** for bug fixes, internal refactors, and dependency bumps with no API change.
   - **minor** for additive changes that don't break existing consumers.
   - **major** for breaking API changes (`pre-1.0` packages still use major for breaking changes; pre-`1.0.0` releases are not exempt).
4. Write a short summary aimed at a downstream consumer reading the changelog. Lead with the verb. Examples:
   - `Fix: pixi-crawler.analyzeSpine no longer counts inactive constraints, matching the offline benchmark.`
   - `Add: metrics-impact-formula now exports impactFromCost(cost, brackets) for custom thresholds.`
5. Commit the generated `.changeset/<name>.md` file as part of your PR.

## The dep-graph cascade

When the changesets release runs and bumps `@spine-benchmark/metrics-impact-formula`, every workspace package that depends on it gets a **patch bump too**, so the npm registry never has a published `pixi-crawler` referencing an old `metrics-impact-formula`. This is governed by `updateInternalDependencies: "patch"` in `config.json`.

You don't need to add changeset entries for the cascaded patches yourself - changesets adds them automatically. You only write changesets for packages you intentionally touched.

## Apps are ignored

`@spine-benchmark/site` (the public site) and `@spine-benchmark/crawler-demo` are listed under `ignore` in `config.json`. They are deployed, not published to npm. Don't write changesets for them.

## See also

- `AGENTS.md` at the repo root for the full contributor flow and house style rules.
- `.github/workflows/release.yml` for the CI pipeline that runs `changesets/action@v1` on push to `main`.
