---
"@spine-benchmark/pixi-crawler": patch
"@spine-benchmark/metrics-impact-formula": patch
---

Drop `src/` from the `files` array on `@spine-benchmark/pixi-crawler` and `@spine-benchmark/metrics-impact-formula`. Only `dist/` ships to npm from now on.

The previous tarball included the TypeScript sources alongside the compiled output, which served no purpose for consumers - the compiled `dist/` already contains everything needed at runtime and declaration files for type-checking. Shipping `src/` made tarballs larger than they needed to be and invited consumers to import deep source paths that are not part of the public API.

Also removed the dead `"development": "./src/..."` entries from `@spine-benchmark/pixi-crawler`'s `exports` map. Those were pointing at source files that now no longer exist in the published tarball, and no resolver in the monorepo was requesting the `"development"` condition anyway. The monorepo's Vitest and Vite configs use plain workspace resolution via aliases, not export conditions.

No runtime or API change. Published tarballs get a little smaller. Public entry points (`.`, `./core`, `./ui` on pixi-crawler) remain unchanged.
