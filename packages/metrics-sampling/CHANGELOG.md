# @spine-benchmark/metrics-sampling

## 0.1.1

### Patch Changes

- [`21f0646`](https://github.com/schmooky/spine-benchmark/commit/21f064654363ad3e5ae3492bb6ad096f93fd428a) Thanks [@schmooky](https://github.com/schmooky)! - Switch internal workspace dependencies from `file:..` paths to semver ranges. No runtime change for consumers; required so that the new changesets-driven release pipeline can cascade dependency bumps automatically (a release of `@spine-benchmark/metrics-impact-formula` now forces a matching patch release of every package that depends on it, so the npm registry never has a published `pixi-crawler` referencing a stale leaf package).

- [`3f95e6e`](https://github.com/schmooky/spine-benchmark/commit/3f95e6e18b638ab468be4ea5838a34a3731fb529) Thanks [@schmooky](https://github.com/schmooky)! - Fix `AnimationSampler.sampleAnimation` leaving the live spine instance frozen at the last sampled animation's last frame, which made some skeletons render invisible after the analysis pipeline ran.

  The sampling loop mutates everything on the skeleton - bone world transforms, slot colors, slot attachments, sequence indices - and the previous `finally` block only restored state if there was a real animation playing _before_ sampling started. On a fresh load (the most common case in the benchmark) there isn't one, so the restore branch was a no-op. The viewer was painting whatever arbitrary configuration the sampler happened to leave behind, with bones potentially positioned far off-screen if the last sampled animation moved them.

  `finally` now always clears the sampling track, calls `skeleton.setToSetupPose()`, and re-runs `updateWorldTransform`. If a real animation was playing before sampling, it's re-applied on top after the reset, so users who triggered analysis mid-playback don't lose their playback position.

  This was the root cause of the "spine loads without errors but I can't see it on screen" report.
