import { defineConfig } from 'vite';

// Read version from package.json - using dynamic import
const pkg = await import('./package.json', { with: { type: 'json' } });
const version = pkg.default.version;

export default defineConfig({
  root: '.',
  build: {
    lib: {
      entry: './src/core/index.ts',
      name: 'Spinefolio',
      formats: ['iife'],
      fileName: () => 'spinefolio.js',
    },
    rollupOptions: {
      external: [], // Bundle everything including dependencies
      output: {
        exports: 'named', // Use named exports to avoid default export warning
        // Ensure CSS is extracted to a single file
        assetFileNames: (assetInfo) => {
          if (assetInfo.name === 'style.css') {
            return 'spinefolio.css';
          }
          return assetInfo.name || 'asset';
        },
        globals: {
          'pixi.js': 'PIXI',
          '@esotericsoftware/spine-pixi-v8': 'spine',
        },
      },
    },
    cssCodeSplit: false, // Ensure single CSS file
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: false,
      },
      format: {
        comments: false,
      },
    },
    sourcemap: true,
    outDir: `dist/publish/${version}`,
    emptyOutDir: true,
  },
  css: {
    postcss: {
      plugins: [],
    },
  },
});