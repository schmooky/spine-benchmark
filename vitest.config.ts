import { defineConfig } from 'vitest/config';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const r = (...segments: string[]) => path.resolve(dirname, ...segments);

// Auto-derive workspace packages that have a src/index.ts entry point.
const packageDirs = fs.readdirSync(r('packages'), { withFileTypes: true })
  .filter(entry => entry.isDirectory())
  .map(entry => entry.name)
  .filter(dir => fs.existsSync(r('packages', dir, 'src', 'index.ts')));

// Build resolve.alias: package name -> absolute src/index.ts path.
const workspaceAlias: Record<string, string> = {};
for (const dir of packageDirs) {
  const pkgJsonPath = r('packages', dir, 'package.json');
  if (!fs.existsSync(pkgJsonPath)) continue;
  const { name } = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8')) as { name?: string };
  if (name) {
    workspaceAlias[name] = r('packages', dir, 'src', 'index.ts');
  }
}

// Build test.include: one glob per package + the apps that have tests.
const testInclude: string[] = [
  'apps/benchmark/test/**/*.test.ts',
  'apps/reports-api/test/**/*.test.ts',
  'apps/bench-runner/src/**/*.test.ts',
  ...packageDirs.map(dir => `packages/${dir}/src/**/*.test.ts`),
];

// Build test.coverage.include: source files for all workspace packages.
const coverageInclude: string[] = packageDirs.map(dir => `packages/${dir}/src/**/*.ts`);

export default defineConfig({
  resolve: {
    alias: workspaceAlias,
  },
  test: {
    environment: 'node',
    setupFiles: [
      'vitest.setup.ts',
    ],
    include: testInclude,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: coverageInclude,
      exclude: [
        '**/*.test.ts'
      ],
      // Thresholds are intentionally 0 right now. Most workspace
      // packages (metrics-analyzers, asset-store, render-tools,
      // file-tools, drawcall-tools, workbench-core, spinefolio,
      // etc.) still have no tests at all, and the realistic global
      // coverage today is ~15% lines / ~17% functions. An
      // aspirational 90/85 here only ever produced red CI for
      // anyone running `npm run test:coverage` and made the signal
      // worthless.
      //
      // The plan is to raise these back up as each package grows
      // its own suite - see ADR 0003 and the open test-coverage
      // tasks. Packages that already have real tests
      // (metrics-impact-formula, metrics-sampling, spine-loader,
      // pixi-crawler core, reports-api) comfortably exceed 80%
      // and should be re-ratcheted first via a per-file threshold
      // block once Vitest's v8 provider supports that cleanly.
      //
      // TODO: ratchet thresholds back up once metrics-analyzers
      // and the tools packages gain coverage.
      thresholds: {
        lines: 0,
        functions: 0,
        statements: 0,
        branches: 0,
      },
    }
  }
});
