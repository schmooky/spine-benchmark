import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import path from 'node:path';

// The crawler demo loads real Spine skeletons at runtime so users can see
// the issue overlay light up against an actual scene. Rather than vendor
// the assets twice, we copy them out of `packages/spinefolio/assets` at
// dev / build time. If you want to add more assets later, drop them into
// `apps/crawler/public/assets/user/` (committed alongside the demo) or
// extend the targets array below to pull from another workspace package.

const spinefolioAssets = path.resolve(__dirname, '../../packages/spinefolio/assets');

export default defineConfig({
  server: {
    port: 8080,
    open: true,
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
  },
  plugins: [
    viteStaticCopy({
      targets: [
        {
          src: path.join(spinefolioAssets, 'spineboy/*'),
          dest: 'assets/spineboy',
        },
        {
          src: path.join(spinefolioAssets, 'high*'),
          dest: 'assets',
        },
        {
          src: path.join(spinefolioAssets, 'low*'),
          dest: 'assets',
        },
        {
          src: path.join(spinefolioAssets, 'scatter.json'),
          dest: 'assets',
        },
      ],
    }),
  ],
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
      '@spine-benchmark/metrics-impact-formula': path.resolve(
        __dirname,
        '../../packages/metrics-impact-formula/src/index.ts',
      ),
    },
  },
});
