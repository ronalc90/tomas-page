import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { Icon } from "../components/Icon";
import { useToast } from "../components/Toast";
import { Modal, PageHeader } from "../components/ui";
import { labEngine, StoppedError } from "../sql/engine";
import type { RunResponse, SchemaTable } from "../sql/protocol";
import { useEngineBusy } from "../sql/ResultTable";
import { RunOutput, runSummary } from "../sql/RunOutput";
import { SqlEditor } from "../sql/SqlEditor";

const DRAFT_KEY = "tp-lab-sql";
const HISTORY_KEY = "tp-lab-history";
const HISTORY_MAX = 20;
const DEFAULT_SQL = "-- Escribe tu consulta y presiona Ctrl + Enter\nSELECT nombre, precio\nFROM productos\nORDER BY precio DESC\nLIMIT 10;";

interface HistoryItem {
  sql: string;
  at: string;
  ok: boolean;
  stopped?: boolean;
}

function readSession(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeSession(key: string, value: string) {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    /* sin almacenamiento: el borrador dura mientras la página esté abierta */
  }
}

function readHistory(): HistoryItem[] {
  try {
    const raw = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]") as unknown;
    return Array.isArray(raw) ? (raw.filter((x) => x && typeof x.sql === "string") as HistoryItem[]).slice(0, HISTORY_MAX) : [];
  } catch {
    return [];
  }
}

function saveHistory(items: HistoryItem[]) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, HISTORY_MAX)));
  } catch {
    /* sin almacenamiento: el historial dura solo esta visita */
  }
}

// El último resultado sobrevive a cambiar de página (igual que la base del laboratorio).
let lastRun: { res: RunResponse; sql: string } | null = null;

function TableExplorer({ tables, onPick }: { tables: SchemaTable[]; onPick: (name: string) => void }) {
  if (!tables.length) return <p className="muted small">Cargando las tablas…</p>;
  return (
    <ul className="explorer">
      {tables.map((t) => (
        <li key={t.name}>
          <details>
            <summary>
              <Icon name="right" size={14} />
              <span className="explorer-name">{t.name}</span>
              <span className="explorer-count">{t.kind === "view" ? "vista" : t.rowCount.toLocaleString("es-CR")}</span>
            </summary>
            <ul className="explorer-cols">
              {t.columns.map((c) => (
                <li key={c.name}>
                  <span className="col-name">{c.name}</span>
                  <span className="col-type">{c.type || "–"}</span>
                  {c.pk && (
                    <span className="key pk" title="Clave primaria">
                      PK
                    </span>
                  )}
                  {c.references && (
                    <span className="key fk" title={`Llave foránea: apunta a ${c.references}`}>
                      FK → {c.references}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </details>
          <button type="button" className="btn ghost small explorer-peek" onClick={() => onPick(t.name)} aria-label={`Ver 10 filas de ${t.name}`} title={`SELECT * FROM ${t.name} LIMIT 10`}>
            <Icon name="eye" size={16} />
          </button>
        </li>
      ))}
    </ul>
  );
}

export function LabPage() {
  const engine = labEngine();
  const busy = useEngineBusy(engine);
  const toast = useToast();
  const location = useLocation();
  const navigate = useNavigate();
  const helpId = useId();
  const [sql, setSql] = useState(() => readSession(DRAFT_KEY) ?? DEFAULT_SQL);
  const [run, setRun] = useState(lastRun);
  const [tables, setTables] = useState<SchemaTable[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>(readHistory);
  const [panel, setPanel] = useState<"tablas" | "historial">("tablas");
  const [confirmReset, setConfirmReset] = useState(false);
  const [stopped, setStopped] = useState(false);
  const sqlRef = useRef(sql);
  sqlRef.current = sql;

  const refreshSchema = useCallback(() => {
    engine
      .schema()
      .then(setTables)
      .catch(() => undefined);
  }, [engine]);

  useEffect(refreshSchema, [refreshSchema]);

  const execute = useCallback(
    async (text = sqlRef.current) => {
      if (!text.trim()) return;
      setStopped(false);
      const remember = (item: Omit<HistoryItem, "sql" | "at">) =>
        setHistory((h) => {
          const next = [{ sql: text, at: new Date().toISOString(), ...item }, ...h.filter((x) => x.sql !== text)].slice(0, HISTORY_MAX);
          saveHistory(next);
          return next;
        });
      try {
        const res = await engine.run({ mode: "lab", sql: text });
        lastRun = { res, sql: text };
        setRun(lastRun);
        remember({ ok: res.ok });
        refreshSchema();
      } catch (err) {
        if (err instanceof StoppedError) {
          remember({ ok: false, stopped: true });
          setStopped(true);
          lastRun = null;
          setRun(null);
          refreshSchema();
        } else {
          toast(err instanceof Error ? err.message : "No se pudo ejecutar.", "error");
        }
      }
    },
    [engine, refreshSchema, toast],
  );

  // "Abrir en el laboratorio" desde un ejemplo: trae el código y lo ejecuta.
  useEffect(() => {
    const state = location.state as { sql?: string } | null;
    if (state?.sql) {
      setSql(state.sql);
      writeSession(DRAFT_KEY, state.sql);
      void execute(state.sql);
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.state, location.pathname, navigate, execute]);

  const change = (value: string) => {
    setSql(value);
    writeSession(DRAFT_KEY, value);
  };

  const pick = (table: string) => {
    const text = `SELECT *\nFROM ${table}\nLIMIT 10;`;
    change(text);
    void execute(text);
  };

  const download = async () => {
    try {
      const bytes = await engine.exportDb();
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/vnd.sqlite3" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = "tienda.db";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2_000);
    } catch (err) {
      toast(err instanceof Error ? err.message : "No se pudo descargar la base.", "error");
    }
  };

  const reset = async () => {
    setConfirmReset(false);
    await engine.reset();
    lastRun = null;
    setRun(null);
    refreshSchema();
    toast("La base del laboratorio volvió a su estado original.");
  };

  return (
    <div className="page lab-page">
      <PageHeader
        eyebrow="Laboratorio SQL"
        title="Tienda Pura Vida"
        lede="Practica con la base de la tienda: consulta, cambia datos y crea tablas sin miedo. Los cambios duran mientras la pestaña esté abierta y puedes volver a la base original cuando quieras."
        actions={
          <>
            <button type="button" className="btn secondary" onClick={() => setConfirmReset(true)}>
              <Icon name="undo" size={18} /> Restaurar la base
            </button>
            <button type="button" className="btn secondary" onClick={() => void download()}>
              <Icon name="download" size={18} /> Descargar tienda.db
            </button>
          </>
        }
      />

      <div className="lab">
        <section className="lab-main" aria-label="Editor y resultados">
          <div className="card lab-editor">
            <div className="row between lab-editor-head">
              <h2 id={`${helpId}-title`}>Tu consulta</h2>
              <span className="muted small" id={helpId}>
                <kbd>Ctrl</kbd> + <kbd>Enter</kbd> ejecuta · <kbd>Esc</kbd> y luego <kbd>Tab</kbd> sale del editor
              </span>
            </div>
            <SqlEditor value={sql} onChange={change} onRun={() => void execute()} label="Editor de SQL del laboratorio" describedBy={helpId} tables={tables} minLines={8} />
            <div className="lab-toolbar">
              <button type="button" className="btn" onClick={() => void execute()} disabled={busy || !sql.trim()}>
                <Icon name="play" size={18} /> {busy ? "Ejecutando…" : "Ejecutar"}
              </button>
              <button type="button" className="btn secondary" onClick={() => engine.stop()} disabled={!busy}>
                <Icon name="stop" size={18} /> Detener
              </button>
              <span className="lab-status" role="status" aria-live="polite">
                {busy ? (
                  <>
                    <span className="spinner small" aria-hidden="true" /> Ejecutando…
                  </>
                ) : run ? (
                  runSummary(run.res)
                ) : stopped ? (
                  "Consulta detenida."
                ) : (
                  ""
                )}
              </span>
            </div>
          </div>

          <div className="card lab-results" aria-label="Resultado">
            {stopped && !busy && (
              <div className="alert warn" role="status">
                Detuviste la consulta. La base del laboratorio volvió a su estado original.
              </div>
            )}
            {run ? (
              <RunOutput res={run.res} label="Resultado de la consulta" />
            ) : (
              !stopped && (
                <div className="lab-empty">
                  <Icon name="table" size={28} />
                  <p>
                    El resultado aparece aquí. Toca el ojo junto a una tabla para ver sus primeras filas, o escribe tu consulta y presiona <b>Ejecutar</b>.
                  </p>
                </div>
              )
            )}
          </div>
        </section>

        <aside className="card lab-side" aria-label="Tablas e historial">
          <div className="tabs" role="tablist" aria-label="Panel del laboratorio">
            <button type="button" role="tab" aria-selected={panel === "tablas"} onClick={() => setPanel("tablas")}>
              Tablas
            </button>
            <button type="button" role="tab" aria-selected={panel === "historial"} onClick={() => setPanel("historial")}>
              Historial{history.length ? ` (${history.length})` : ""}
            </button>
          </div>
          {panel === "tablas" ? (
            <TableExplorer tables={tables} onPick={pick} />
          ) : history.length ? (
            <>
              <ol className="lab-history">
                {history.map((h, i) => (
                  <li key={`${h.at}-${i}`}>
                    <button type="button" onClick={() => change(h.sql)} title="Llevar al editor">
                      <code>{h.sql.replace(/^--[^\n]*\n/, "").trim().slice(0, 160)}</code>
                      <span className={h.ok ? "ok" : "bad"}>{h.ok ? "Bien" : h.stopped ? "Detenida" : "Error"}</span>
                    </button>
                  </li>
                ))}
              </ol>
              <button
                type="button"
                className="btn ghost small"
                onClick={() => {
                  setHistory([]);
                  saveHistory([]);
                }}
              >
                <Icon name="trash" size={16} /> Borrar historial
              </button>
            </>
          ) : (
            <p className="muted small">Aquí quedan tus últimas {HISTORY_MAX} consultas. Toca una para llevarla al editor.</p>
          )}
        </aside>
      </div>

      <Modal open={confirmReset} onClose={() => setConfirmReset(false)} label="Restaurar la base">
        <h2>¿Restaurar la base original?</h2>
        <p>Se pierden los cambios que hiciste en el laboratorio (filas insertadas, tablas creadas…). Tu consulta en el editor se queda.</p>
        <div className="row end">
          <button type="button" className="btn secondary" onClick={() => setConfirmReset(false)}>
            Cancelar
          </button>
          <button type="button" className="btn" onClick={() => void reset()}>
            Restaurar
          </button>
        </div>
      </Modal>
    </div>
  );
}

export default LabPage;
