# Contributing

Thanks for your interest in Spine Benchmark. This file covers the mechanics of
contributing. For the house style and the load-bearing design constraints
(impact formula single source of truth, heatmap/crawler scoring parity,
ASCII-only punctuation, etc.) read [`AGENTS.md`](./AGENTS.md) first - those
rules are enforced by lint guards and pre-commit hooks, so they'll block a
merge if you break them.

## Quick start

```bash
git clone https://github.com/schmooky/spine-benchmark.git
cd spine-benchmark
npm install
npm run dev        # local benchmark at http://localhost:5173
npm run test       # vitest + lint guards
```

Node 20+ is required. The repo uses npm workspaces; no extra package manager.

## Workflow

1. **Branch from `main`.** Name it something human like
   `fix/blend-switch-count-off-by-one` or `feat/per-animation-heatmap`.
   Long-lived release branches use `v*` (e.g. `v3.2`) and publish
   [snapshot releases](./README.md#nightly-snapshot-releases-from-version-branches)
   automatically.
2. **Make focused changes.** One logical change per PR. If you notice a
   second bug while fixing the first, open a second PR.
3. **Run the test suite:** `npm run test`. This runs the formula-duplication
   guard, the fancy-Unicode guard, and the vitest suites. All of them must
   pass before review.
4. **If your change ships user-visible behavior in a publishable package,
   add a changeset:** `npx changeset`. Pick the affected packages and the
   bump kind (`patch` / `minor` / `major`) and commit the resulting
   `.changeset/*.md` file. Changes to private apps (`benchmark`,
   `reports-api`, `crawler-demo`, `site`) do not need a changeset because
   those are deployed, not published.
5. **Open a PR.** The PR template asks for a summary, a test plan, and
   confirms whether a changeset was added.

## What "good" looks like in this repo

- **Small, readable diffs.** Don't sneak in refactors that were not asked
  for. If a refactor is needed for a fix, do it in a separate commit in
  the same PR with a clear message.
- **Comments explain "why", not "what".** The code already says what it
  does; comments should capture the non-obvious reason a line exists.
  See existing metrics packages for the tone.
- **No emoji in source, commit messages, changelog entries, or UI strings.**
  The fancy-Unicode lint guard enforces this. Use ASCII punctuation.
- **No duplicate impact-formula implementations.** The
  `check-no-duplicate-impact-formulas` guard fails the build if you
  reimplement scoring math outside `@spine-benchmark/metrics-impact-formula`.
  Import the canonical helpers instead.
- **i18n keys.** Hardcoded UI strings in `apps/benchmark/src/components`
  fail the `check:i18n` check. Add the key to `apps/benchmark/src/locales/en.json`
  and `ru.json`, then reference it via `t(...)`.

## GitHub Actions are pinned to SHAs

Every third-party action in `.github/workflows/` is pinned to a
full commit SHA with the human version as a trailing comment, e.g.
`actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5 # v4`.
This is a supply-chain hardening step recommended by the OpenSSF
Scorecard: a moving tag like `@v4` could be repointed at a
malicious commit by a compromised maintainer account, but a SHA
cannot. Dependabot keeps the SHAs fresh - you will see regular
`chore(ci)` PRs bumping them. Approve those like any other
dependency bump.

If you are adding a new action, resolve its major-version tag to
a SHA with `git ls-remote` and commit both the SHA and the version
comment in the same `uses:` line.

## Releases

Every published package is versioned and shipped by
[changesets](https://github.com/changesets/changesets) on merge to `main`.
The full flow (and the snapshot release workflow for version branches) is
documented in the [Releases section of the README](./README.md#releases).

TL;DR:
- Your PR should include a changeset if it ships user-visible changes in
  a publishable package.
- After merge, a `chore: version packages` PR opens automatically. Merging
  that PR publishes the affected packages to npm.
- Branch previews publish to npm under a per-branch dist-tag (e.g.
  `@spine-benchmark/spinefolio@v3-2`) so reviewers can install
  work-in-progress versions without waiting for a merge.

## Reporting bugs and proposing features

Use the issue forms:

- [Bug report](./.github/ISSUE_TEMPLATE/bug_report.yml)
- [Feature request](./.github/ISSUE_TEMPLATE/feature_request.yml)

For security issues, please follow [`SECURITY.md`](./SECURITY.md) and do
not open a public issue.

## Crediting contributors

This project follows the [all-contributors](https://allcontributors.org)
spec. Anyone who helps - code, docs, design, reviews, bug reports,
ideas - gets credited in the README.

To add someone (or yourself), comment on any issue or PR:

```
@all-contributors please add @their-github-handle for code, doc
```

The bot opens a PR updating `.all-contributorsrc` and the README
contributors block. Valid contribution types are listed at
https://allcontributors.org/docs/en/emoji-key.
