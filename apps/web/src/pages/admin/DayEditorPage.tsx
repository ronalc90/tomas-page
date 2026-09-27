import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router";
import { capitalize, formatLong, type AdminDay, type AdminQuestion, type Language } from "@tomas/shared";
import { CodeBlock } from "../../components/CodeBlock";
import { Icon } from "../../components/Icon";
import { useToast } from "../../components/Toast";
import { ErrorState, Field, Loading, PageHeader } from "../../components/ui";
import { ApiError, errorMessage } from "../../lib/api";
import { relativeTime } from "../../lib/format";
import { useAdminDay, useSaveAdminDay } from "../../lib/queries";

const emptyQuestion = (): AdminQuestion => ({ prompt: "", code: "", options: ["", "", "", ""], correctIndex: 0, explanation: "" });

function QuestionEditor({
  index,
  question,
  onChange,
  onRemove,
  errors,
}: {
  index: number;
  question: AdminQuestion;
  onChange: (q: AdminQuestion) => void;
  onRemove: () => void;
  errors: Record<string, string>;
}) {
  const e = (k: string) => errors[`questions.${index}.${k}`];
  return (
    <div className="editor-item">
      <div className="row between">
        <h3>Pregunta {index + 1}</h3>
        <button type="button" className="btn ghost small" onClick={onRemove}>
          <Icon name="trash" size={16} /> Quitar
        </button>
      </div>
      <Field id={`q${index}-prompt`} label="Enunciado" error={e("prompt")}>
        <input id={`q${index}-prompt`} className="input" value={question.prompt} onChange={(ev) => onChange({ ...question, prompt: ev.target.value })} />
      </Field>
      <Field id={`q${index}-code`} label="Código (opcional)">
        <textarea id={`q${index}-code`} className="textarea code" rows={3} value={question.code} onChange={(ev) => onChange({ ...question, code: ev.target.value })} />
      </Field>
      <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="label" style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>
          Opciones <span className="muted">(marca la correcta)</span>
        </legend>
        {question.options.map((opt, i) => (
          <div className="option-edit" key={i}>
            <input
              type="radio"
              name={`q${index}-correct`}
              checked={question.correctIndex === i}
              onChange={() => onChange({ ...question, correctIndex: i })}
              aria-label={`Marcar la opción ${i + 1} como correcta`}
            />
            <input
              className="input"
              value={opt}
              aria-label={`Opción ${i + 1}`}
              onChange={(ev) => onChange({ ...question, options: question.options.map((o, k) => (k === i ? ev.target.value : o)) })}
            />
            <button
              type="button"
              className="btn ghost small icon"
              aria-label={`Quitar opción ${i + 1}`}
              disabled={question.options.length <= 2}
              onClick={() =>
                onChange({
                  ...question,
                  options: question.options.filter((_, k) => k !== i),
                  correctIndex: question.correctIndex === i ? 0 : question.correctIndex > i ? question.correctIndex - 1 : question.correctIndex,
                })
              }
            >
              <Icon name="trash" size={16} />
            </button>
          </div>
        ))}
        {(e("options") || e("correctIndex")) && <span className="error">{e("options") ?? e("correctIndex")}</span>}
        {question.options.length < 6 && (
          <button type="button" className="btn secondary small" style={{ justifySelf: "start" }} onClick={() => onChange({ ...question, options: [...question.options, ""] })}>
            <Icon name="plus" size={16} /> Agregar opción
          </button>
        )}
      </fieldset>
      <Field id={`q${index}-exp`} label="Explicación (se muestra al calificar)" error={e("explanation")}>
        <textarea id={`q${index}-exp`} className="textarea" rows={2} value={question.explanation} onChange={(ev) => onChange({ ...question, explanation: ev.target.value })} />
      </Field>
    </div>
  );
}

export function DayEditorPage() {
  const { date = "" } = useParams();
  const { data, isLoading, error, refetch } = useAdminDay(date);
  const save = useSaveAdminDay(date);
  const toast = useToast();
  const [form, setForm] = useState<AdminDay | null>(null);
  const [dirty, setDirty] = useState(false);
  const fields = save.error instanceof ApiError ? save.error.fields : {};

  useEffect(() => {
    if (data) {
      setForm(data);
      setDirty(false);
    }
  }, [data]);

  // Avisa antes de cerrar o recargar la pestaña con cambios sin guardar.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  if (isLoading || (!form && !error)) return <Loading />;
  if (error) return <ErrorState error={error} retry={() => void refetch()} />;
  const f = form!;
  const isWorkshop = f.kind === "workshop";
  const update = (patch: Partial<AdminDay>) => {
    setForm({ ...f, ...patch });
    setDirty(true);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await save.mutateAsync({
        title: f.title,
        summary: f.summary,
        concept: f.concept,
        example: f.example,
        language: f.language,
        exampleOutput: f.exampleOutput,
        tasks: f.tasks.map((t) => t.trim()).filter(Boolean),
        questions: f.questions,
      });
      setDirty(false);
      toast("Cambios guardados. El estudiante ya los ve.");
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  return (
    <form className={`page narrow p${f.phaseId}`} onSubmit={submit} noValidate>
      <PageHeader
        eyebrow={
          <Link to="/admin/contenido" style={{ textDecoration: "none" }}>
            ← Contenido · Semana {f.weekNumber}
          </Link>
        }
        title={f.title || "Sin título"}
        lede={`${capitalize(formatLong(f.date))} · editado ${relativeTime(f.updatedAt)}`}
        actions={
          <Link className="btn secondary" to={`/dia/${f.date}`}>
            <Icon name="eye" size={18} /> Ver como estudiante
          </Link>
        }
      />

      {Object.keys(fields).length > 0 && (
        <div className="alert error" role="alert">
          {save.error?.message} Revisa los campos marcados.
        </div>
      )}

      <section className="card stack">
        <h2 style={{ fontSize: "1.2rem" }}>Datos del día</h2>
        <div className="form-grid">
          <Field id="title" label="Título" error={fields.title}>
            <input id="title" className="input" value={f.title} onChange={(e) => update({ title: e.target.value })} />
          </Field>
          {isWorkshop && (
            <Field id="language" label="Lenguaje del ejemplo">
              <select id="language" className="select" value={f.language} onChange={(e) => update({ language: e.target.value as Language })}>
                <option value="python">Python</option>
                <option value="sql">SQL</option>
                <option value="bash">Terminal</option>
              </select>
            </Field>
          )}
          <div className="full">
            <Field id="summary" label="Resumen" hint="Una línea que describe el día (se usa en el calendario y en festivos).">
              <textarea id="summary" className="textarea" rows={2} value={f.summary} onChange={(e) => update({ summary: e.target.value })} />
            </Field>
          </div>
        </div>
      </section>

      {isWorkshop && (
        <>
          <section className="card stack">
            <h2 style={{ fontSize: "1.2rem" }}>Concepto y ejemplo</h2>
            <Field id="concept" label="Concepto" hint="Usa `comillas invertidas` para marcar código en el texto.">
              <textarea id="concept" className="textarea" rows={6} value={f.concept} onChange={(e) => update({ concept: e.target.value })} />
            </Field>
            <div className="form-grid">
              <Field id="example" label="Código de ejemplo">
                <textarea id="example" className="textarea code" rows={10} value={f.example} onChange={(e) => update({ example: e.target.value })} />
              </Field>
              <Field id="output" label="Lo que muestra al correrlo">
                <textarea id="output" className="textarea code" rows={10} value={f.exampleOutput} onChange={(e) => update({ exampleOutput: e.target.value })} />
              </Field>
            </div>
            <details>
              <summary className="muted" style={{ cursor: "pointer", fontSize: 14 }}>
                Vista previa del ejemplo
              </summary>
              <div style={{ marginTop: 12 }}>
                <CodeBlock code={f.example} language={f.language} output={f.exampleOutput} />
              </div>
            </details>
          </section>

          <section className="card stack">
            <div className="row between">
              <h2 style={{ fontSize: "1.2rem" }}>Tareas del taller</h2>
              <button type="button" className="btn secondary small" onClick={() => update({ tasks: [...f.tasks, ""] })} disabled={f.tasks.length >= 10}>
                <Icon name="plus" size={16} /> Agregar tarea
              </button>
            </div>
            {f.tasks.map((t, i) => (
              <div className="option-edit" key={i} style={{ gridTemplateColumns: "24px minmax(0,1fr) auto" }}>
                <span className="mono muted">{i + 1}.</span>
                <textarea
                  className="textarea"
                  rows={2}
                  style={{ minHeight: 60 }}
                  aria-label={`Tarea ${i + 1}`}
                  value={t}
                  onChange={(e) => update({ tasks: f.tasks.map((x, k) => (k === i ? e.target.value : x)) })}
                />
                <button type="button" className="btn ghost small icon" aria-label={`Quitar tarea ${i + 1}`} disabled={f.tasks.length <= 1} onClick={() => update({ tasks: f.tasks.filter((_, k) => k !== i) })}>
                  <Icon name="trash" size={16} />
                </button>
              </div>
            ))}
          </section>

          <section className="card stack">
            <div className="row between">
              <h2 style={{ fontSize: "1.2rem" }}>Evaluación ({f.questions.length} preguntas)</h2>
              <button type="button" className="btn secondary small" onClick={() => update({ questions: [...f.questions, emptyQuestion()] })} disabled={f.questions.length >= 10}>
                <Icon name="plus" size={16} /> Agregar pregunta
              </button>
            </div>
            {f.questions.map((q, i) => (
              <QuestionEditor
                key={i}
                index={i}
                question={q}
                errors={fields}
                onChange={(next) => update({ questions: f.questions.map((x, k) => (k === i ? next : x)) })}
                onRemove={() => update({ questions: f.questions.filter((_, k) => k !== i) })}
              />
            ))}
          </section>
        </>
      )}

      <div className="sticky-actions">
        <span className="muted" style={{ fontSize: 14 }}>
          {dirty ? "Tienes cambios sin guardar." : "Todo guardado."}
        </span>
        <div className="row">
          <button type="button" className="btn secondary" disabled={!dirty || save.isPending} onClick={() => data && (setForm(data), setDirty(false))}>
            Descartar
          </button>
          <button type="submit" className="btn" disabled={!dirty || save.isPending}>
            {save.isPending ? "Guardando…" : "Guardar cambios"}
          </button>
        </div>
      </div>
    </form>
  );
}
