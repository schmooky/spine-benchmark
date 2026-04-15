# @spine-benchmark/render-tools

## 0.1.1

### Patch Changes

- [`21f0646`](https://github.com/schmooky/spine-benchmark/commit/21f064654363ad3e5ae3492bb6ad096f93fd428a) Thanks [@schmooky](https://github.com/schmooky)! - Switch internal workspace dependencies from `file:..` paths to semver ranges. No runtime change for consumers; required so that the new changesets-driven release pipeline can cascade dependency bumps automatically (a release of `@spine-benchmark/metrics-impact-formula` now forces a matching patch release of every package that depends on it, so the npm registry never has a published `pixi-crawler` referencing a stale leaf package).

- [`c52348f`](https://github.com/schmooky/spine-benchmark/commit/c52348fcb2880ec775765ed5f07e5ca5ba927d9c) Thanks [@schmooky](https://github.com/schmooky)! - Fix `CameraContainer.lookAtChild` auto-fit so it uses the skeleton's design-time bounds (`skeleton.data.width / height`) instead of `spine.getBounds()`.

  `getBounds()` only reflects the attachments that are currently visible at the moment of the call, and is sometimes `0x0` in pixi-spine v8 for skeletons that use sequence attachments. Using it as the source of truth meant the camera was zooming onto the tiny visible footprint of the setup pose, then the auto-played animation extended far outside the locked viewport.

  The new logic:

  - Source the bounds from `skeleton.data.width / height` (design-time, stable across animations).
  - Fall back to `getBounds()` only when the skeleton header doesn't carry design bounds (rare; some older exports omit them).
  - Last-resort fallback to a 200x200 default so the math can't divide by zero.
  - Re-center the spine inside the camera using `data.x / data.y`, so asymmetric exports whose design bounds are offset from the skeleton's local origin don't drift to one side of the viewport.
  - Round the computed scale DOWN to the nearest `0.05` (was rounding up) so we never slightly overshoot the padded area.
  - Clamp the scale to `[0.05, 10]` so tiny skeletons don't get blown up to absurd resolutions on big screens, and giant skeletons don't collapse to a smudge.
  - Bumped the padding from 20 px to 40 px so the auto-fit leaves a bit of breathing room.

  Also removes the previous fallback bug that was halving `data.width / data.height` (`bounds.width = data.width / 2`), which had no justification and caused the camera to over-scale by 2x whenever the fallback fired.

- [`a5829fb`](https://github.com/schmooky/spine-benchmark/commit/a5829fb5551bcc603a6c581b00e80be47cb310b9) Thanks [@schmooky](https://github.com/schmooky)! - Fix `The supplied Container must be a child of the caller` crash from `CameraContainer.lookAtChild` during bundle swaps and resize events.

  `lookAtChild` was calling `this.getChildIndex(this.currentSpine)` without first verifying that `currentSpine` was actually a child of the camera container. The `ResizeObserver`-driven re-center path in the benchmark could fire `lookAtChild` while a React-driven bundle swap was mid-flight - at which point `currentSpine` was pointing at a Spine that had just been removed from the container by `clearSpine()`. pixi's `getChildIndex` is a hard throw on a non-child, so the viewer crashed during a hot-reload, an upload race, or any normal bundle replacement followed by a resize.

  `lookAtChild` now bails out cleanly and clears the stale reference if the supplied spine is no longer parented to this container. The next `useEffect` pass with the freshly-mounted spine calls it again with a properly-parented instance, which works.
