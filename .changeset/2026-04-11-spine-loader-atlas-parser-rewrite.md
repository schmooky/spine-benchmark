---
"@spine-benchmark/spine-loader": patch
---

Rewrite the atlas page-name parser to fix three dormant bugs that were silently reachable on any non-single-page atlas.

The previous implementation used a stateful `currentName` loop that set a pending page name on the first non-property line and flushed it when it saw a `size:` line. Three problems surfaced during unit-test coverage:

- **Multi-page atlases mis-parsed.** Between pages, `currentName` was never reset, so the second page's name was rejected ("already have a pending name") and the first region of the previous page got pushed in its place. Every atlas fixture in the repo is single-page, so this never shipped as a user-visible bug, but consumers uploading real multi-page atlases would hit it.

- **Trailing regions at EOF registered as fake page URLs.** `extractImageUrlsFromAtlas` pushed `currentName` at end-of-file, where it held the last region name rather than a real page name. The companion helper `extractImageNamesFromAtlas` did not push at EOF, so the two helpers silently disagreed about how many pages an atlas had.

- **Absolute-URL page names were dropped.** The region-line heuristic was `!line.includes(':')`, which unintentionally rejected `https://cdn.example.com/page.png` because the scheme contains a colon. The subsequent `size:` line then found no pending name and lost the page entirely.

Replaced the state machine with a single `isPageHeaderLine(lines, index)` lookahead helper that asks "does the next non-blank line start with `size:`?". Both helpers now route through it so they cannot drift. Multi-page atlases, trailing regions, and absolute-URL page names all parse correctly. Verified against every real atlas in `packages/spinefolio/assets/` - output is unchanged for the single-page cases the repo actually ships.

Pure behaviour fix; no API changes. Consumers who were only using single-page atlases will see no difference. Consumers who were hitting any of the three bugs will see the atlas load correctly where it previously failed or returned wrong data.
