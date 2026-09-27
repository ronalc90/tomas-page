import { sql } from "drizzle-orm";
import { createDb } from "../src/db/client";
import { runMigrations } from "../src/db/migrate";
import { seedContent, seedSettings } from "../src/db/seed";

/** Deja la base de pruebas limpia, migrada y con el contenido del plan. */
export default async function setup() {
  const url = process.env.DATABASE_URL_TEST ?? "postgresql://postgres:postgres@localhost:5432/tomas_test";
  const handle = createDb(url);
  try {
    await handle.db.execute(sql`DROP SCHEMA IF EXISTS public CASCADE`);
    await handle.db.execute(sql`DROP SCHEMA IF EXISTS drizzle CASCADE`);
    await handle.db.execute(sql`CREATE SCHEMA public`);
    await runMigrations(handle.db);
    await seedContent(handle.db);
    await seedSettings(handle.db);
  } finally {
    await handle.close();
  }
}
