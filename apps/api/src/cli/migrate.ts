import { loadConfig } from "../config";
import { createDb } from "../db/client";
import { runMigrations } from "../db/migrate";

/** npm run db:migrate */
const config = loadConfig();
const handle = createDb(config.databaseUrl, config.databaseSsl);
try {
  await runMigrations(handle.db, config.migrationsDir);
  console.log("Migraciones aplicadas.");
} finally {
  await handle.close();
}
