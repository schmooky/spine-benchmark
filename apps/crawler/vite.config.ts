import { defineConfig } from 'vite';
import path from 'node:path';

export default defineConfig({
  server: {
    port: 8080,
    open: true,
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
  },
  resolve: {
    alias: {
      '@spine-benchmark/pixi-crawler': path.resolve(
        __dirname,
        '../../packages/pixi-crawler/src/index.ts',
      ),
      '@spine-benchmark/pixi-crawler/core': path.resolve(
        __dirname,
        '../../packages/pixi-crawler/src/core/index.ts',
      ),
      '@spine-benchmark/pixi-crawler/ui': path.resolve(
        __dirname,
        '../../packages/pixi-crawler/src/ui/index.ts',
      ),
    },
  },
});
