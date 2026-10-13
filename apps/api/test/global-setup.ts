import { sql } from "drizzle-orm";
import { createDb } from "../src/db/client";
import { runMigrations } from "../src/db/migrate";
import { loadPlan, seedContent, seedSettings } from "../src/db/seed";
import { FIXTURE_PLAN } from "./fixture";

/** Deja la base de pruebas limpia, migrada y con el plan de prueba (fixtures/plan.json). */
export default async function setup() {
  const url = process.env.DATABASE_URL_TEST ?? "postgresql://postgres:postgres@localhost:5432/tomas_test";
  const handle = createDb(url);
  try {
    await handle.db.execute(sql`DROP SCHEMA IF EXISTS public CASCADE`);
    await handle.db.execute(sql`DROP SCHEMA IF EXISTS drizzle CASCADE`);
    await handle.db.execute(sql`CREATE SCHEMA public`);
    await runMigrations(handle.db);
    await seedContent(handle.db, { plan: loadPlan(FIXTURE_PLAN) });
    await seedSettings(handle.db);
  } finally {
    await handle.close();
  }
}
