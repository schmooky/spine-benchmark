#!/usr/bin/env node
/**
 * snapshot-release
 *
 * Publish a changeset "snapshot" release of every package that has a
 * pending .changeset/*.md file on the current branch. Snapshot versions
 * look like `<base>-<tag>-<timestamp>` and are published to npm under a
 * custom dist-tag so reviewers can install them without disturbing the
 * `latest` tag or the normal release flow.
 *
 * Usage:
 *   node scripts/snapshot-release.mjs              # infer tag from branch
 *   node scripts/snapshot-release.mjs --tag v3-2   # explicit tag
 *   SNAPSHOT_TAG=v3-2 node scripts/snapshot-release.mjs
 *
 * Environment:
 *   SNAPSHOT_TAG    - dist-tag override (wins over --tag and branch)
 *   NODE_AUTH_TOKEN - npm auth token for `changeset publish`
 *
 * Exit codes:
 *   0 - published (or nothing to publish, which is fine)
 *   1 - real failure (version/publish error)
 *
 * Called from `npm run snapshot`, which in turn is wired into
 * .github/workflows/snapshot.yml. Never commit or tag anything - the
 * whole point is that these are throwaway previews.
 */

import { spawnSync } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const changesetDir = join(repoRoot, '.changeset');

function run(cmd, args, opts = {}) {
  console.log(`\n$ ${cmd} ${args.join(' ')}`);
  const result = spawnSync(cmd, args, { stdio: 'inherit', cwd: repoRoot, ...opts });
  if (result.status !== 0) {
    throw new Error(`${cmd} ${args.join(' ')} exited with status ${result.status}`);
  }
}

function sanitizeTag(raw) {
  // npm dist-tags and semver pre-release identifiers can contain ASCII
  // alphanumerics and hyphens, so strip everything else.
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function parseArgTag(argv) {
  const i = argv.indexOf('--tag');
  if (i !== -1 && argv[i + 1]) return argv[i + 1];
  return null;
}

function currentBranch() {
  // GitHub Actions sets GITHUB_REF_NAME directly; locally we fall back
  // to git so you can run `npm run snapshot` from any checkout.
  if (process.env.GITHUB_REF_NAME) return process.env.GITHUB_REF_NAME;
  const r = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: repoRoot });
  if (r.status !== 0) return '';
  return r.stdout.toString().trim();
}

async function hasPendingChangesets() {
  try {
    const entries = await readdir(changesetDir);
    return entries.some((f) => f.endsWith('.md') && f !== 'README.md');
  } catch {
    return false;
  }
}

async function main() {
  const tag = sanitizeTag(process.env.SNAPSHOT_TAG || parseArgTag(process.argv) || currentBranch());
  if (!tag) {
    console.error('[snapshot] could not determine a dist-tag (set SNAPSHOT_TAG or --tag).');
    process.exit(1);
  }
  if (tag === 'main') {
    console.error('[snapshot] refusing to publish a snapshot from main - use the regular release flow.');
    process.exit(1);
  }

  if (!(await hasPendingChangesets())) {
    console.log('[snapshot] no pending .changeset/*.md files - nothing to publish.');
    return;
  }

  console.log(`[snapshot] preparing snapshot release with dist-tag "${tag}"`);

  // Step 1: ephemeral version bump. `--snapshot <tag>` rewrites package
  // versions to `<current>-<tag>-<timestamp>` in-place; we never commit
  // the change, the workflow discards it at the end.
  run('npx', ['changeset', 'version', '--snapshot', tag]);

  // Step 2: build publishable packages topologically so the dist/ folders
  // are fresh before `changeset publish` reads them.
  run('npm', ['run', 'build:all']);

  // Step 3: publish to npm under the custom dist-tag without creating
  // git tags or committing.
  run('npx', ['changeset', 'publish', '--no-git-tag', '--tag', tag, '--snapshot']);
}

main().catch((err) => {
  console.error('[snapshot] failed:', err.message || err);
  process.exit(1);
});
