#!/usr/bin/env node
/**
 * build-all-publishable
 *
 * Builds workspace packages in topological order.
 *
 * Usage:
 *   node scripts/build-all-publishable.mjs            # build ALL publishable packages (for release)
 *   node scripts/build-all-publishable.mjs --for site  # build only packages that apps/benchmark depends on
 *   node scripts/build-all-publishable.mjs --for crawler-demo  # build only packages that apps/crawler depends on
 *
 * With --for, the script reads the target app's package.json, traces its
 * transitive @spine-benchmark/* dependencies, and builds only those. This
 * skips unrelated packages (e.g. spinefolio, pixi-crawler, cli) and cuts
 * the site build from ~4 minutes to ~30 seconds on CI.
 */
import { readdir, readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

const SKIP_NAMES = new Set([
  '@spine-benchmark/site',
  '@spine-benchmark/crawler-demo',
  '@spine-benchmark/watcher',
]);

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function listWorkspacePackages() {
  const out = [];
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

/** Kahn's algorithm. */
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
    queue.sort();
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
    throw new Error(`Dependency cycle detected (${order.length} of ${packages.length} sorted)`);
  }
  return order.map((name) => byName.get(name));
}

/**
 * Trace transitive @spine-benchmark/* deps of an app.
 */
async function traceAppDeps(appDir) {
  const pkg = await readJson(join(appDir, 'package.json'));
  const needed = new Set();
  const allPkgs = await listWorkspacePackages();
  const byName = new Map(allPkgs.map(p => [p.name, p]));

  function walk(name) {
    if (needed.has(name)) return;
    needed.add(name);
    const p = byName.get(name);
    if (p) {
      for (const dep of p.deps) walk(dep);
    }
  }

  // Seed with the app's direct @spine-benchmark/* deps
  for (const map of [pkg.dependencies, pkg.devDependencies]) {
    if (!map) continue;
    for (const dep of Object.keys(map)) {
      if (dep.startsWith('@spine-benchmark/') && byName.has(dep)) walk(dep);
    }
  }

  return needed;
}

function runBuild(pkg) {
  return new Promise((resolve, reject) => {
    console.log(`>>> building ${pkg.name}@${pkg.version}`);
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
  // Parse --for flag
  const forIdx = process.argv.indexOf('--for');
  let filterNames = null;

  if (forIdx >= 0 && process.argv[forIdx + 1]) {
    const appName = process.argv[forIdx + 1];
    const appDir = join(repoRoot, 'apps', appName);
    try {
      filterNames = await traceAppDeps(appDir);
      console.log(`build-all-publishable: --for ${appName} -> ${filterNames.size} transitive deps`);
    } catch (err) {
      console.error(`Failed to trace deps for apps/${appName}:`, err.message);
      process.exit(1);
    }
  }

  let packages = await listWorkspacePackages();

  if (filterNames) {
    packages = packages.filter(p => filterNames.has(p.name));
  }

  const ordered = topoSort(packages);
  console.log(`build-all-publishable: ${ordered.length} packages to build`);
  for (const p of ordered) console.log(`  ${p.name}${p.hasBuild ? '' : ' [no build]'}`);

  for (const p of ordered) {
    if (!p.hasBuild) continue;
    await runBuild(p);
  }
  console.log('build-all-publishable: OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
