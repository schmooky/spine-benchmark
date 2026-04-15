# @spine-benchmark/metrics-impact-formula

## 0.1.1

### Patch Changes

- [`21f0646`](https://github.com/schmooky/spine-benchmark/commit/21f064654363ad3e5ae3492bb6ad096f93fd428a) Thanks [@schmooky](https://github.com/schmooky)! - Switch internal workspace dependencies from `file:..` paths to semver ranges. No runtime change for consumers; required so that the new changesets-driven release pipeline can cascade dependency bumps automatically (a release of `@spine-benchmark/metrics-impact-formula` now forces a matching patch release of every package that depends on it, so the npm registry never has a published `pixi-crawler` referencing a stale leaf package).

- [`21f0646`](https://github.com/schmooky/spine-benchmark/commit/21f064654363ad3e5ae3492bb6ad096f93fd428a) Thanks [@schmooky](https://github.com/schmooky)! - Introduces `@spine-benchmark/metrics-impact-formula`, a zero-dependency leaf package that owns the canonical Rendering Impact (RI) and Computational Impact (CI) formulas, the impact level union, and the bracket boundaries. Every scorer in the workspace now routes through it, eliminating six independent copies of the math.

  Fixes three real parity bugs in `@spine-benchmark/pixi-crawler` that were silently desyncing the live runtime crawler from the offline benchmark and the in-app heatmap:

  - The analyzer was reading `slot.data.visible`, which does not exist on the real `spine-core` `SlotData` shape. The read returned `undefined`, making every slot effectively invisible against live Spine instances and zeroing out RI / CI in production. Replaced with a canonical `isSlotActive` predicate that checks `slot.color.a` and `slot.bone.active`, matching the heatmap.
  - The analyzer was feeding `blendModeTransitions` (a draw-call counting metric) into the RI formula in place of `activeNonNormalBlends` (an impact metric). The two count different things on identical input. Now tracks them independently and feeds the right one into RI.
  - `analyzeConstraints` was counting `skeleton.ikConstraints.length` and friends unconditionally, ignoring `constraint.active`. Spine flips this on/off via skin overrides; the heatmap filters by it. Now filters by `.active` too.

  The crawler also unifies its `ImpactLevel` literal on `'very-high'` (kebab-case, matching the CSS class names `impact-very-high` / `badge-very-high` / `v-very-high` and reading naturally as a multi-word identifier alongside the single-word `minimal` / `low` / `moderate` / `high` values). Any previous camelCase `'veryHigh'` form is removed. **This is a breaking change for any consumer that compared the level by string;** that is why the crawler bumps to `0.2.0`.

  Fixes a related score-coloring bug in `pixi-crawler`'s overlay: `_getBudgetColor` was using hand-rolled thresholds (25/50/75/100) that did not match any other scorer in the workspace, so a score that was already `'high'` would render green in the overlay. Routed through `classifyImpactLevel` for consistency.

- [`aa36b8f`](https://github.com/schmooky/spine-benchmark/commit/aa36b8fb827875c7240934c997ff14adabac7729) Thanks [@schmooky](https://github.com/schmooky)! - Drop `src/` from the `files` array on `@spine-benchmark/pixi-crawler` and `@spine-benchmark/metrics-impact-formula`. Only `dist/` ships to npm from now on.

  The previous tarball included the TypeScript sources alongside the compiled output, which served no purpose for consumers - the compiled `dist/` already contains everything needed at runtime and declaration files for type-checking. Shipping `src/` made tarballs larger than they needed to be and invited consumers to import deep source paths that are not part of the public API.

  Also removed the dead `"development": "./src/..."` entries from `@spine-benchmark/pixi-crawler`'s `exports` map. Those were pointing at source files that now no longer exist in the published tarball, and no resolver in the monorepo was requesting the `"development"` condition anyway. The monorepo's Vitest and Vite configs use plain workspace resolution via aliases, not export conditions.

  No runtime or API change. Published tarballs get a little smaller. Public entry points (`.`, `./core`, `./ui` on pixi-crawler) remain unchanged.
