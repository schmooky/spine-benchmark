# 0000. Record architecture decisions

Date: 2026-04-11

## Status

Accepted

## Context

The repo had two "load-bearing" rules that are enforced by lint
guards but whose *reasons* lived only in commit messages, AGENTS.md
paragraphs, and maintainer memory:

- The impact formula must have a single source of truth.
- The heatmap and crawler paths must produce identical scores.

Both of these are the kind of decision that a reasonable refactor
looks like it could break without realising what it was breaking.
We needed a place to write down *why* each rule exists, separate
from house-style docs (which describe the rule itself) and commit
history (which decays).

## Decision

Adopt lightweight Architecture Decision Records, one Markdown file
per decision, numbered sequentially under `docs/adr/`. The format
is Michael Nygard's classic short template: Context, Decision,
Consequences. No tooling, no frontmatter, no build step - just
`git add`.

ADRs are immutable once merged. Superseding a decision means
writing a new ADR that references the old one.

## Consequences

- **Good:** Future contributors (including future versions of us)
  have a place to learn why a constraint exists without having to
  archaeology a commit history.
- **Good:** "Why can't I just move this?" has an answer that is not
  "ask the maintainer".
- **Cost:** Any non-trivial structural change needs an ADR. This
  is cheap - five minutes of writing - but it is a habit to build.
- **Cost:** ADRs can drift from reality if a decision is silently
  reversed without writing a superseding record. Mitigation: code
  review flags changes that look like they are walking back an ADR.

## References

- Michael Nygard, "Documenting Architecture Decisions":
  https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions
- `AGENTS.md` - the complementary doc describing *what* the rules
  are, once a decision is in place.
