---
"@spine-benchmark/render-tools": patch
---

Fix `CameraContainer.lookAtChild` auto-fit so it uses the skeleton's design-time bounds (`skeleton.data.width / height`) instead of `spine.getBounds()`.

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
