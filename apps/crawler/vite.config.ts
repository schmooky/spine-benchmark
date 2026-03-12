import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 8080,
    open: true,
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
  },
});
