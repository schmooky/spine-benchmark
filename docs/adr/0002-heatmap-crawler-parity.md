# 0002. Heatmap and crawler must produce identical scores

Date: 2026-04-11

## Status

Accepted

## Context

Spine Benchmark has two ways of looking at a skeleton:

- **Offline heatmap.** The hosted benchmark uploads a skeleton,
  samples every animation timeline at 30 Hz, and builds a
  per-frame impact chart.
- **Live crawler.** `@spine-benchmark/pixi-crawler` attaches to a
  running PixiJS `Application` and reports the impact of whatever
  is on screen right now.

Users move between the two views constantly: they run the
benchmark on a skeleton offline, decide the numbers are
acceptable, ship to their game, attach the crawler, and expect to
see the same numbers. When the two diverge, trust in the whole
tool collapses - it is not obvious which one is wrong.

The two paths share scoring math via
[ADR 0001](./0001-single-source-of-truth-for-impact-math.md), so
the formulas themselves cannot drift. What *can* still drift is
the inputs to the formulas: "how many meshes are visible right
now?" depends on a visibility heuristic that each path computes
separately from the actual runtime state.

An early version of the heatmap used `slot.data.visible`, a field
that does not exist on real `spine-core` slots - it was a typo
that happened to work on the mock we tested against. The crawler,
reading real `spine-pixi-v8` slots, saw something different. Same
skeleton, same formulas, different numbers.

## Decision

The two paths must produce **bit-identical RI and CI numbers** for
the same skeleton observed in the same state. This is enforced
three ways:

1. **Shared formulas** via ADR 0001.

2. **Shared visibility rule.** "Is this slot contributing?" is
   answered identically in both paths:
   ```
   visible = slot.color.a > 0 && slot.bone?.active !== false
   ```
   Constraint activation uses `constraint.active === true`
   (Spine toggles constraints via skin overrides, not via a
   separate visibility flag).

3. **A parity test.** The suite at
   `packages/pixi-crawler/src/core/__tests__/spine-analyzer.test.ts`
   runs a reference skeleton through both paths and asserts the
   RI/CI outputs match exactly. Any PR that breaks parity - even
   a "harmless refactor" - fails CI.

A PR that changes the visibility heuristic must change both paths
in the same commit and extend the parity test to cover whatever
case motivated the change.

## Consequences

- **Good:** Users can trust that the hosted benchmark and the
  live crawler report the same thing. This is the central
  product promise.
- **Good:** The parity test is a forcing function for clean
  refactors - code paths that look like they could safely
  diverge cannot.
- **Good:** Bugs in the visibility heuristic are caught by the
  parity test before they ship to consumers of the crawler.
- **Cost:** Any change to what "visible" means requires touching
  two files plus the test. This is slightly annoying and
  absolutely worth it.
- **Cost:** The parity test is only as good as its reference
  skeleton. If a new kind of visibility logic only affects
  skeletons outside the fixture, the parity test can go green
  while the two paths actually diverge in the wild. Mitigation:
  when a real divergence is reported, add the offending
  skeleton to the fixture set before fixing the bug.

## References

- `packages/pixi-crawler/src/core/spine-analyzer.ts:56` -
  `isSlotActive()` (crawler side).
- `apps/benchmark/src/hooks/useAnimationHeatmap.ts:28` -
  constraint activation logic (heatmap side).
- `packages/pixi-crawler/src/core/__tests__/spine-analyzer.test.ts` -
  parity test.
- ADR [0001](./0001-single-source-of-truth-for-impact-math.md) -
  shared formulas, the prerequisite for parity.
