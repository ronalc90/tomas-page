import type { SqlResult, SqlValue } from "./types";

/**
 * Calificación de ejercicios SQL. Es una función pura: compara el resultado esperado
 * (el de la solución) con el del estudiante. Se comporta igual que `validar_ejercicio`
 * de scripts/plan.py:
 *
 * - se comparan los valores, no los nombres de las columnas (los alias son libres);
 * - debe coincidir el número de columnas y su orden;
 * - los números se redondean a 2 decimales (y 2.0 cuenta igual que 2);
 * - el orden de las filas importa solo si el ejercicio lo pide (orderMatters).
 */

/** Límites de la ejecución de SQL (servidor y navegador). */
export const SQL_MAX_LENGTH = 20_000;
export const SQL_MAX_ROWS = 1_000;
export const SQL_TIMEOUT_MS = 3_000;
/** Filas del resultado esperado que se muestran al estudiante. */
export const EXPECTED_PREVIEW_ROWS = 50;
/** Intentos necesarios para poder ver la solución. */
export const REVEAL_AFTER_ATTEMPTS = 3;

export interface SqlCompareResult {
  correct: boolean;
  message: string;
  /** Qué falló, para mostrarlo con otro estilo o en las pruebas. */
  reason: "ok" | "no_result" | "columns" | "rows" | "column_order" | "order" | "values";
  /** Fila (desde 1) donde aparece la primera diferencia, si aplica. */
  row?: number;
}

/**
 * Redondea a 2 decimales como `round(x, 2)` de Python: al par más cercano cuando el
 * número está exactamente en la mitad (0.125 → 0.12, 0.375 → 0.38).
 */
export function round2(x: number): number {
  if (!Number.isFinite(x)) return x;
  // Solo los múltiplos impares de 1/8 caen exactamente en la mitad al multiplicar por 100.
  const eighths = x * 8;
  if (Number.isInteger(eighths) && !Number.isInteger(x * 4) && Math.abs(eighths) < 2 ** 50) {
    const k = Math.floor(x * 100);
    const even = k % 2 === 0 ? k : k + 1;
    return even / 100;
  }
  const r = Number(x.toFixed(2));
  return Object.is(r, -0) ? 0 : r;
}

/** Normaliza un valor de SQLite para compararlo. */
export function normalizeSqlValue(value: unknown): SqlValue {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return round2(value);
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") return value;
  if (value instanceof Uint8Array) return Array.from(value, (b) => b.toString(16).padStart(2, "0")).join("");
  return String(value);
}

function rowKey(row: SqlValue[]): string {
  return JSON.stringify(row.map(normalizeSqlValue));
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Cuenta cuántas veces aparece cada fila (para comparar sin importar el orden). */
function multiset(rows: SqlValue[][]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) {
    const k = rowKey(r);
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}

function sameMultiset(a: SqlValue[][], b: SqlValue[][]): boolean {
  if (a.length !== b.length) return false;
  const m = multiset(a);
  for (const r of b) {
    const k = rowKey(r);
    const n = m.get(k) ?? 0;
    if (n === 0) return false;
    m.set(k, n - 1);
  }
  return true;
}

/** Compara el resultado del estudiante con el esperado y explica la primera diferencia. */
export function compareResults(expected: SqlResult, actual: SqlResult | null, orderMatters: boolean): SqlCompareResult {
  if (!actual) {
    return {
      correct: false,
      reason: "no_result",
      message: "Tu SQL no devuelve filas: termina con una consulta SELECT que muestre el resultado.",
    };
  }
  const ec = expected.columns.length;
  const ac = actual.columns.length;
  if (ec !== ac) {
    return {
      correct: false,
      reason: "columns",
      message: `Tu consulta devuelve ${plural(ac, "columna", "columnas")} y se esperaban ${ec}.`,
    };
  }
  const er = expected.rows.length;
  const ar = actual.rows.length;
  if (er !== ar) {
    const tooMany = ar > SQL_MAX_ROWS ? `más de ${SQL_MAX_ROWS.toLocaleString("es-CR")} filas` : plural(ar, "fila", "filas");
    return { correct: false, reason: "rows", message: `Devuelve ${tooMany} y se esperaban ${er}.` };
  }

  const exp = expected.rows.map((r) => r.map(normalizeSqlValue));
  const act = actual.rows.map((r) => r.map(normalizeSqlValue));

  if (sameMultiset(exp, act)) {
    if (!orderMatters) return { correct: true, reason: "ok", message: "¡Correcto!" };
    const firstDiff = act.findIndex((r, i) => rowKey(r) !== rowKey(exp[i]));
    if (firstDiff === -1) return { correct: true, reason: "ok", message: "¡Correcto!" };
    return {
      correct: false,
      reason: "order",
      row: firstDiff + 1,
      message: "Las filas son correctas pero el orden no: revisa ORDER BY.",
    };
  }

  // Mismos datos con las columnas en otro orden: se avisa de forma específica.
  const sortedRow = (r: SqlValue[]) => [...r].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  if (ec > 1 && sameMultiset(exp.map(sortedRow), act.map(sortedRow))) {
    return {
      correct: false,
      reason: "column_order",
      message: "Los datos están, pero las columnas van en otro orden: revisa el orden de las columnas en el SELECT.",
    };
  }

  let row: number;
  if (orderMatters) {
    row = act.findIndex((r, i) => rowKey(r) !== rowKey(exp[i])) + 1;
  } else {
    const remaining = multiset(exp);
    row = 1;
    for (let i = 0; i < act.length; i++) {
      const k = rowKey(act[i]);
      const n = remaining.get(k) ?? 0;
      if (n === 0) {
        row = i + 1;
        break;
      }
      remaining.set(k, n - 1);
    }
  }
  return { correct: false, reason: "values", row, message: `Los valores no coinciden: revisa la fila ${row}.` };
}

/** Recorta un resultado a las primeras `max` filas. */
export function previewResult(result: SqlResult, max = EXPECTED_PREVIEW_ROWS): SqlResult {
  return { columns: result.columns, rows: result.rows.slice(0, max) };
}

/** Quita los comentarios `--` y `/* *\/` y los espacios de un SQL (para saber si está vacío o qué tipo de sentencia es). */
export function stripSqlComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ")
    .trim();
}

/** INSERT, UPDATE, DELETE o REPLACE (las que cuentan "filas modificadas"). */
export function isDataChange(statement: string): boolean {
  return /^(with\b[\s\S]*?\)\s*)?(insert|update|delete|replace)\b/i.test(stripSqlComments(statement));
}
