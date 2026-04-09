---
"@spine-benchmark/metrics-sampling": patch
---

Fix `AnimationSampler.sampleAnimation` leaving the live spine instance frozen at the last sampled animation's last frame, which made some skeletons render invisible after the analysis pipeline ran.

The sampling loop mutates everything on the skeleton - bone world transforms, slot colors, slot attachments, sequence indices - and the previous `finally` block only restored state if there was a real animation playing *before* sampling started. On a fresh load (the most common case in the benchmark) there isn't one, so the restore branch was a no-op. The viewer was painting whatever arbitrary configuration the sampler happened to leave behind, with bones potentially positioned far off-screen if the last sampled animation moved them.

`finally` now always clears the sampling track, calls `skeleton.setToSetupPose()`, and re-runs `updateWorldTransform`. If a real animation was playing before sampling, it's re-applied on top after the reset, so users who triggered analysis mid-playback don't lose their playback position.

This was the root cause of the "spine loads without errors but I can't see it on screen" report.
