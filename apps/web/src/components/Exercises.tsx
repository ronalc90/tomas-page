import { useEffect, useRef, useState } from "react";
import { REVEAL_AFTER_ATTEMPTS, type ExerciseCheckResult, type ExerciseView } from "@tomas/shared";
import { errorMessage } from "../lib/api";
import { useCheckExercise, useMe, useRevealExercise, type ExerciseScope } from "../lib/queries";
import { cleanEngine, StoppedError } from "../sql/engine";
import type { RunResponse } from "../sql/protocol";
import { ResultTable, rowsLabel } from "../sql/ResultTable";
import { RunOutput, runSummary, SqlErrorBox } from "../sql/RunOutput";
import { SqlEditor } from "../sql/SqlEditor";
import { useTiendaSchema } from "../sql/useSchema";
import { CodeBlock, RichText } from "./CodeBlock";
import { Icon } from "./Icon";
import { useToast } from "./Toast";
import { Modal, ProgressBar } from "./ui";

/** Lo que el estudiante escribe y todavía no comprobó se guarda en este navegador. */
function draftKey(userId: string | undefined, id: string) {
  return `tp-ex:${userId ?? "anon"}:${id}`;
}

function readDraft(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeDraft(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* sin almacenamiento: el borrador dura mientras la página esté abierta */
  }
}

/** El servidor devuelve "explicación (SQLite: mensaje original)", o un aviso propio (p. ej. tiempo agotado). */
function CheckError({ error }: { error: string }) {
  const m = error.match(/\(SQLite: ([\s\S]*)\)$/);
  if (m) return <SqlErrorBox error={m[1]} />;
  return (
    <div className="sql-error" role="alert">
      <Icon name="clock" size={20} />
      <p className="sql-error-title">{error}</p>
    </div>
  );
}

function attemptsLabel(n: number) {
  return n === 0 ? "Sin intentos" : n === 1 ? "1 intento" : `${n} intentos`;
}

export function ExerciseStatus({ exercise }: { exercise: ExerciseView }) {
  const s = exercise.state;
  if (s.solved) {
    return (
      <span className="pill done">
        Resuelto{s.attempts > 1 ? ` · ${attemptsLabel(s.attempts)}` : ""}
      </span>
    );
  }
  return <span className={`pill ${s.attempts ? "in_progress" : "pending"}`}>{attemptsLabel(s.attempts)}</span>;
}

function ExerciseCard({ exercise, index, scope }: { exercise: ExerciseView; index: number; scope: ExerciseScope }) {
  const me = useMe();
  const toast = useToast();
  const tables = useTiendaSchema();
  const key = draftKey(me.data?.user.id, exercise.id);
  const [sql, setSql] = useState(() => readDraft(key) ?? exercise.state.lastSql ?? exercise.starter ?? "");
  const [run, setRun] = useState<RunResponse | null>(null);
  const [running, setRunning] = useState(false);
  const [verdict, setVerdict] = useState<ExerciseCheckResult | null>(null);
  const [showHint, setShowHint] = useState(false);
  const [showExpected, setShowExpected] = useState(false);
  const [confirmReveal, setConfirmReveal] = useState(false);
  const check = useCheckExercise(scope, exercise.id);
  const reveal = useRevealExercise(scope, exercise.id);
  const sqlRef = useRef(sql);
  sqlRef.current = sql;
  const s = exercise.state;
  const canReveal = s.solved || s.attempts >= REVEAL_AFTER_ATTEMPTS;
  const headingId = `ex-${exercise.id}`;

  // Si llega un último SQL del servidor (otro equipo) y no hay borrador, se usa.
  useEffect(() => {
    if (readDraft(key) === null && s.lastSql && sqlRef.current !== s.lastSql && !check.isPending) setSql(s.lastSql);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.lastSql]);

  const change = (value: string) => {
    setSql(value);
    writeDraft(key, value);
  };

  const execute = async () => {
    if (!sqlRef.current.trim()) return;
    setRunning(true);
    setVerdict(null);
    try {
      setRun(await cleanEngine().run({ mode: "clean", sql: sqlRef.current, setup: exercise.setup, check: "" }));
    } catch (err) {
      if (!(err instanceof StoppedError)) toast(errorMessage(err), "error");
    } finally {
      setRunning(false);
    }
  };

  const submit = async () => {
    if (!sqlRef.current.trim()) {
      toast("Escribe tu consulta antes de comprobar.", "error");
      return;
    }
    try {
      const res = await check.mutateAsync(sqlRef.current);
      setVerdict(res);
      setRun(null);
      writeDraft(key, null);
      if (res.correct) toast(`Ejercicio ${index + 1} resuelto.`);
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  const doReveal = async () => {
    setConfirmReveal(false);
    try {
      await reveal.mutateAsync();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  return (
    <li className={`exercise ${s.solved ? "solved" : ""}`} aria-labelledby={headingId}>
      <div className="exercise-head">
        <span className="exercise-n" aria-hidden="true">
          {s.solved ? <Icon name="check" size={16} /> : index + 1}
        </span>
        <h3 id={headingId}>
          <span className="visually-hidden">Ejercicio {index + 1}: </span>
          {exercise.title}
        </h3>
        <ExerciseStatus exercise={exercise} />
      </div>

      <div className="exercise-prompt">
        <RichText text={exercise.prompt} block />
      </div>
      <p className="exercise-meta">
        Resultado esperado: {rowsLabel(exercise.expectedRowCount)}
        {exercise.expected ? `, ${exercise.expected.columns.length} ${exercise.expected.columns.length === 1 ? "columna" : "columnas"}` : ""} ·{" "}
        {exercise.orderMatters ? "el orden de las filas cuenta" : "el orden de las filas no importa"}
        {exercise.setup ? " · usa una tabla de trabajo que se crea antes de tu SQL" : ""}
      </p>

      <SqlEditor value={sql} onChange={change} onRun={() => void execute()} label={`Tu SQL para el ejercicio ${index + 1}: ${exercise.title}`} tables={tables} minLines={4} placeholder="Escribe tu consulta aquí…" />

      <div className="exercise-actions">
        {running ? (
          <button type="button" className="btn secondary" onClick={() => cleanEngine().stop()}>
            <Icon name="stop" size={18} /> Detener
          </button>
        ) : (
          <button type="button" className="btn secondary" onClick={() => void execute()} disabled={!sql.trim()} title="Corre tu SQL en una copia de la base (Ctrl + Enter). No cuenta como intento.">
            <Icon name="play" size={18} /> Ejecutar
          </button>
        )}
        <button type="button" className="btn" onClick={() => void submit()} disabled={check.isPending || !sql.trim()}>
          <Icon name="check" size={18} /> {check.isPending ? "Comprobando…" : "Comprobar"}
        </button>
        <span className="exercise-tools">
        {exercise.hint && (
          <button type="button" className="btn ghost small" aria-expanded={showHint} onClick={() => setShowHint((v) => !v)}>
            <Icon name="bulb" size={16} /> {showHint ? "Ocultar pista" : "Pista"}
          </button>
        )}
        <button type="button" className="btn ghost small" aria-expanded={showExpected} onClick={() => setShowExpected((v) => !v)}>
          <Icon name="table" size={16} /> {showExpected ? "Ocultar resultado esperado" : "Ver resultado esperado"}
        </button>
        {!exercise.solution && (
          <button
            type="button"
            className="btn ghost small"
            disabled={!canReveal || reveal.isPending}
            onClick={() => setConfirmReveal(true)}
            title={canReveal ? "Ver la solución de referencia" : `Se habilita después de ${REVEAL_AFTER_ATTEMPTS} intentos (llevas ${s.attempts})`}
          >
            <Icon name="eye" size={16} /> Ver solución
            {!canReveal && <span className="muted"> ({s.attempts}/{REVEAL_AFTER_ATTEMPTS})</span>}
          </button>
        )}
        </span>
      </div>

      {showHint && (
        <p className="hint-text" role="status">
          <Icon name="bulb" size={16} />
          <span>
            <RichText text={exercise.hint} />
          </span>
        </p>
      )}

      {verdict && !(verdict.error && !verdict.correct && verdict.message.startsWith("Tu SQL tiene un error")) && (
        <div className={`verdict ${verdict.correct ? "ok" : "bad"}`} role="status" aria-live="polite">
          <Icon name={verdict.correct ? "check" : "alert"} size={20} />
          <div>
            <b>{verdict.message}</b>
            {verdict.correct ? (
              <span>Compara tu consulta con la solución de referencia: a veces hay otra forma de llegar.</span>
            ) : (
              !verdict.error && <span>Revisa el resultado esperado y vuelve a intentarlo. Llevas {attemptsLabel(verdict.state.attempts).toLowerCase()}.</span>
            )}
          </div>
        </div>
      )}
      {verdict?.error && <CheckError error={verdict.error} />}
      {verdict?.result && !verdict.correct && (
        <div className="exercise-panel">
          <span className="panel-title">
            {exercise.setup ? "Lo que quedó" : "Lo que devolvió tu consulta"} · {rowsLabel(verdict.resultRowCount)}
          </span>
          <ResultTable columns={verdict.result.columns} rows={verdict.result.rows} rowCount={verdict.resultRowCount} label={`Tu resultado del ejercicio ${index + 1}`} compact max={100} />
        </div>
      )}

      {run && (
        <div className="exercise-panel">
          <span className="panel-title">Tu resultado · {runSummary(run)}</span>
          <RunOutput res={run} label={`Tu resultado del ejercicio ${index + 1}`} compact max={200} />
        </div>
      )}

      {showExpected && (
        <div className="exercise-panel">
          <span className="panel-title">
            Resultado esperado · {rowsLabel(exercise.expectedRowCount)}
            {exercise.expected && exercise.expectedRowCount > exercise.expected.rows.length ? ` (se muestran ${exercise.expected.rows.length})` : ""}
          </span>
          {exercise.expected ? (
            <ResultTable columns={exercise.expected.columns} rows={exercise.expected.rows} rowCount={exercise.expectedRowCount} label={`Resultado esperado del ejercicio ${index + 1}`} compact />
          ) : (
            <p className="muted small">Este ejercicio no tiene un resultado esperado disponible. Avísale al administrador.</p>
          )}
          <p className="muted small">Los nombres de las columnas no tienen que coincidir: se comparan los valores, la cantidad y el orden de las columnas.</p>
        </div>
      )}

      {exercise.solution && (
        <div className="exercise-panel">
          <CodeBlock code={exercise.solution} language="sql" label={s.solved ? "Solución de referencia" : "Solución"} />
          {!s.solved && s.revealed && <p className="muted small">Viste la solución: escríbela con tus palabras y compruébala para dar el ejercicio por resuelto.</p>}
        </div>
      )}

      <Modal open={confirmReveal} onClose={() => setConfirmReveal(false)} label="Ver la solución">
        <h2>¿Ver la solución?</h2>
        <p>
          Queda registrado en tu avance y el administrador lo verá. Antes, prueba con la pista y compara tu resultado con el esperado: muchas veces
          falta solo un detalle.
        </p>
        <div className="row end">
          <button type="button" className="btn secondary" onClick={() => setConfirmReveal(false)}>
            Seguir intentando
          </button>
          <button type="button" className="btn" onClick={() => void doReveal()}>
            Ver la solución
          </button>
        </div>
      </Modal>
    </li>
  );
}

/** Los ejercicios SQL de un taller o de un entregable. */
export default function Exercises({ exercises, scope }: { exercises: ExerciseView[]; scope: ExerciseScope }) {
  const solved = exercises.filter((e) => e.state.solved).length;
  return (
    <div className="stack">
      <div className="exercises-summary">
        <span>
          <b className="num">
            {solved} de {exercises.length}
          </b>{" "}
          {exercises.length === 1 ? "ejercicio resuelto" : "ejercicios resueltos"}
        </span>
        <ProgressBar thin value={exercises.length ? solved / exercises.length : 0} label="Ejercicios resueltos" />
      </div>
      <ol className="exercises">
        {exercises.map((e, i) => (
          <ExerciseCard key={e.id} exercise={e} index={i} scope={scope} />
        ))}
      </ol>
    </div>
  );
}
