import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { viteStaticCopy } from "vite-plugin-static-copy";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        {
          src: "stats.js", // Or wherever your stats.js is
          dest: "", // '' means place it in root of dist/
        },
      ],
    }),
  ],
  server: {
    port: 3000,
    host: true, // Listen on all addresses
    open: true, // Auto-open browser
  },
  build: {
    outDir: "dist",
    sourcemap: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  optimizeDeps: {
    include: [
      "@esotericsoftware/spine-pixi-v8",
      "pixi.js",
      "gsap",
      "@paralleldrive/cuid2",
    ],
  },
});
