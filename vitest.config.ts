import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const r = (...segments: string[]) => path.resolve(dirname, ...segments);

export default defineConfig({
  resolve: {
    alias: {
      '@spine-benchmark/metrics': r('packages/metrics/src/index.ts'),
      '@spine-benchmark/metrics-factors': r('packages/metrics-factors/src/index.ts'),
      '@spine-benchmark/metrics-scoring': r('packages/metrics-scoring/src/index.ts'),
      '@spine-benchmark/metrics-sampling': r('packages/metrics-sampling/src/index.ts'),
      '@spine-benchmark/metrics-analyzers': r('packages/metrics-analyzers/src/index.ts'),
      '@spine-benchmark/metrics-pipeline': r('packages/metrics-pipeline/src/index.ts'),
      '@spine-benchmark/metrics-reporting': r('packages/metrics-reporting/src/index.ts')
    }
  },
  test: {
    environment: 'node',
    include: [
      'packages/metrics-factors/src/**/*.test.ts',
      'packages/metrics-scoring/src/**/*.test.ts',
      'packages/metrics-pipeline/src/**/*.test.ts',
      'packages/metrics-reporting/src/**/*.test.ts',
      'packages/constraint-tools/src/**/*.test.ts'
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: [
        'packages/metrics-factors/src/**/*.ts',
        'packages/metrics-scoring/src/**/*.ts',
        'packages/metrics-pipeline/src/**/*.ts',
        'packages/metrics-reporting/src/**/*.ts'
      ],
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
