import { defineConfig } from "vite";
import path from "node:path";

// The demo is self-contained (no external assets). We alias the crawler package
// to its source so edits show up without a rebuild.
export default defineConfig({
  base: "./",
  server: {
    port: 8080,
    open: true,
  },
  build: {
    target: "es2022",
    outDir: "dist",
  },
  resolve: {
    alias: {
      "@spine-benchmark/pixi-crawler": path.resolve(
        __dirname,
        "../../packages/pixi-crawler/src/index.ts",
      ),
    },
  },
});
