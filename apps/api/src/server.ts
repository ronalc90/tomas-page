import { buildApp, VERSION } from "./app";
import { loadConfig } from "./config";
import { createDb } from "./db/client";
import { runMigrations } from "./db/migrate";
import { seedAll } from "./db/seed";

async function main() {
  const config = loadConfig();
  const handle = createDb(config.databaseUrl, config.databaseSsl);

  if (config.autoMigrate) {
    await runMigrations(handle.db, config.migrationsDir);
    const result = await seedAll(handle.db, config);
    console.log(
      JSON.stringify({
        msg: "Base de datos lista",
        contentLoaded: result.content,
        usersCreated: result.createdUsers,
      }),
    );
  }

  const { app } = await buildApp(config, handle.db);

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, "Cerrando el servidor");
    try {
      await app.close();
      await handle.close();
    } finally {
      process.exit(0);
    }
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  await app.listen({ port: config.port, host: config.host });
  app.log.info({ version: VERSION, env: config.env }, "Servidor listo");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
