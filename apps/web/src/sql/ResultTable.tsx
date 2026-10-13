import { useSyncExternalStore } from "react";
import { SQL_MAX_ROWS, type SqlValue } from "@tomas/shared";
import type { SqlEngine } from "./engine";

function isNumeric(rows: SqlValue[][], col: number): boolean {
  let any = false;
  for (const r of rows) {
    const v = r[col];
    if (v === null) continue;
    if (typeof v !== "number") return false;
    any = true;
  }
  return any;
}

export function Cell({ value }: { value: SqlValue }) {
  if (value === null) return <span className="null">NULL</span>;
  if (value === "") return <span className="empty-text">(vacío)</span>;
  return <>{String(value)}</>;
}

/**
 * Tabla de resultados: NULL con otro estilo, números a la derecha y encabezado fijo.
 * Muestra como máximo `max` filas; `rowCount` dice cuántas devolvió en total.
 */
export function ResultTable({
  columns,
  rows,
  rowCount,
  max = SQL_MAX_ROWS,
  label,
  compact = false,
}: {
  columns: string[];
  rows: SqlValue[][];
  rowCount?: number;
  max?: number;
  label: string;
  compact?: boolean;
}) {
  const shown = rows.slice(0, max);
  const numeric = columns.map((_, i) => isNumeric(shown, i));
  const total = rowCount ?? rows.length;
  return (
    <div className={`result-table ${compact ? "compact" : ""}`}>
      <div className="result-scroll" tabIndex={0} role="region" aria-label={label}>
        <table>
          <thead>
            <tr>
              <th scope="col" className="rownum" aria-label="Fila">
                #
              </th>
              {columns.map((c, i) => (
                <th key={i} scope="col" className={numeric[i] ? "num" : undefined}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((r, i) => (
              <tr key={i}>
                <td className="rownum">{i + 1}</td>
                {r.map((v, k) => (
                  <td key={k} className={numeric[k] ? "num" : undefined}>
                    <Cell value={v} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {shown.length === 0 && <p className="result-empty">La consulta no devolvió filas.</p>}
      </div>
      {total > shown.length && (
        <p className="result-more">
          Se muestran {shown.length.toLocaleString("es-CR")} de {total.toLocaleString("es-CR")} filas.
        </p>
      )}
    </div>
  );
}

export function rowsLabel(n: number): string {
  return `${n.toLocaleString("es-CR")} ${n === 1 ? "fila" : "filas"}`;
}

/** true mientras el motor tenga algo corriendo. */
export function useEngineBusy(engine: SqlEngine): boolean {
  return useSyncExternalStore(
    (cb) => engine.subscribe(cb),
    () => engine.busy > 0,
    () => false,
  );
}
