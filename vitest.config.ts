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
      thresholds: {
        lines: 90,
        functions: 90,
        statements: 90,
        branches: 85
      }
    }
  }
});
