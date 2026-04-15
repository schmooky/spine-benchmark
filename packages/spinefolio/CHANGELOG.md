# @spine-benchmark/spinefolio

## 3.0.0

### Major Changes

- [`aa36b8f`](https://github.com/schmooky/spine-benchmark/commit/aa36b8fb827875c7240934c997ff14adabac7729) Thanks [@schmooky](https://github.com/schmooky)! - Move `pixi.js` and `@esotericsoftware/spine-pixi-v8` from `dependencies` to `peerDependencies` (with `peerDependenciesMeta.optional: true`). Both are also listed in `devDependencies` so local builds still work inside the monorepo.

  **Why this is a breaking change.** Consumers who installed `@spine-benchmark/spinefolio` previously received `pixi.js` and `@esotericsoftware/spine-pixi-v8` as transitive dependencies for free. Code that imported from those packages via the spinefolio install (rather than declaring them as direct dependencies) will stop resolving on upgrade. Add them to your own `package.json` if you were relying on the transitive install.

  **Why this is worth it.** Consumers who already depended on PixiJS were getting a duplicate install in `node_modules`, which not only wastes disk space but also risks two distinct `PIXI.Application` classes existing at runtime - meaning `instanceof` checks between your `new PIXI.Application()` and the one inside spinefolio would fail. The peer-dependency declaration tells npm to share one installation.

  **What did not change.** The published `dist/spinefolio.module.js` is still a fully self-contained bundle with PixiJS and spine-pixi-v8 inlined. Drop-in `<script>` usage and server-side `import('/assets/spinefolio.js')` (used by `apps/reports-api` for encrypted report viewers) continue to work without the consumer providing anything. A dedicated externalised build variant that shares the consumer's PixiJS at runtime is tracked as future work in the README.

### Patch Changes

- [`21f0646`](https://github.com/schmooky/spine-benchmark/commit/21f064654363ad3e5ae3492bb6ad096f93fd428a) Thanks [@schmooky](https://github.com/schmooky)! - Switch internal workspace dependencies from `file:..` paths to semver ranges. No runtime change for consumers; required so that the new changesets-driven release pipeline can cascade dependency bumps automatically (a release of `@spine-benchmark/metrics-impact-formula` now forces a matching patch release of every package that depends on it, so the npm registry never has a published `pixi-crawler` referencing a stale leaf package).
