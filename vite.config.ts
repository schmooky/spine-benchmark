import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    host: true, // Listen on all addresses
    open: true, // Auto-open browser
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    minify: 'terser',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  optimizeDeps: {
    include: [
      '@esotericsoftware/spine-pixi-v8',
      'pixi.js',
      'gsap',
      '@paralleldrive/cuid2',
    ],
  },
});