import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  build: {
    lib: {
      entry: './src/core/spinefolio-auto.ts',
      name: 'Spinefolio',
      formats: ['es', 'iife'],
      fileName: (format) =>
        format === 'es' ? 'spinefolio-auto.module.js' : 'spinefolio-auto.js',
    },
    rollupOptions: {
      external: [],
      output: {
        inlineDynamicImports: true,
        exports: 'named',
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
    sourcemap: false,
    outDir: 'dist',
  },
  optimizeDeps: {
    include: ['pixi.js', '@esotericsoftware/spine-pixi-v8'],
  },
  publicDir: 'assets',
});
