import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    server: "src/server.ts",
    migrate: "src/cli/migrate.ts",
    seed: "src/cli/seed.ts",
  },
  format: ["esm"],
  target: "node20",
  platform: "node",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  splitting: true,
  // El paquete compartido es TypeScript sin compilar: se incluye en el bundle.
  noExternal: ["@tomas/shared"],
});
