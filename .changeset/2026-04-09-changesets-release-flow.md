---
"@spine-benchmark/asset-store": patch
"@spine-benchmark/constraint-tools": patch
"@spine-benchmark/drawcall-tools": patch
"@spine-benchmark/file-tools": patch
"@spine-benchmark/mesh-tools": patch
"@spine-benchmark/metrics": patch
"@spine-benchmark/metrics-analyzers": patch
"@spine-benchmark/metrics-factors": patch
"@spine-benchmark/metrics-impact-formula": patch
"@spine-benchmark/metrics-pipeline": patch
"@spine-benchmark/metrics-reporting": patch
"@spine-benchmark/metrics-sampling": patch
"@spine-benchmark/metrics-scoring": patch
"@spine-benchmark/pixi-crawler": patch
"@spine-benchmark/render-tools": patch
"@spine-benchmark/spine-loader": patch
"@spine-benchmark/spinefolio": patch
"@spine-benchmark/workbench-core": patch
---

Switch internal workspace dependencies from `file:..` paths to semver ranges. No runtime change for consumers; required so that the new changesets-driven release pipeline can cascade dependency bumps automatically (a release of `@spine-benchmark/metrics-impact-formula` now forces a matching patch release of every package that depends on it, so the npm registry never has a published `pixi-crawler` referencing a stale leaf package).
