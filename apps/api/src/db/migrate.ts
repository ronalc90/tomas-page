import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import type { Database } from "./client";

/** Busca la carpeta de migraciones tanto en desarrollo (src) como en producción (dist). */
export function resolveMigrationsDir(explicit?: string): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    explicit,
    path.resolve(process.cwd(), "drizzle"),
    path.resolve(process.cwd(), "apps/api/drizzle"),
    path.resolve(here, "../drizzle"),
    path.resolve(here, "../../drizzle"),
  ].filter((p): p is string => Boolean(p));
  const found = candidates.find((p) => existsSync(path.join(p, "meta", "_journal.json")));
  if (!found) throw new Error(`No se encontró la carpeta de migraciones. Probé: ${candidates.join(", ")}`);
  return found;
}

export async function runMigrations(db: Database, dir?: string): Promise<void> {
  await migrate(db, { migrationsFolder: resolveMigrationsDir(dir) });
}
