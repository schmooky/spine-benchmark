#!/usr/bin/env node
// Measures the gzipped size of the built dist/ folders for every
// package we care about shipping small, and compares against
// ci/size-baseline.json. Prints a report. In --check mode the
// script exits non-zero when a package exceeds its baseline plus
// an allowed drift percentage.
//
// Usage:
//   node scripts/size-check.mjs                # report only
//   node scripts/size-check.mjs --check        # fail CI on regression
//   node scripts/size-check.mjs --update       # rewrite the baseline
//
// Intentionally zero-dependency: reads files, gzips in-process, and
// writes JSON. Adding size-limit or bundlewatch as a real dependency
// would be nicer long-term but this keeps the dev tree flat.

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');

// Packages to measure. Each entry lists the dist files we want to
// total up. Other files in dist/ (types, sourcemaps, themes) are
// ignored because they don't affect the runtime footprint.
const PACKAGES = [
  {
    name: '@spine-benchmark/pixi-crawler',
    distDir: 'packages/pixi-crawler/dist',
    entries: ['index.js', 'core/index.js', 'ui/index.js'],
  },
  {
    name: '@spine-benchmark/spinefolio',
    distDir: 'packages/spinefolio/dist',
    entries: ['spinefolio.module.js', 'spinefolio-auto.module.js'],
  },
  {
    name: '@spine-benchmark/metrics-impact-formula',
    distDir: 'packages/metrics-impact-formula/dist',
    entries: ['index.js'],
  },
];

// How much a package may grow (gzipped, percent) before --check fails.
// Dependabot bumps and intentional refactors should bump the baseline
// with --update rather than fighting this.
const DRIFT_TOLERANCE_PCT = 10;

const mode = process.argv[2] ?? '--report';
const baselinePath = path.join(repoRoot, 'ci', 'size-baseline.json');

function gzipSize(buf) {
  return zlib.gzipSync(buf, { level: zlib.constants.Z_BEST_COMPRESSION }).length;
}

function measure(pkg) {
  const missing = [];
  let raw = 0;
  let gz = 0;
  for (const entry of pkg.entries) {
    const full = path.join(repoRoot, pkg.distDir, entry);
    if (!fs.existsSync(full)) {
      missing.push(entry);
      continue;
    }
    const buf = fs.readFileSync(full);
    raw += buf.length;
    gz += gzipSize(buf);
  }
  return { raw, gz, missing };
}

function fmtKb(n) {
  return (n / 1024).toFixed(2) + ' KB';
}

function loadBaseline() {
  if (!fs.existsSync(baselinePath)) return {};
  return JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
}

function saveBaseline(data) {
  fs.mkdirSync(path.dirname(baselinePath), { recursive: true });
  fs.writeFileSync(baselinePath, JSON.stringify(data, null, 2) + '\n');
}

const baseline = loadBaseline();
const next = {};
const rows = [];
let failed = false;

for (const pkg of PACKAGES) {
  const m = measure(pkg);
  if (m.missing.length) {
    rows.push({
      name: pkg.name,
      note: 'missing dist entries: ' + m.missing.join(', '),
    });
    // Not a failure in --check mode - the package may not be built yet.
    // The CI job is responsible for running the build first.
    continue;
  }
  next[pkg.name] = { raw: m.raw, gz: m.gz };
  const prev = baseline[pkg.name];
  const delta = prev ? ((m.gz - prev.gz) / prev.gz) * 100 : null;
  rows.push({
    name: pkg.name,
    raw: m.raw,
    gz: m.gz,
    prevGz: prev?.gz,
    delta,
  });
  if (mode === '--check' && prev && delta !== null && delta > DRIFT_TOLERANCE_PCT) {
    failed = true;
  }
}

console.log('\nBundle size report');
console.log('------------------');
for (const row of rows) {
  if (row.note) {
    console.log(`  ${row.name}: ${row.note}`);
    continue;
  }
  const base = row.prevGz != null ? `  (baseline ${fmtKb(row.prevGz)})` : '  (no baseline)';
  const deltaStr = row.delta != null
    ? `  ${row.delta >= 0 ? '+' : ''}${row.delta.toFixed(1)}%`
    : '';
  console.log(`  ${row.name}`);
  console.log(`    raw: ${fmtKb(row.raw)}  gz: ${fmtKb(row.gz)}${base}${deltaStr}`);
}
console.log('');

if (mode === '--update') {
  saveBaseline({ ...baseline, ...next });
  console.log(`Baseline written to ${path.relative(repoRoot, baselinePath)}`);
  process.exit(0);
}

if (failed) {
  console.error(`\nSize regression: a package grew more than ${DRIFT_TOLERANCE_PCT}% gzipped vs baseline.`);
  console.error('Investigate, or if the growth is intentional:');
  console.error('  node scripts/size-check.mjs --update && git add ci/size-baseline.json');
  process.exit(1);
}

process.exit(0);
