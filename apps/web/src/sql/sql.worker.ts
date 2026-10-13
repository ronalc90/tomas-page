/// <reference lib="webworker" />
/**
 * SQLite (sql.js) en un Web Worker: la página no se congela con una consulta pesada y el botón
 * "Detener" puede terminar el worker. Es el mismo motor que usa el servidor para calificar.
 */
import initSqlJs, { type Database, type SqlJsStatic } from "sql.js";
import wasmUrl from "sql.js/dist/sql-wasm.wasm?url";
import tienda from "@tomas/shared/tienda.sql?raw";
// Solo el módulo de SQL del paquete compartido: así el worker no carga zod ni el resto.
import { isDataChange, SQL_MAX_ROWS } from "@tomas/shared/sqlcheck";
import type { SqlValue } from "@tomas/shared";
import type { RunRequest, RunResponse, SchemaTable, TableResult, WorkerRequest, WorkerResponse } from "./protocol";

declare const self: DedicatedWorkerGlobalScope;

let SQL: SqlJsStatic;
let template: Uint8Array;
let lab: Database;

const ready = (async () => {
  SQL = await initSqlJs({ locateFile: () => wasmUrl });
  const db = new SQL.Database();
  db.exec(tienda);
  template = db.export();
  db.close();
  lab = new SQL.Database(template);
})();

function cell(value: unknown): SqlValue {
  if (value instanceof Uint8Array) return Array.from(value, (b) => b.toString(16).padStart(2, "0")).join("");
  if (value === undefined) return null;
  return value as SqlValue;
}

class StatementError extends Error {
  constructor(
    message: string,
    public readonly statement: number,
  ) {
    super(message);
  }
}

/** Corre un script completo: devuelve la última sentencia con filas y cuántas filas se modificaron. */
function runScript(db: Database, sql: string): { result: TableResult | null; changes: number; statements: number } {
  let result: TableResult | null = null;
  let changes = 0;
  let n = 0;
  try {
    for (const stmt of db.iterateStatements(sql)) {
      n += 1;
      const columns = stmt.getColumnNames();
      if (columns.length > 0) {
        const rows: SqlValue[][] = [];
        let count = 0;
        while (stmt.step()) {
          count += 1;
          if (rows.length < SQL_MAX_ROWS) rows.push(stmt.get().map(cell));
        }
        result = { columns, rows, rowCount: count };
      } else {
        while (stmt.step()) {
          /* sin resultado */
        }
        if (isDataChange(stmt.getSQL())) changes += db.getRowsModified();
      }
    }
  } catch (err) {
    throw new StatementError(err instanceof Error ? err.message : String(err), Math.max(1, n));
  }
  return { result, changes, statements: n };
}

function run(req: RunRequest): RunResponse {
  const start = performance.now();
  const db = req.mode === "lab" ? lab : new SQL.Database(template);
  let phase: "setup" | "sql" | "check" = "setup";
  try {
    if (req.setup) runScript(db, req.setup);
    phase = "sql";
    const main = runScript(db, req.sql);
    let checkResult: TableResult | null = null;
    if (req.check) {
      phase = "check";
      checkResult = runScript(db, req.check).result;
    }
    return { ok: true, result: main.result, checkResult, changes: main.changes, statements: main.statements, ms: performance.now() - start };
  } catch (err) {
    const e = err as StatementError;
    return { ok: false, error: e.message, statement: e.statement ?? 1, phase, ms: performance.now() - start };
  } finally {
    if (db !== lab) db.close();
  }
}

function schema(): SchemaTable[] {
  const objects = lab.exec("SELECT name, type FROM sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%' ORDER BY type, rowid");
  const list = (objects[0]?.values ?? []) as [string, string][];
  return list.map(([name, kind]) => {
    const q = name.replace(/"/g, '""');
    const info = (lab.exec(`PRAGMA table_info("${q}")`)[0]?.values ?? []) as [number, string, string, number, unknown, number][];
    const fks = (lab.exec(`PRAGMA foreign_key_list("${q}")`)[0]?.values ?? []) as unknown[][];
    const refs = new Map(fks.map((f) => [String(f[3]), `${f[2]}.${f[4] ?? "id"}`]));
    let rowCount = 0;
    try {
      rowCount = Number(lab.exec(`SELECT count(*) FROM "${q}"`)[0]?.values[0]?.[0] ?? 0);
    } catch {
      rowCount = 0;
    }
    return {
      name,
      kind: kind === "view" ? "view" : "table",
      rowCount,
      columns: info.map(([, col, type, notNull, , pk]) => ({
        name: col,
        type: type || "",
        pk: pk > 0,
        notNull: notNull === 1,
        references: refs.get(col) ?? null,
      })),
    };
  });
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const msg = event.data;
  const reply = (r: WorkerResponse, transfer: Transferable[] = []) => self.postMessage(r, transfer);
  try {
    await ready;
    switch (msg.type) {
      case "run":
        reply({ id: msg.id, type: "run", response: run(msg) });
        break;
      case "reset":
        lab.close();
        lab = new SQL.Database(template);
        reply({ id: msg.id, type: "reset" });
        break;
      case "export": {
        const bytes = lab.export();
        reply({ id: msg.id, type: "export", bytes }, [bytes.buffer]);
        break;
      }
      case "schema":
        reply({ id: msg.id, type: "schema", tables: schema() });
        break;
    }
  } catch (err) {
    reply({ id: msg.id, type: "error", error: err instanceof Error ? err.message : String(err) });
  }
};
