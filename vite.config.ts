import { defineConfig, loadEnv } from 'vite';

export default defineConfig(async ({ mode }) => {

  return {
    publicDir: 'assets',
    server: {
      port: 8080,
    },
  };
});
