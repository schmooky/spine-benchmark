---
"@spine-benchmark/metrics-impact-formula": minor
"@spine-benchmark/metrics-analyzers": minor
"@spine-benchmark/pixi-crawler": minor
"@spine-benchmark/metrics-scoring": patch
"@spine-benchmark/metrics-reporting": patch
"@spine-benchmark/cli": patch
---

Add: `@spine-benchmark/metrics-impact-formula` gains an enhanced Computational Impact path that models actual spine-ts CPU work. `computationalImpactCost` accepts four new optional inputs that are backwards-compatible with the existing per-constraint-count signature:

- `constraintBones: { ik, path, transform }` - total bones across *contributing* (active && mix > 0) constraints per type. Constraint cost uses per-bone weights (`ik x 0.175`, `path x 0.275`, `transform x 0.10`) calibrated so a 2-bone-per-chain skeleton with `mix=1` reproduces the basic path's per-constraint weights. The bone counts are NOT mix-scaled: spine-ts runs the full constraint solve at any non-zero `mix` (mix only controls the lerp factor when writing back into bones, which is marginal compared to the solve), so a 3-bone IK at `mix=0.5` costs the same CPU as the same chain at `mix=1`. Long chains now correctly scale by bone count instead of being charged a flat per-constraint cost.
- `meshDetails: Array<{ vertices, weighted, deformed, boneInfluences }>` - per-mesh capped cost replaces the average-based mesh cost. Weighted-mesh weight scales by `boneInfluences / 2`, so a vertex skinned to 2 bones reproduces the old fixed weight, while heavier or lighter skinning scales above or below it.
- `mixingDepth: number` - extra `AnimationState.apply` invocations beyond a single playing animation. Counts every active track entry plus its `mixingFrom` chain and subtracts 1 for the baseline. So a single track with no crossfade is `0`, a `A -> B` crossfade is `1` (head + 1 mixingFrom), two parallel tracks are `1` (multi-track playback now contributes - it was previously free), and a layered crossfade adds correspondingly more. Each extra application contributes `0.15` to CI.
- `physicsActiveAll: number` - active physics constraints regardless of `mix`. Spine-ts always runs the physics integration step (it must to keep the simulation continuous); only the bone write-back depends on `mix`. So physics cost is split 80% structural (`physicsActiveAll x 0.56`) plus 20% mix-dependent (`physicsContributing x 0.14`). When `physicsActiveAll` is omitted the formula falls back to the legacy `physics x 0.7` weight, preserving backwards compatibility for callers that only know about the contributing count.

`DEFAULT_IMPACT_BRACKETS` keep their meaning: a "standard" skeleton (2-bone chains, `mix=1`, 2-influence skinning, no crossfade, single track playing, no physics with `mix=0`) lands on the same bracket boundaries as before. The enhanced path matches the basic path exactly on this baseline and only diverges when inputs deviate from it.

Add: `metrics-impact-formula` exports the canonical input extractors so every scoring path resolves bone influences, mix scaling, mixing depth, and active-constraint predicates the same way: `isConstraintActive`, `isPhysicsConstraintContributing`, `ikMixScale`, `pathMixScale`, `transformMixScale`, `avgBoneInfluencesForMesh`, `countMixingDepth`. Duck-typed helper interfaces (`ConstraintActiveLike`, `IkConstraintLike`, `TransformConstraintLike`, `PathConstraintLike`, `PhysicsConstraintLike`) are exported alongside. Duplicating any of this in a consumer is a parity bug - the formula is shared but the inputs would diverge.

Add: `metrics-impact-formula` exports `activeConstraintStats(skeleton)` (with the matching `ConstraintStats` type), a single-pass walk that returns active constraint counts, contributing-bone totals, and `physicsActiveAll` together. `active.{ik,transform,path}` count only constraints that contribute to the pose (`isConstraintActive(c) && mixScale(c) > 0`), so a transform constraint with all six mix axes explicitly zero is not counted - matching spine-ts's early-exit behaviour. Use this everywhere CI inputs are gathered so the predicates and mix-scale rules stay identical across paths.

Fix: `transformMixScale` and `pathMixScale` now distinguish "duck-typed object without any mix fields" (falls back to neutral `1`) from "every mix axis is explicitly `0`" (returns `0`, so the constraint correctly contributes nothing). Previously both cases fell back to `1`, causing real Spine constraints with all-zero mix axes to be over-counted at full weight. This mirrors the long-standing semantics of `ikMixScale` (`abs(mix ?? 1)`), where an explicit `mix: 0` returns `0` but absent `mix` returns `1`.

Add: `@spine-benchmark/metrics-analyzers` exports a new `MeshDetailEntry` type and surfaces `meshMetrics.meshDetails` on `MeshMetrics`, plus `constraintBones` and `activePhysicsAllCount` on `ConstraintMetrics`, computed via the canonical helpers from `metrics-impact-formula`.

Fix: `@spine-benchmark/metrics-analyzers`' `analyzePhysicsForAnimation` filters physics constraints with `mix === 0` from `physicsData` and `activePhysicsCount` (apply work), matching the global path, the live crawler, the in-app heatmap, and the CLI. The integration cost is captured separately by `activePhysicsAllCount`. Per-animation reports no longer over-count or under-count physics impact for skeletons whose physics is temporarily disabled by `mix=0`.

Add: `@spine-benchmark/pixi-crawler` extends `ComputationalImpact` with `pathBones`, `ikBones`, `transformBones`, `boneCount`, `mixingDepth`, `activeMeshes`, `avgBoneInfluences`, and `physicsActiveAll`, so the live analysis result exposes the same enhanced inputs that flow into the formula. Internals now route through `activeConstraintStats` from `metrics-impact-formula` instead of duplicating the constraint-walking loop.

Fix: `@spine-benchmark/metrics-scoring` and `@spine-benchmark/metrics-reporting` now forward `constraintBones`, `meshDetails`, and `physicsActiveAll` into `computationalImpactCost`, so the offline scoring path matches the live crawler and in-app heatmap on skeletons with long bone chains, non-uniform skinning density, partial-mix constraints, multi-track playback, or physics constraints with `mix=0`.

Fix: `@spine-benchmark/cli` now picks the per-frame peak CI by evaluating `computationalImpactCost` on each sampled frame's enhanced inputs instead of recomputing once at the end against averaged peak counts. The previous approach averaged across constraints and meshes that never coexisted on the same frame, undercounting peak cost. CLI also drops its private constraint-walking loop and routes constraint and mesh extraction through `activeConstraintStats` and `avgBoneInfluencesForMesh` so it cannot drift from the rest of the workspace.

Behaviour change for consumers calibrating around peak CI:

- Long IK / path / transform chains see higher CI (per-bone scaling instead of flat per-constraint).
- Constraints with partial `mix` (between 0 and 1) see CI equal to the same constraint at `mix=1`. Lowering a constraint's mix in production no longer reduces its CI - to reduce cost, set `mix=0` or `active=false`, which removes the constraint entirely.
- Multi-track playback (parallel tracks without crossfade) now contributes `0.15` per extra track. Crossfades and layered crossfades contribute proportionally to their `mixingFrom` chain depth.
- Physics constraints with `active=true && mix=0` now charge the integration cost (`0.56`) but not the apply cost (`0.14`). Constraints with `active=false` still charge nothing.
- Transform / path constraints with all mix axes explicitly set to `0` now charge nothing (was being over-counted as full weight).
