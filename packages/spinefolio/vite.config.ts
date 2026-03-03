import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  build: {
    lib: {
      entry: './src/core/index.ts',
      name: 'Spinefolio',
      formats: ['es', 'iife'],
      fileName: (format) =>
        format === 'es' ? 'spinefolio.module.js' : 'spinefolio.js',
    },
    rollupOptions: {
      external: [],
      output: {
        inlineDynamicImports: true,
        exports: 'named',
        assetFileNames: (assetInfo) =>
          assetInfo.name === 'style.css' ? 'spinefolio.css' : assetInfo.name || 'asset',
        globals: {
          'pixi.js': 'PIXI',
          '@esotericsoftware/spine-pixi-v8': 'spine',
        },
      },
    },
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: false,
      },
    },
    emptyOutDir: false,
    cssCodeSplit: false,
    sourcemap: false,
    outDir: 'dist',
  },
  optimizeDeps: {
    include: ['pixi.js', '@esotericsoftware/spine-pixi-v8'],
  },
  server: { open: false },
  publicDir: 'assets',
});
