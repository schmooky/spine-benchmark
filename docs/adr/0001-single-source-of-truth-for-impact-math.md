# 0001. Single source of truth for impact math

Date: 2026-04-11

## Status

Accepted

## Context

Spine Benchmark produces two numbers for every animation:
Rendering Impact (RI) and Computational Impact (CI). These numbers
are read by three audiences who must never see different values
for the same skeleton:

1. The hosted benchmark UI, which shows them next to a heatmap.
2. The `@spine-benchmark/pixi-crawler` library, which consumers
   embed in their own PixiJS games to profile live scenes.
3. Server-rendered encrypted share links in `apps/reports-api`.

Early on, the mesh-clamp and constraint-weight formulas started
appearing in two places - once in the crawler and once in the UI -
because it was easier to copy the math than to extract a shared
package. The two copies drifted within days. A fix to the UI did
not reach the crawler, the crawler shipped to npm, and consumers
saw different numbers than the benchmark site for the same
skeleton. This was the bug that forced the rewrite.

Alternatives considered:

- **Shared utility file.** Rejected: a shared file inside either
  consumer means the other consumer has to depend on the full
  package. The crawler must stay small (it ships to game clients),
  so it cannot depend on the UI package.
- **A generated constants file.** Rejected: code generation hides
  the math and makes diffing hard.
- **A standalone leaf package with zero runtime deps.** Picked.

## Decision

All RI/CI formulas live exclusively in
`packages/metrics-impact-formula/src/index.ts`. The package has
zero runtime dependencies, ships to npm under
`@spine-benchmark/metrics-impact-formula`, and is imported by every
other workspace package that needs scoring math - including the
crawler, which otherwise imports nothing from the analyzer stack.

A lint guard at
`scripts/check-no-duplicate-impact-formulas.mjs` scans the whole
repo for the mesh-clamp pattern (`Math.min(0.5, ... / 500)`) and
the constraint-weight pattern (`* 0.7` then `* 0.55` then `* 0.35`
then `* 0.2`) and fails CI if either appears outside the leaf
package. The guard has a short allowlist: the leaf itself, the
guard script, and the tests that exist specifically to pin the
leaf's behaviour.

When `metrics-impact-formula` bumps, changesets cascades a patch
bump to every workspace package that depends on it
(`updateInternalDependencies: "patch"` in `.changeset/config.json`).
This guarantees that the published consumer on npm always
references the matching formula version.

## Consequences

- **Good:** The two scoring paths cannot drift. A test in the
  crawler suite feeds a skeleton to both paths and asserts the
  output matches. If someone violates the rule the lint guard
  fails before review.
- **Good:** The crawler ships with almost no dependencies, so
  embedding it in a game client is cheap.
- **Good:** Changelog readers always know which formula version a
  published package is using, because the cascading bump forces
  the reference to update.
- **Cost:** Touching the formulas is a publish event. Any change
  cascades patches to ~17 downstream packages. This is the right
  default - it makes math changes visible - but it means the
  impact-formula package should be treated as API-stable and
  bumped deliberately.
- **Cost:** The lint guard is a regex check, not a type check, so
  it can in principle be fooled by obfuscated code. In practice it
  catches every natural way of writing the formulas, and a
  reviewer would catch a deliberate bypass.

## References

- `packages/metrics-impact-formula/src/index.ts` - canonical math.
- `scripts/check-no-duplicate-impact-formulas.mjs` - the lint guard.
- `.changeset/config.json` - `updateInternalDependencies: "patch"`.
- ADR [0002](./0002-heatmap-crawler-parity.md) - the parity rule
  this decision exists to make tractable.

## Addendum (2026-07-03): extended to formula INPUTS

The 2026-07 measurement audit found the drift this ADR guards against had
reappeared one level up: the FORMULAS were shared, but the pose WALK that
produces their inputs was copied four times (workbench, bench-runner trainer,
offline sampler, CLI/watcher) and the copies drifted - three different
drawCallEst definitions, and two copies that silently dropped every
region/sequence vertex, so the fitted cost model was trained on features that
disagreed with the features it was applied to.

Feature extraction now lives exclusively in
`packages/metrics-impact-formula/src/poseFeatures.ts`
(`extractPoseFeatures` / `poseImpact`) with the geometric coverage/overdraw
estimator beside it (`coverageEstimate.ts`). The walker duck-types the
skeleton so the package keeps zero runtime dependencies. The lint guard now
also flags the `worldVerticesLength / 2` counting idiom outside the canonical
owner (`local-pose-walk` signature).
