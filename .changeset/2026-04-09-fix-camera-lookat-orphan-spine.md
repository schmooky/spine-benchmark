---
"@spine-benchmark/render-tools": patch
---

Fix `The supplied Container must be a child of the caller` crash from `CameraContainer.lookAtChild` during bundle swaps and resize events.

`lookAtChild` was calling `this.getChildIndex(this.currentSpine)` without first verifying that `currentSpine` was actually a child of the camera container. The `ResizeObserver`-driven re-center path in the benchmark could fire `lookAtChild` while a React-driven bundle swap was mid-flight - at which point `currentSpine` was pointing at a Spine that had just been removed from the container by `clearSpine()`. pixi's `getChildIndex` is a hard throw on a non-child, so the viewer crashed during a hot-reload, an upload race, or any normal bundle replacement followed by a resize.

`lookAtChild` now bails out cleanly and clears the stale reference if the supplied spine is no longer parented to this container. The next `useEffect` pass with the freshly-mounted spine calls it again with a properly-parented instance, which works.
