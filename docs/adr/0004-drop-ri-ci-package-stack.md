# 0004. Drop the RI/CI package stack; ship a fitted-ms cost model

Date: 2026-07-03

## Status

Accepted

## Context

Spine Benchmark started as a scorer of two unitless numbers -
Rendering Impact (RI) and Computational Impact (CI) - and grew a
package per concern around them: a sampling package, an analyzer
package, a scoring/classification package, a factors (weights)
package, an orchestration pipeline, a reporting package, and a
`metrics` umbrella that re-exported the lot. A parallel "workbench
engine" grew alongside it - `workbench-core` plus `mesh-tools`,
`constraint-tools`, `drawcall-tools`, `render-tools`, `file-tools`,
`asset-store`, and `spine-loader` - to power an early editor UI.

Two things changed that made most of this stack dead weight:

1. **The product moved from RI/CI to fitted milliseconds.** The
   question users actually ask is "how long does this spine take to
   render on that device," answered by a per-GPU-family cost model
   fit from real fleet measurements (`metrics-model` +
   `metrics-analyzers/deviceFit`). RI/CI survives only as a rough
   at-a-glance heatmap score; both it and the fitted model now read
   their inputs from ONE canonical pose-feature walker in
   `metrics-impact-formula` (ADR 0001's addendum).

2. **The current site was rebuilt from scratch.** The v4 workbench
   (`apps/benchmark`) vendored its own loader and tool widgets and
   never imported `workbench-core` or any `*-tools` package. The
   offline analyzer/pipeline/reporting chain lost its last consumer
   when the site stopped calling `SpineAnalyzer.analyze`.

A dependency audit (2026-07-03) confirmed by both declared
dependencies and real source imports that thirteen packages had no
live consumer:

- **Old RI/CI stack (6):** `metrics`, `metrics-pipeline`,
  `metrics-reporting`, `metrics-scoring`, `metrics-factors`, and the
  five per-attachment analyzer FILES inside `metrics-analyzers`.
  `apps/reports-api`'s only real dependency is `spinefolio`; its
  `metrics-reporting` mention was a stale doc comment.
- **workbench-core engine (8):** `workbench-core` (no consumers at
  all) exclusively owned `constraint-tools`, `drawcall-tools`,
  `mesh-tools`, `render-tools`, `file-tools`, `asset-store`, and
  `spine-loader`.

All thirteen were already published on npm at 0.1.1.

(`calibration-primitives` was initially in this list but kept: it is
the source of the procedural single-axis calibration spines that the
`tools/scene-pipeline` authoring scripts emit. It was never published,
so it is marked private rather than dropped.)

## Decision

Delete all fourteen packages from the repo. `metrics-analyzers` is
stripped to just `deviceFit` + `deviceClass` (its five RI/CI analyzer
files removed, its `metrics-factors`/`metrics-scoring`/
`metrics-sampling` and `spine-pixi` deps dropped), making it a
pixi-free data package.

The surviving nine packages split into:

- **Public (6):** `metrics-impact-formula` (formulas + pose walker +
  coverage), `metrics-model`, `metrics-analyzers`, `cli`,
  `pixi-crawler`, `spinefolio`.
- **Private (3):** `gpu-timing`, `metrics-sampling`, and
  `calibration-primitives` - live, but consumed only by this repo's own
  private apps and tooling, so marked `private: true` (changesets and
  `build-all-publishable` skip them).

No public package may depend on a private one; a guard check enforces
this. The already-published npm versions of the deleted packages are
left as-is (orphaned at 0.1.1) rather than deprecated - a deliberate
low-touch choice; they can be `npm deprecate`d later if needed.

## Consequences

- The publishable surface drops from 20+ packages to 6, and the
  RI/CI-vs-fitted-ms confusion in the package list goes away.
- `metrics-analyzers` no longer drags a Spine/pixi peer dependency
  into the server, and is a clean data-only fit toolkit.
- Anyone who installed a deleted package still resolves the orphaned
  0.1.1 - it just never receives updates. The canonical replacement
  for all scoring/feature needs is `metrics-impact-formula`.
- The duplication guard now also flags a local pose-feature walk
  (`worldVerticesLength / 2` outside the leaf), closing the
  input-drift gap that ADR 0002 left open.
