import { defineConfig, loadEnv } from "vite";
import { resolve } from "path";
import mdPlugin, { Mode } from 'vite-plugin-markdown';

export default defineConfig(async ({ mode }) => {
  return {
    publicDir: "assets",
    server: {
      port: 8080,
    },

    plugins: [mdPlugin({mode: Mode.HTML as any})],
    build: {
      minify: false,
      minifyIdentifiers: false,
      minifySyntax: false,
      minifyWhitespace: false,
      target: "esnext",
      rollupOptions: {
        input: {
          main: resolve(__dirname, "index.html"),
        },
      },
    },
  };
});
