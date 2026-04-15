# 0003. Split three monolith files

Date: 2026-04-11

## Status

Proposed

## Context

A repo audit in April 2026 flagged three files whose size and
responsibility mix make them hard to change safely:

| File | Lines | What's mixed in |
|---|---|---|
| `apps/benchmark/src/App.tsx` | 999 | Routing, modal management, URL parsing, command registration, global state, and layout |
| `packages/pixi-crawler/src/ui/CrawlerModUI.ts` | 2518 | SDF shader generation, PixiJS mesh rendering, event handling, and overlay layout |
| `packages/spinefolio/src/core/pixi-spine-widget.ts` | 1975 | PixiJS rendering, animation state management, input handling, and control-panel construction |

None of these files is actively broken. They pass tests, they ship,
and they do their jobs. The problem is the shape of the cost:

- Any edit to one concern touches a file full of other concerns,
  so the diff is larger than it needs to be.
- Reviewers can't tell at a glance whether a change has
  side-effects on an unrelated subsystem that happens to live in
  the same file.
- The parity test (ADR [0002](./0002-heatmap-crawler-parity.md))
  catches scoring drift in `CrawlerModUI.ts`, but there is no
  similar safety net for the other two files. Splitting them
  lowers the blast radius of mistakes.

A mechanical refactor without validation would be reckless. Each
of these files is UI code that only proves itself when run in a
browser. None has meaningful unit test coverage today.

## Decision

Treat each file as its own dedicated PR, in its own sprint, in the
order that matches the risk profile:

1. **`App.tsx`** - lowest risk. Extractions are pure React and
   can be validated by eye in the dev server. Target decomposition:
   - `AppLayout.tsx` - top-level layout shell (header, sidebar,
     content area, footer).
   - `hooks/useUrlSync.ts` - URL <-> state synchronisation that
     currently lives inline in `App.tsx`.
   - `context/CommandRegistryContext.tsx` - the command registry
     that is currently wired in the root.
   - `modals/ModalHost.tsx` - the modal portal and state machine.
   - `App.tsx` stays as a ~100 line shell that composes the above.

2. **`pixi-spine-widget.ts`** - medium risk. Pure PixiJS, no
   React. Validate by running the demo pages under
   `packages/spinefolio`. Target decomposition:
   - `animation/AnimationManager.ts` - track management, play/pause,
     speed control.
   - `input/InputHandler.ts` - pointer events, keyboard, focus.
   - `ui/ControlPanel.ts` - the DOM controls overlay.
   - `pixi-spine-widget.ts` stays as the orchestration class.

3. **`CrawlerModUI.ts`** - highest risk. Touches scoring-adjacent
   code (the overlay reads live crawler state, which in turn
   computes RI/CI). Do this one last, after 1 and 2 have shipped
   and the extraction pattern is proven. Target decomposition:
   - `shaders/SdfShaderFactory.ts` - shader program generation.
   - `meshes/MeshBuilder.ts` - geometry builders for overlay
     chrome.
   - `events/EventManager.ts` - keyboard and pointer handlers.
   - `layout/OverlayLayout.ts` - positioning, sizing, z-order.
   - `CrawlerModUI.ts` stays as the top-level composition.

Each split PR must:

- **Land with no behaviour changes.** Pure movement of code.
  If a bug is found during the split, fix it in a follow-up, not
  in the split PR. Review is easier when the diff is strictly
  rearrangement.
- **Leave every import path stable from the outside.** The public
  exports from each package must not change. Internal paths can
  move freely.
- **Be tested by the author running the dev server and
  exercising the relevant code paths before review.** Take a
  screenshot or short clip and attach it to the PR.
- **Update `docs/ARCHITECTURE.md` if the split changes the
  answer to "where does X live?"** Most splits won't, because
  `ARCHITECTURE.md` reasons at the package level, not the file
  level.

## Consequences

- **Good:** Future edits to any one concern touch a small file
  that reads as a single idea. Reviewers can approve with
  confidence.
- **Good:** Each split creates a natural place to add targeted
  unit tests. `InputHandler`, `AnimationManager`, `MeshBuilder`,
  `useUrlSync` - all of those are testable in ways the current
  monoliths aren't.
- **Good:** The three files become less scary to onboard onto.
  A new contributor can read `animation/AnimationManager.ts` in
  ten minutes instead of bouncing through a 2000-line widget.
- **Cost:** Three PRs worth of review effort. No feature work
  happens during the split.
- **Cost:** Merge conflicts with in-flight feature branches. The
  splits should land in quiet weeks, not during a feature push.
- **Cost:** The risk of a subtle behaviour change hiding in a
  "pure movement" diff is real. The author-runs-dev-server
  requirement above is the mitigation, plus code review from
  someone who actually opens the app.

## Order and timing

- **Week N**: `App.tsx`. Lowest risk, highest leverage for future
  benchmark-app feature work.
- **Week N+2**: `pixi-spine-widget.ts`. Stands alone - doesn't
  depend on the App.tsx split.
- **Week N+4**: `CrawlerModUI.ts`. Do this only after the pattern
  is proven by the first two.

If any split PR takes more than two days to write and review, it
is too big - cut it into smaller extractions.

## References

- Repo audit, April 2026 (conversation history, not committed).
- `apps/benchmark/src/App.tsx` - current monolith.
- `packages/pixi-crawler/src/ui/CrawlerModUI.ts` - current monolith.
- `packages/spinefolio/src/core/pixi-spine-widget.ts` - current monolith.
- ADR [0002](./0002-heatmap-crawler-parity.md) - the parity
  test that catches drift if `CrawlerModUI.ts` breaks.
