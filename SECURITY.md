# Security Policy

## Supported versions

Only the latest release of each published workspace package receives security
fixes. Snapshot releases published from version branches
(`@spine-benchmark/spinefolio@v3-2`, etc.) are previews and do not have an
SLA - upgrade to the corresponding stable release for fixes.

The hosted benchmark at https://spine.schmooky.dev always tracks `main`.

## Reporting a vulnerability

**Please do not file a public GitHub issue for security reports.** Public
issues can be seen by anyone watching the repo, which defeats the point of a
responsible disclosure.

Report privately via one of the following:

1. **GitHub Security Advisories** - preferred. Open a draft advisory at
   https://github.com/schmooky/spine-benchmark/security/advisories/new. This
   keeps the report private between you and the maintainers and lets us
   coordinate a CVE if applicable.
2. **Telegram** - for time-sensitive reports, reach out via
   https://t.me/spine_benchmark and ask for a private channel.

When reporting, please include:

- A description of the issue and the affected component (package, branch, or
  deployed surface).
- Reproduction steps or a proof-of-concept. A small standalone reproducer is
  ideal; attaching an affected asset bundle is fine if needed.
- The version or commit SHA where you observed the issue.
- Any suggested mitigation, if you have one.

## What to expect

- Acknowledgement within a few days.
- An initial assessment and severity discussion within a week.
- For confirmed issues, a fix or mitigation plan, and coordinated disclosure
  once a patched release is available.

## Scope

In scope:

- Any workspace package under `packages/` published to npm.
- The encrypted report and share flow in `apps/reports-api` (the
  client-side SubtleCrypto envelope, the server-side storage of public
  metrics / encrypted envelope, and anything else that could leak
  plaintext or weaken the envelope).
- The hosted benchmark at https://spine.schmooky.dev and the report
  viewer at https://reports.spine.schmooky.dev.
- CI and release tooling under `.github/workflows` and `scripts/` that
  could compromise the npm publish pipeline or the snapshot flow.

Out of scope:

- Bugs in bundled third-party runtimes (PixiJS, Spine Runtime) that should
  be reported upstream instead.
- Denial-of-service via uploading enormous or malformed skeletons to the
  benchmark - we accept this as part of the product surface.
- Automated scanner output that does not include a reproducer.

Thanks for helping keep the project and its users safe.
