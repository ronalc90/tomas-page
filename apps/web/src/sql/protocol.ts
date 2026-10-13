import type { SqlValue } from "@tomas/shared";

/** Mensajes entre la página y el worker de SQL (sql.js en el navegador). */

export interface RunRequest {
  /** "lab": la base del laboratorio (los cambios se quedan). "clean": una copia limpia para este trabajo. */
  mode: "lab" | "clean";
  sql: string;
  setup?: string;
  check?: string;
}

export interface TableResult {
  columns: string[];
  rows: SqlValue[][];
  /** Filas totales (rows trae como máximo SQL_MAX_ROWS). */
  rowCount: number;
}

export interface RunSuccess {
  ok: true;
  /** La última sentencia que devuelve filas (null si ninguna devuelve filas). */
  result: TableResult | null;
  /** En los ejercicios que modifican datos: cómo queda la tabla después (el `check`). */
  checkResult: TableResult | null;
  /** Filas modificadas por INSERT, UPDATE y DELETE en todo el script. */
  changes: number;
  statements: number;
  ms: number;
}

export interface RunFailure {
  ok: false;
  error: string;
  /** Número (desde 1) de la sentencia que falló. */
  statement: number;
  phase: "setup" | "sql" | "check";
  ms: number;
}

export type RunResponse = RunSuccess | RunFailure;

export interface SchemaColumn {
  name: string;
  type: string;
  pk: boolean;
  notNull: boolean;
  /** "tabla.columna" a la que apunta, si es llave foránea. */
  references: string | null;
}

export interface SchemaTable {
  name: string;
  kind: "table" | "view";
  rowCount: number;
  columns: SchemaColumn[];
}

export type WorkerRequest =
  | ({ id: number; type: "run" } & RunRequest)
  | { id: number; type: "reset" }
  | { id: number; type: "export" }
  | { id: number; type: "schema" };

export type WorkerResponse =
  | { id: number; type: "run"; response: RunResponse }
  | { id: number; type: "reset" }
  | { id: number; type: "export"; bytes: Uint8Array }
  | { id: number; type: "schema"; tables: SchemaTable[] }
  | { id: number; type: "error"; error: string };
