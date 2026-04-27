---
"@spine-benchmark/metrics-impact-formula": minor
"@spine-benchmark/metrics-analyzers": minor
"@spine-benchmark/pixi-crawler": minor
"@spine-benchmark/metrics-scoring": patch
"@spine-benchmark/metrics-reporting": patch
"@spine-benchmark/cli": patch
---

Add: `@spine-benchmark/metrics-impact-formula` gains an enhanced, mix-aware Computational Impact path. `computationalImpactCost` accepts three new optional inputs that are backwards-compatible with the existing per-constraint-count and average-vertex-density signature:

- `constraintBones: { ik, path, transform }` - mix-scaled effective bone counts. When present, constraint cost uses per-bone weights (`ik x 0.175`, `path x 0.275`, `transform x 0.10`) calibrated so a 2-bone-per-chain skeleton with `mix=1` reproduces the basic path's per-constraint weights. Long chains and partial mixes now scale linearly instead of being charged a flat per-constraint cost.
- `meshDetails: Array<{ vertices, weighted, deformed, boneInfluences }>` - per-mesh capped cost replaces the average-based mesh cost. Weighted-mesh weight scales by `boneInfluences / 2`, so a vertex skinned to 2 bones reproduces the old fixed weight, while heavier or lighter skinning scales above or below it.
- `mixingDepth: number` - total mixing entries across all animation tracks (walks each track's `mixingFrom` chain). Adds `mixingDepth x 0.15` to CI to account for crossfade and layered mixing cost.

`DEFAULT_IMPACT_BRACKETS` keep their meaning: a "standard" skeleton (2-bone chains, 2-influence skinning, `mix=1`, no crossfade) lands on the same bracket boundaries as before. Costs only diverge from the basic path when inputs deviate from this baseline.

Add: `metrics-impact-formula` exports the canonical input extractors so every scoring path resolves bone influences, mix scaling, mixing depth, and active-constraint predicates the same way: `isConstraintActive`, `isPhysicsConstraintContributing`, `ikMixScale`, `pathMixScale`, `transformMixScale`, `avgBoneInfluencesForMesh`, `countMixingDepth`. Duck-typed helper interfaces (`ConstraintActiveLike`, `IkConstraintLike`, `TransformConstraintLike`, etc.) are exported alongside. Duplicating any of this in a consumer is a parity bug - the formula is shared but the inputs would diverge.

Add: `@spine-benchmark/metrics-analyzers` exports a new `MeshDetailEntry` type and surfaces `meshMetrics.meshDetails` on `MeshMetrics` and `constraintMetrics.constraintBones` on `ConstraintMetrics`, computed via the canonical helpers from `metrics-impact-formula`.

Add: `@spine-benchmark/pixi-crawler` extends `ComputationalImpact` with `pathBones`, `ikBones`, `transformBones`, `boneCount`, `mixingDepth`, `activeMeshes`, and `avgBoneInfluences` so the live analysis result exposes the same enhanced inputs that flow into the formula. Internals now route through the canonical helpers from `metrics-impact-formula` (no more local `isConstraintActive` / `countActive`).

Fix: `@spine-benchmark/metrics-scoring` and `@spine-benchmark/metrics-reporting` now forward `constraintBones` and `meshDetails` into `computationalImpactCost`, so the offline scoring path matches the live crawler and in-app heatmap on skeletons with non-baseline mix values, long bone chains, or non-uniform skinning density.

Fix: `@spine-benchmark/cli` now picks the per-frame peak CI by evaluating `computationalImpactCost` on each sampled frame's enhanced inputs instead of recomputing once at the end against averaged peak counts. The previous approach averaged across constraints and meshes that never coexisted on the same frame, undercounting peak cost. CLI also drops its private `isConstraintActive` and routes constraint and mesh extraction through the canonical helpers so it cannot drift from the rest of the workspace.
