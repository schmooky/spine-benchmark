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
          src: "assets/favicon-96x96.png",
          dest: "",
        },
        {
          src: "assets/favicon.svg",
          dest: "",
        },
        {
          src: "assets/favicon.ico",
          dest: "",
        },
        {
          src: "assets/apple-touch-icon.png",
          dest: "",
        },
        {
          src: "assets/site.webmanifest",
          dest: "",
        },
        {
          src: "assets/web-app-manifest-192x192.png",
          dest: "",
        },
        {
          src: "assets/web-app-manifest-512x512.png",
          dest: "",
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
    ],
    exclude: [
      "@spine-benchmark/render-tools",
      "@spine-benchmark/spine-loader",
      "@spine-benchmark/metrics-reporting",
    ],
  },
});
