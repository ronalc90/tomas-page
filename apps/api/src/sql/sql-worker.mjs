// Ejecuta SQL con sql.js (SQLite en WebAssembly, el mismo motor del navegador) en un hilo aparte.
// Es JavaScript sin compilar a propósito: el servidor lo carga igual en desarrollo, en las pruebas
// y en producción (tsup lo copia a dist). Si una consulta tarda demasiado, el hilo principal
// termina este worker y crea otro.
import { parentPort, workerData } from "node:worker_threads";
import initSqlJs from "sql.js";

const SQL = await initSqlJs();
const base = new SQL.Database();
base.exec(workerData.schemaSql);
// Cada trabajo empieza con una copia limpia de la base.
const template = base.export();
base.close();

function cell(value) {
  if (value instanceof Uint8Array) return Array.from(value, (b) => b.toString(16).padStart(2, "0")).join("");
  if (typeof value === "bigint") return Number(value);
  return value ?? null;
}

/** Corre un script y devuelve la última sentencia que devuelve filas (o null). */
function runScript(db, sql, maxRows) {
  let last = null;
  for (const stmt of db.iterateStatements(sql)) {
    const columns = stmt.getColumnNames();
    if (columns.length > 0) {
      const rows = [];
      let truncated = false;
      while (stmt.step()) {
        if (rows.length >= maxRows) {
          // Una fila de más basta para saber que se pasó del límite.
          rows.push(stmt.get().map(cell));
          truncated = true;
          break;
        }
        rows.push(stmt.get().map(cell));
      }
      last = { columns, rows, truncated };
    } else {
      while (stmt.step()) {
        /* sentencias sin resultado */
      }
    }
  }
  return last;
}

parentPort.on("message", (job) => {
  const db = new SQL.Database(template);
  let phase = "setup";
  try {
    if (job.setup) runScript(db, job.setup, job.maxRows);
    phase = "sql";
    let result = runScript(db, job.sql, job.maxRows);
    if (job.check) {
      phase = "check";
      result = runScript(db, job.check, job.maxRows);
    }
    parentPort.postMessage({ id: job.id, ok: true, result });
  } catch (err) {
    parentPort.postMessage({ id: job.id, ok: false, phase, error: err instanceof Error ? err.message : String(err) });
  } finally {
    db.close();
  }
});

parentPort.postMessage({ ready: true });
