import { explainSqlError } from "@tomas/shared";
import { Icon } from "../components/Icon";
import type { RunResponse } from "./protocol";
import { ResultTable, rowsLabel } from "./ResultTable";

export function formatMs(ms: number): string {
  return ms < 10 ? `${ms.toFixed(1)} ms` : `${Math.round(ms).toLocaleString("es-CR")} ms`;
}

/** Error de SQLite: explicación en español y el mensaje original. */
export function SqlErrorBox({ error, statement, total }: { error: string; statement?: number; total?: number }) {
  const e = explainSqlError(error);
  return (
    <div className="sql-error" role="alert">
      <Icon name="alert" size={20} />
      <div>
        <p className="sql-error-title">{e.message}</p>
        <p className="sql-error-original">
          <span>SQLite{statement && total && total > 1 ? ` · sentencia ${statement}` : ""}:</span> <code>{e.original}</code>
        </p>
      </div>
    </div>
  );
}

/** Resumen de una ejecución: "8 filas · 2 ms · 3 filas modificadas". */
export function runSummary(res: RunResponse): string {
  if (!res.ok) return `Error · ${formatMs(res.ms)}`;
  const parts: string[] = [];
  if (res.result) parts.push(rowsLabel(res.result.rowCount));
  if (res.changes > 0 || (!res.result && res.statements > 0)) {
    parts.push(`${res.changes.toLocaleString("es-CR")} ${res.changes === 1 ? "fila modificada" : "filas modificadas"}`);
  }
  parts.push(formatMs(res.ms));
  return parts.join(" · ");
}

/** El resultado de correr un script: tabla, filas modificadas o error. */
export function RunOutput({ res, label, compact = false, max }: { res: RunResponse; label: string; compact?: boolean; max?: number }) {
  if (!res.ok) {
    if (res.phase === "setup") {
      return <SqlErrorBox error={`No se pudo preparar el ejercicio: ${res.error}`} />;
    }
    return <SqlErrorBox error={res.error} statement={res.statement} />;
  }
  return (
    <div className="run-output">
      {res.result ? (
        <ResultTable columns={res.result.columns} rows={res.result.rows} rowCount={res.result.rowCount} label={label} compact={compact} max={max} />
      ) : (
        <p className="run-note">
          <Icon name="check" size={16} />{" "}
          {res.statements === 0
            ? "No hay nada que ejecutar: escribe una consulta."
            : `Listo. ${res.changes.toLocaleString("es-CR")} ${res.changes === 1 ? "fila modificada" : "filas modificadas"}${res.statements > 1 ? ` en ${res.statements} sentencias` : ""}.`}
        </p>
      )}
      {res.checkResult && (
        <div className="stack tight">
          <p className="muted small">Así queda después de tu SQL (la comprobación del ejercicio):</p>
          <ResultTable columns={res.checkResult.columns} rows={res.checkResult.rows} rowCount={res.checkResult.rowCount} label={`${label}: comprobación`} compact />
        </div>
      )}
    </div>
  );
}
