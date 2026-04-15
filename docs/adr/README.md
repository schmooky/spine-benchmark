# Architecture Decision Records

This directory contains the load-bearing architectural decisions
made in this project. ADRs are short, numbered, immutable records
of a choice and the context that forced it.

Read [`0000-record-architecture-decisions.md`](./0000-record-architecture-decisions.md)
first - it explains why we use ADRs at all and how to write a new
one.

## Index

| # | Status | Title |
|---|---|---|
| [0000](./0000-record-architecture-decisions.md) | Accepted | Record architecture decisions |
| [0001](./0001-single-source-of-truth-for-impact-math.md) | Accepted | Single source of truth for impact math |
| [0002](./0002-heatmap-crawler-parity.md) | Accepted | Heatmap and crawler must produce identical scores |
| [0003](./0003-split-three-monolith-files.md) | Proposed | Split three monolith files (App.tsx, CrawlerModUI.ts, pixi-spine-widget.ts) |

## Writing a new ADR

1. Copy `_template.md` to `NNNN-short-kebab-title.md`, incrementing
   `NNNN`.
2. Fill in context, decision, and consequences.
3. Add a row to the index table above.
4. Open a PR. ADRs are reviewed and merged like any other change.

ADRs are **immutable once merged**. If a decision is superseded,
write a new ADR referencing the old one and update the old one's
status, but do not rewrite history.
