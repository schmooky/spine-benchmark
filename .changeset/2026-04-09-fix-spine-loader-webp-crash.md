---
"@spine-benchmark/spine-loader": patch
---

Fix `Cannot read properties of undefined (reading '_source')` crash when loading Spine bundles whose atlas page is a `.webp` (or any non-`.png`) image.

The previous implementation converted dropped image files to base64 `data:` URLs and handed them to Pixi's `Assets.loadBundle`. Pixi's texture loader-parser chain dispatches on URL extension, and `data:` URLs have none. PNG/JPEG survived the resulting parser fallback by accident; WebP came back as a half-initialised `Texture` whose `_source` was never populated. The truthy check in `createSpineAsset` passed, then the renderer exploded inside `Batcher.break` on the first frame.

Replaced with `createImageBitmap(imageFile)` followed by `Texture.from(bitmap)`, which dispatches on the actual file bytes via the browser's native image decoder and works uniformly for `.png`, `.jpg`, `.jpeg`, and `.webp`. Compressed textures (`.ktx2`, `.basis`) still go through Pixi's loader because they need their dedicated transcoders.

A side effect: an actually-corrupted image file now surfaces a real `createImageBitmap` decode error instead of a stub texture that crashes much later in the render pipeline.
