# @spine-benchmark/spine-loader

## 0.1.1

### Patch Changes

- [`21f0646`](https://github.com/schmooky/spine-benchmark/commit/21f064654363ad3e5ae3492bb6ad096f93fd428a) Thanks [@schmooky](https://github.com/schmooky)! - Switch internal workspace dependencies from `file:..` paths to semver ranges. No runtime change for consumers; required so that the new changesets-driven release pipeline can cascade dependency bumps automatically (a release of `@spine-benchmark/metrics-impact-formula` now forces a matching patch release of every package that depends on it, so the npm registry never has a published `pixi-crawler` referencing a stale leaf package).

- [`b032a64`](https://github.com/schmooky/spine-benchmark/commit/b032a64cbd3c8b70030746555583f4fda75bf5ba) Thanks [@schmooky](https://github.com/schmooky)! - Fix `Cannot read properties of undefined (reading '_source')` crash when loading Spine bundles whose atlas page is a `.webp` (or any non-`.png`) image.

  The previous implementation converted dropped image files to base64 `data:` URLs and handed them to Pixi's `Assets.loadBundle`. Pixi's texture loader-parser chain dispatches on URL extension, and `data:` URLs have none. PNG/JPEG survived the resulting parser fallback by accident; WebP came back as a half-initialised `Texture` whose `_source` was never populated. The truthy check in `createSpineAsset` passed, then the renderer exploded inside `Batcher.break` on the first frame.

  Replaced with `createImageBitmap(imageFile)` followed by `Texture.from(bitmap)`, which dispatches on the actual file bytes via the browser's native image decoder and works uniformly for `.png`, `.jpg`, `.jpeg`, and `.webp`. Compressed textures (`.ktx2`, `.basis`) still go through Pixi's loader because they need their dedicated transcoders.

  A side effect: an actually-corrupted image file now surfaces a real `createImageBitmap` decode error instead of a stub texture that crashes much later in the render pipeline.

- [`351a74e`](https://github.com/schmooky/spine-benchmark/commit/351a74e0742c631cdfa8c3ea88c010c01ed82bdc) Thanks [@schmooky](https://github.com/schmooky)! - Fix `Cannot read properties of undefined (reading '_source')` crash on Spine 4.2 skeletons that contain sequence attachments (animated sprite frames).

  `spine-pixi-v8`'s `AtlasAttachmentLoader.newRegionAttachment` and `newMeshAttachment` populate `attachment.sequence.regions[]` but leave `attachment.region` itself `undefined`. The runtime is supposed to fix this on the first `SequenceTimeline.apply()` call - which only happens during the next animation tick, not at construction time. If anything renders the spine instance before the first tick (the viewer's first paint, for example), the renderer dereferences `attachment.region.texture._source` on `undefined` and crashes deep inside the batcher / RenderTargetSystem.

  `SpineLoader` now eagerly mirrors what `Sequence.apply` would have done: for every attachment with a sequence and no current region, copy `sequence.regions[setupIndex]` into `attachment.region` and call `updateRegion()`. This is applied in both the file-drop path (`loadSpineFiles`) and the URL path (`loadSpineFromUrls`). Animation timelines that subsequently animate the sequence behave normally from frame two onwards.

- [`aa36b8f`](https://github.com/schmooky/spine-benchmark/commit/aa36b8fb827875c7240934c997ff14adabac7729) Thanks [@schmooky](https://github.com/schmooky)! - Rewrite the atlas page-name parser to fix three dormant bugs that were silently reachable on any non-single-page atlas.

  The previous implementation used a stateful `currentName` loop that set a pending page name on the first non-property line and flushed it when it saw a `size:` line. Three problems surfaced during unit-test coverage:

  - **Multi-page atlases mis-parsed.** Between pages, `currentName` was never reset, so the second page's name was rejected ("already have a pending name") and the first region of the previous page got pushed in its place. Every atlas fixture in the repo is single-page, so this never shipped as a user-visible bug, but consumers uploading real multi-page atlases would hit it.

  - **Trailing regions at EOF registered as fake page URLs.** `extractImageUrlsFromAtlas` pushed `currentName` at end-of-file, where it held the last region name rather than a real page name. The companion helper `extractImageNamesFromAtlas` did not push at EOF, so the two helpers silently disagreed about how many pages an atlas had.

  - **Absolute-URL page names were dropped.** The region-line heuristic was `!line.includes(':')`, which unintentionally rejected `https://cdn.example.com/page.png` because the scheme contains a colon. The subsequent `size:` line then found no pending name and lost the page entirely.

  Replaced the state machine with a single `isPageHeaderLine(lines, index)` lookahead helper that asks "does the next non-blank line start with `size:`?". Both helpers now route through it so they cannot drift. Multi-page atlases, trailing regions, and absolute-URL page names all parse correctly. Verified against every real atlas in `packages/spinefolio/assets/` - output is unchanged for the single-page cases the repo actually ships.

  Pure behaviour fix; no API changes. Consumers who were only using single-page atlases will see no difference. Consumers who were hitting any of the three bugs will see the atlas load correctly where it previously failed or returned wrong data.
