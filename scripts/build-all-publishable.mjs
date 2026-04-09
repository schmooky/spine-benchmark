#!/usr/bin/env node
/**
 * build-all-publishable
 *
 * Builds the dist/ directory for every publishable workspace package, in
 * topological order (consumers after producers). Used by `npm run release`
 * before changesets actually publishes to npm.
 *
 * "Publishable" means: lives under packages/, is not marked private, and
 * is not in the changesets ignore list (apps/site and apps/crawler-demo
 * deploy somewhere else, not to npm).
 *
 * Topological order is computed from each package.json's dependencies map
 * restricted to other workspace packages. We do not rely on per-package
 * `prebuild` scripts because those would otherwise rebuild the same
 * producer many times in a CI run.
 */
import { readdir, readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

// Apps that are NOT npm-published. Mirror the changesets ignore list.
const SKIP_NAMES = new Set([
  '@spine-benchmark/site',
  '@spine-benchmark/crawler-demo',
]);

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function listPublishablePackages() {
  const out = []; // { name, version, dir, deps: Set<string>, hasBuild: boolean }
  const packagesDir = join(repoRoot, 'packages');
  const entries = await readdir(packagesDir, { withFileTypes: true });
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const dir = join(packagesDir, e.name);
    let pkg;
    try {
      pkg = await readJson(join(dir, 'package.json'));
    } catch {
      continue;
    }
    if (!pkg.name || pkg.private || SKIP_NAMES.has(pkg.name)) continue;
    const deps = new Set();
    for (const map of [pkg.dependencies, pkg.devDependencies, pkg.peerDependencies]) {
      if (!map) continue;
      for (const dep of Object.keys(map)) {
        if (dep.startsWith('@spine-benchmark/')) deps.add(dep);
      }
    }
    out.push({
      name: pkg.name,
      version: pkg.version,
      dir,
      deps,
      hasBuild: !!(pkg.scripts && pkg.scripts.build),
    });
  }
  return out;
}

/** Kahn's algorithm. Throws on a cycle. */
function topoSort(packages) {
  const byName = new Map(packages.map((p) => [p.name, p]));
  const indeg = new Map();
  for (const p of packages) indeg.set(p.name, 0);
  for (const p of packages) {
    for (const d of p.deps) {
      if (byName.has(d)) indeg.set(p.name, indeg.get(p.name) + 1);
    }
  }
  const queue = packages.filter((p) => indeg.get(p.name) === 0).map((p) => p.name);
  const order = [];
  while (queue.length > 0) {
    queue.sort(); // deterministic ordering for same-rank packages
    const name = queue.shift();
    order.push(name);
    for (const p of packages) {
      if (p.deps.has(name)) {
        const next = indeg.get(p.name) - 1;
        indeg.set(p.name, next);
        if (next === 0) queue.push(p.name);
      }
    }
  }
  if (order.length !== packages.length) {
    throw new Error(`build-all-publishable: dependency cycle detected (${order.length} of ${packages.length} sorted)`);
  }
  return order.map((name) => byName.get(name));
}

function runBuild(pkg) {
  return new Promise((resolve, reject) => {
    console.log(`\n>>> building ${pkg.name}@${pkg.version}`);
    const child = spawn('npm', ['run', 'build', '--workspace', pkg.name], {
      cwd: repoRoot,
      stdio: 'inherit',
      env: { ...process.env, SKIP_PREBUILD: '1' },
    });
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${pkg.name} build failed (exit ${code})`));
    });
    child.on('error', reject);
  });
}

async function main() {
  const packages = await listPublishablePackages();
  const ordered = topoSort(packages);
  console.log(`build-all-publishable: ${ordered.length} packages to build (topological)`);
  for (const p of ordered) console.log(`  ${p.name}@${p.version}${p.hasBuild ? '' : ' [no build script]'}`);

  for (const p of ordered) {
    if (!p.hasBuild) continue;
    // eslint-disable-next-line no-await-in-loop
    await runBuild(p);
  }
  console.log('\nbuild-all-publishable: OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
