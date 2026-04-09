---
"@spine-benchmark/spine-loader": patch
---

Fix `Cannot read properties of undefined (reading '_source')` crash on Spine 4.2 skeletons that contain sequence attachments (animated sprite frames).

`spine-pixi-v8`'s `AtlasAttachmentLoader.newRegionAttachment` and `newMeshAttachment` populate `attachment.sequence.regions[]` but leave `attachment.region` itself `undefined`. The runtime is supposed to fix this on the first `SequenceTimeline.apply()` call - which only happens during the next animation tick, not at construction time. If anything renders the spine instance before the first tick (the viewer's first paint, for example), the renderer dereferences `attachment.region.texture._source` on `undefined` and crashes deep inside the batcher / RenderTargetSystem.

`SpineLoader` now eagerly mirrors what `Sequence.apply` would have done: for every attachment with a sequence and no current region, copy `sequence.regions[setupIndex]` into `attachment.region` and call `updateRegion()`. This is applied in both the file-drop path (`loadSpineFiles`) and the URL path (`loadSpineFromUrls`). Animation timelines that subsequently animate the sequence behave normally from frame two onwards.
