---
"@spine-benchmark/metrics": patch
---

Fix `SpineAnalyzer.analyze` leaving the live spine instance frozen at whatever the last sub-analyzer's last frame produced.

The previous metrics-sampling fix only patched one of several mutation sources in the analysis pipeline. Several other sub-analyzers (`blendModeAnalyzer`, etc.) also clear tracks, set a target animation, frame-step, and try to "restore" - but their restore logic only fires when there was a real animation playing before sampling started. On a fresh-load benchmark drop there isn't, so each sub-analyzer left the skeleton in the *next* mutated state, and after all of them ran, the spine was frozen at the very last analyzer's last frame. For skeletons whose last analyzed animation moves bones far from origin (e.g. a "win" effect), the visible slots ended up at world coordinates the camera will never look at.

`SpineAnalyzer.analyze` now wraps the entire pipeline in `try / finally` and always calls `state.clearTracks()` + `skeleton.setToSetupPose()` + `updateWorldTransform` at the end, regardless of how many sub-analyzers ran or what they did. This is the load-bearing invariant: `SpineAnalyzer.analyze(spine)` must leave `spine` in a clean known state. Sub-analyzers can mutate freely and we'll always normalize at the top level.
