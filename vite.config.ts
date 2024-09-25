import { defineConfig, loadEnv } from 'vite';
import { resolve } from 'path'

export default defineConfig(async ({ mode }) => {

  return {
    publicDir: 'assets',
    server: {
      port: 8080,
    },
    build: {
      target: 'esnext',
      rollupOptions: {
        input: {
          main: resolve(__dirname, 'index.html'),
        },
      },
    },
  };
});
