// Deja la base de datos de pruebas vacía antes de levantar el servidor.
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url || !/e2e|test/.test(url)) {
  console.error("reset-db: DATABASE_URL debe apuntar a una base de pruebas (su nombre debe incluir e2e o test).");
  process.exit(1);
}
const client = new pg.Client({ connectionString: url });
await client.connect();
await client.query("DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;");
await client.end();
console.log("reset-db: base de pruebas vacía");
