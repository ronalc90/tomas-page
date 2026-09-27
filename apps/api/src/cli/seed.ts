import { loadConfig } from "../config";
import { createDb } from "../db/client";
import { seedAll } from "../db/seed";

/** npm run db:seed [-- --reset-content] */
const config = loadConfig();
const handle = createDb(config.databaseUrl, config.databaseSsl);
try {
  const result = await seedAll(handle.db, config, { resetContent: process.argv.includes("--reset-content") });
  console.log(
    `Contenido ${result.content ? "cargado" : "ya existía"}. Usuarios creados: ${result.createdUsers.join(", ") || "ninguno"}.`,
  );
} finally {
  await handle.close();
}
