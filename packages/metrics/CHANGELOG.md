# @spine-benchmark/metrics

## 0.1.1

### Patch Changes

- [`21f0646`](https://github.com/schmooky/spine-benchmark/commit/21f064654363ad3e5ae3492bb6ad096f93fd428a) Thanks [@schmooky](https://github.com/schmooky)! - Switch internal workspace dependencies from `file:..` paths to semver ranges. No runtime change for consumers; required so that the new changesets-driven release pipeline can cascade dependency bumps automatically (a release of `@spine-benchmark/metrics-impact-formula` now forces a matching patch release of every package that depends on it, so the npm registry never has a published `pixi-crawler` referencing a stale leaf package).

- [`f818d09`](https://github.com/schmooky/spine-benchmark/commit/f818d090136a89a26c2a769c8c233744f2ef27fb) Thanks [@schmooky](https://github.com/schmooky)! - Fix `SpineAnalyzer.analyze` leaving the live spine instance frozen at whatever the last sub-analyzer's last frame produced.

  The previous metrics-sampling fix only patched one of several mutation sources in the analysis pipeline. Several other sub-analyzers (`blendModeAnalyzer`, etc.) also clear tracks, set a target animation, frame-step, and try to "restore" - but their restore logic only fires when there was a real animation playing before sampling started. On a fresh-load benchmark drop there isn't, so each sub-analyzer left the skeleton in the _next_ mutated state, and after all of them ran, the spine was frozen at the very last analyzer's last frame. For skeletons whose last analyzed animation moves bones far from origin (e.g. a "win" effect), the visible slots ended up at world coordinates the camera will never look at.

  `SpineAnalyzer.analyze` now wraps the entire pipeline in `try / finally` and always calls `state.clearTracks()` + `skeleton.setToSetupPose()` + `updateWorldTransform` at the end, regardless of how many sub-analyzers ran or what they did. This is the load-bearing invariant: `SpineAnalyzer.analyze(spine)` must leave `spine` in a clean known state. Sub-analyzers can mutate freely and we'll always normalize at the top level.

- Updated dependencies [[`21f0646`](https://github.com/schmooky/spine-benchmark/commit/21f064654363ad3e5ae3492bb6ad096f93fd428a), [`3f95e6e`](https://github.com/schmooky/spine-benchmark/commit/3f95e6e18b638ab468be4ea5838a34a3731fb529), [`21f0646`](https://github.com/schmooky/spine-benchmark/commit/21f064654363ad3e5ae3492bb6ad096f93fd428a)]:
  - @spine-benchmark/metrics-analyzers@0.1.1
  - @spine-benchmark/metrics-factors@0.1.1
  - @spine-benchmark/metrics-pipeline@0.1.1
  - @spine-benchmark/metrics-reporting@0.1.1
  - @spine-benchmark/metrics-sampling@0.1.1
  - @spine-benchmark/metrics-scoring@0.1.1
