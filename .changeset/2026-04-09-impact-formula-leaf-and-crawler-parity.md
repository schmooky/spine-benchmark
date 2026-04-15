---
"@spine-benchmark/metrics-impact-formula": patch
"@spine-benchmark/metrics-reporting": patch
"@spine-benchmark/metrics-scoring": patch
"@spine-benchmark/pixi-crawler": minor
---

Introduces `@spine-benchmark/metrics-impact-formula`, a zero-dependency leaf package that owns the canonical Rendering Impact (RI) and Computational Impact (CI) formulas, the impact level union, and the bracket boundaries. Every scorer in the workspace now routes through it, eliminating six independent copies of the math.

Fixes three real parity bugs in `@spine-benchmark/pixi-crawler` that were silently desyncing the live runtime crawler from the offline benchmark and the in-app heatmap:

- The analyzer was reading `slot.data.visible`, which does not exist on the real `spine-core` `SlotData` shape. The read returned `undefined`, making every slot effectively invisible against live Spine instances and zeroing out RI / CI in production. Replaced with a canonical `isSlotActive` predicate that checks `slot.color.a` and `slot.bone.active`, matching the heatmap.
- The analyzer was feeding `blendModeTransitions` (a draw-call counting metric) into the RI formula in place of `activeNonNormalBlends` (an impact metric). The two count different things on identical input. Now tracks them independently and feeds the right one into RI.
- `analyzeConstraints` was counting `skeleton.ikConstraints.length` and friends unconditionally, ignoring `constraint.active`. Spine flips this on/off via skin overrides; the heatmap filters by it. Now filters by `.active` too.

The crawler also unifies its `ImpactLevel` literal on `'very-high'` (kebab-case, matching the CSS class names `impact-very-high` / `badge-very-high` / `v-very-high` and reading naturally as a multi-word identifier alongside the single-word `minimal` / `low` / `moderate` / `high` values). Any previous camelCase `'veryHigh'` form is removed. **This is a breaking change for any consumer that compared the level by string;** that is why the crawler bumps to `0.2.0`.

Fixes a related score-coloring bug in `pixi-crawler`'s overlay: `_getBudgetColor` was using hand-rolled thresholds (25/50/75/100) that did not match any other scorer in the workspace, so a score that was already `'high'` would render green in the overlay. Routed through `classifyImpactLevel` for consistency.
