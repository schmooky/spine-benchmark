#!/usr/bin/env node
/**
 * check-no-duplicate-impact-formulas
 *
 * Guards against the RI / CI scoring constants ever being copied back into
 * a second source file. The single source of truth is
 *
 *     packages/metrics-impact-formula/src/index.ts
 *
 * Anything that needs to score Spine impact must import from
 * `@spine-benchmark/metrics-impact-formula` instead of redefining the
 * weights inline. If this script ever fails, do NOT add to the allowlist
 * lightly: the duplication is exactly the bug class this script exists to
 * prevent (heatmap and crawler producing different numbers for the same
 * skeleton because someone tweaked one copy of the formula).
 *
 * Detection strategy: rather than greping for individual magic numbers
 * (which false-positives on UI alpha values, easing factors, etc.) we
 * look for two highly-specific multi-token signatures that only appear in
 * the canonical RI / CI math.
 *
 * Run via `npm run check:no-duplicate-formulas` or as part of `npm test`.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

// Files allowed to spell the canonical numbers out. Keep this list small.
// New entries need a justification in the PR.
const ALLOWLIST = new Set([
  // The single canonical owner of the formulas.
  'packages/metrics-impact-formula/src/index.ts',
  'packages/metrics-impact-formula/src/index.test.ts',
  // The crawler test file independently re-derives the formula values to
  // assert that the analyzer's adapter wires up the right inputs. The
  // numbers are intentional sanity checks, not a duplicated implementation.
  'packages/pixi-crawler/src/core/__tests__/spine-analyzer.test.ts',
  // Likewise, the offline reporter's test file may exercise the formula.
  'packages/metrics-reporting/src/impactReportModel.test.ts',
  // The guard script itself spells the canonical numbers in its regex.
  'scripts/check-no-duplicate-impact-formulas.mjs',
]);

/**
 * Two distinctive signatures of the canonical math. Either match means a
 * file is reimplementing scoring math that should live in the leaf package.
 *
 *   1. The mesh weight clamps:
 *        Math.min(0.5, ... / 500)  ... Math.min(0.55, ... / 450)
 *      These two expressions, in combination, are unique to the CI formula
 *      and will not appear in unrelated code.
 *
 *   2. The constraint weight signature:
 *        ... * 0.7 ... * 0.55 ... * 0.35 ... * 0.2
 *      Four constraint weights in canonical order in close proximity.
 */
const MESH_CLAMP_SIGNATURE =
  /Math\.min\(\s*0\.5\s*,[\s\S]{0,120}\/\s*500\b[\s\S]{0,400}Math\.min\(\s*0\.55\s*,[\s\S]{0,120}\/\s*450\b/;

const CONSTRAINT_WEIGHT_SIGNATURE =
  /\*\s*0\.7\b[\s\S]{0,300}\*\s*0\.55\b[\s\S]{0,300}\*\s*0\.35\b[\s\S]{0,300}\*\s*0\.2\b/;

/**
 *   3. A local pose-feature walk (the ADR 0002 input-drift bug class): the
 *      `worldVerticesLength / 2` vertex-counting idiom outside the canonical
 *      walker means someone is re-implementing feature extraction. Four
 *      copies of that walk once drifted apart - two of them silently dropped
 *      every region/sequence vertex from the fitted model's TRAINING data.
 *      Use extractPoseFeatures / poseImpact from
 *      `@spine-benchmark/metrics-impact-formula` instead.
 */
const POSE_WALK_SIGNATURE = /worldVerticesLength[^;\n]{0,40}\/\s*2\b/;

// Files allowed to touch worldVerticesLength/2 for reasons that are NOT
// impact-feature extraction (rendering/geometry code needs vertex counts too).
const POSE_WALK_ALLOWLIST = new Set([
  // the canonical walker + its coverage estimator and tests
  'packages/metrics-impact-formula/src/poseFeatures.ts',
  'packages/metrics-impact-formula/src/coverageEstimate.ts',
  'packages/metrics-impact-formula/src/poseFeatures.test.ts',
  // the crawler duck-types spine for its own workload counters (P3: cut over)
  'packages/pixi-crawler/src/features/spine/collector.ts',
  'packages/pixi-crawler/src/features/spine/types.ts',
  // structural/display analyzers: per-attachment vertex DETAIL for the UI
  // (mesh list, clipping report, overlay drawing), not impact features
  'packages/metrics-analyzers/src/meshAnalyzer.ts',
  'packages/metrics-analyzers/src/clippingAnalyzer.ts',
  'apps/benchmark/src/entities/skeleton/lib/overlays.ts',
  'scripts/check-no-duplicate-impact-formulas.mjs',
]);

/** Recursively walk the workspace, skipping node_modules / dist / .git. */
async function* walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      if (entry.name === 'dist') continue;
      if (entry.name === '.git') continue;
      if (entry.name === 'coverage') continue;
      yield* walk(full);
    } else if (entry.isFile() && /\.(ts|tsx|mjs|cjs|js)$/.test(entry.name)) {
      yield full;
    }
  }
}

async function main() {
  const offenders = [];

  for await (const file of walk(repoRoot)) {
    const rel = relative(repoRoot, file).split(sep).join('/');
    if (ALLOWLIST.has(rel)) continue;

    const text = await readFile(file, 'utf8');
    const matches = [];
    if (MESH_CLAMP_SIGNATURE.test(text)) matches.push('mesh-clamp');
    if (CONSTRAINT_WEIGHT_SIGNATURE.test(text)) matches.push('constraint-weights');
    if (!POSE_WALK_ALLOWLIST.has(rel) && POSE_WALK_SIGNATURE.test(text)) {
      matches.push('local-pose-walk (use extractPoseFeatures)');
    }
    if (matches.length > 0) {
      offenders.push({ rel, matches });
    }
  }

  if (offenders.length === 0) {
    console.log('check-no-duplicate-impact-formulas: OK');
    process.exit(0);
  }

  console.error('check-no-duplicate-impact-formulas: duplication detected');
  console.error('');
  console.error('The following files contain the canonical RI / CI scoring math');
  console.error('but are not the canonical owner:');
  console.error('');
  for (const off of offenders) {
    console.error(`  ${off.rel}`);
    for (const m of off.matches) {
      console.error(`     signature: ${m}`);
    }
  }
  console.error('');
  console.error('Fix: import from @spine-benchmark/metrics-impact-formula instead');
  console.error('of inlining the weights. The whole point of that package is to');
  console.error('keep the heatmap, the crawler, and the offline benchmark in');
  console.error('exact numerical agreement.');
  process.exit(1);
}

main().catch((err) => {
  console.error('check-no-duplicate-impact-formulas: crashed');
  console.error(err);
  process.exit(2);
});
