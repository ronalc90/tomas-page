/// <reference types="vitest/config" />
import { copyFileSync, existsSync } from "node:fs";
import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

/**
 * GitHub Pages no conoce las rutas de la aplicación: al abrir /tomas-page/dia/2026-10-05
 * sirve 404.html. Copiamos index.html como 404.html para que la aplicación cargue igual.
 */
function spaFallback(): Plugin {
  let outDir = "dist";
  return {
    name: "spa-fallback-404",
    apply: "build",
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const index = path.join(outDir, "index.html");
      if (existsSync(index)) copyFileSync(index, path.join(outDir, "404.html"));
    },
  };
}

export default defineConfig({
  base: process.env.VITE_BASE ?? "/",
  plugins: [react(), ...(process.env.VITE_DATA_MODE === "local" ? [spaFallback()] : [])],
  server: {
    port: 5173,
    proxy: { "/api": { target: process.env.API_URL ?? "http://localhost:3000", changeOrigin: false } },
  },
  build: {
    outDir: "dist",
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom", "react-router"],
          query: ["@tanstack/react-query"],
          highlight: ["highlight.js/lib/core"],
        },
      },
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
    css: false,
  },
});
