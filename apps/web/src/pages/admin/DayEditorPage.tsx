import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router";
import { capitalize, formatLong, type AdminDay } from "@tomas/shared";
import { CodeBlock } from "../../components/CodeBlock";
import { Icon } from "../../components/Icon";
import { useToast } from "../../components/Toast";
import { ErrorState, Field, Loading, PageHeader } from "../../components/ui";
import { ApiError, errorMessage } from "../../lib/api";
import { relativeTime } from "../../lib/format";
import { useAdminDay, useSaveAdminDay } from "../../lib/queries";
import { ChallengeEditor, CommonErrorsEditor, emptyQuestion, GlossaryEditor, LanguageSelect, QuestionEditor, ResourcesEditor, StepsEditor, TextList } from "./LessonEditors";

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
        objectives: f.objectives.map((t) => t.trim()).filter(Boolean),
        concept: f.concept,
        tip: f.tip,
        example: f.example,
        language: f.language,
        exampleOutput: f.exampleOutput,
        steps: f.steps,
        commonErrors: f.commonErrors,
        tasks: f.tasks.map((t) => t.trim()).filter(Boolean),
        taskHints: f.tasks.map((t, i) => (t.trim() ? (f.taskHints[i] ?? "").trim() : null)).filter((h): h is string => h !== null),
        challenge: f.challenge,
        glossary: f.glossary.filter((g) => g.term.trim() || g.definition.trim()),
        resources: f.resources.filter((r) => r.title.trim() || r.url.trim()),
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
          <Field id="title" label="Título del día" error={fields.title}>
            <input id="title" className="input" value={f.title} onChange={(e) => update({ title: e.target.value })} />
          </Field>
          {isWorkshop && (
            <Field id="language" label="Lenguaje del ejemplo">
              <LanguageSelect id="language" value={f.language} onChange={(language) => update({ language })} />
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
            <h2 style={{ fontSize: "1.2rem" }}>Objetivos del día</h2>
            <TextList label="Objetivo" hint="Lo que el estudiante va a poder hacer al terminar (2 a 4 frases)." items={f.objectives} onChange={(objectives) => update({ objectives })} max={6} rows={1} addLabel="Agregar objetivo" error={fields.objectives} />
          </section>

          <section className="card stack">
            <h2 style={{ fontSize: "1.2rem" }}>Concepto y ejemplo</h2>
            <Field id="concept" label="Concepto" hint="Usa `comillas invertidas` para marcar código en el texto.">
              <textarea id="concept" className="textarea" rows={6} value={f.concept} onChange={(e) => update({ concept: e.target.value })} />
            </Field>
            <Field id="tip" label="Consejo del día" hint="Un consejo corto: un error común, cómo estudiar o cómo depurar. Si lo dejas vacío, no se muestra." error={fields.tip}>
              <textarea id="tip" className="textarea" rows={3} value={f.tip} onChange={(e) => update({ tip: e.target.value })} />
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
            <h2 style={{ fontSize: "1.2rem" }}>Guía paso a paso ({f.steps.length} pasos)</h2>
            <p className="muted" style={{ fontSize: 14 }}>
              Los pasos llevan al estudiante de cero a tener el programa del día funcionando. Cada uno puede traer código.
            </p>
            <StepsEditor steps={f.steps} language={f.language} onChange={(steps) => update({ steps })} />
          </section>

          <section className="card stack">
            <h2 style={{ fontSize: "1.2rem" }}>Errores comunes ({f.commonErrors.length})</h2>
            <CommonErrorsEditor errors={f.commonErrors} onChange={(commonErrors) => update({ commonErrors })} />
          </section>

          <section className="card stack">
            <div className="row between">
              <h2 style={{ fontSize: "1.2rem" }}>Tareas del taller</h2>
              <button type="button" className="btn secondary small" onClick={() => update({ tasks: [...f.tasks, ""], taskHints: [...f.tasks.map((_, k) => f.taskHints[k] ?? ""), ""] })} disabled={f.tasks.length >= 10}>
                <Icon name="plus" size={16} /> Agregar tarea
              </button>
            </div>
            <p className="muted" style={{ fontSize: 14 }}>
              Cada tarea puede traer una pista que el estudiante destapa si se atasca.
            </p>
            {f.tasks.map((t, i) => (
              <div className="option-edit" key={i} style={{ gridTemplateColumns: "24px minmax(0,1fr) minmax(0,1fr) auto" }}>
                <span className="mono muted">{i + 1}.</span>
                <textarea
                  className="textarea"
                  rows={2}
                  style={{ minHeight: 60 }}
                  aria-label={`Tarea ${i + 1}`}
                  value={t}
                  onChange={(e) => update({ tasks: f.tasks.map((x, k) => (k === i ? e.target.value : x)) })}
                />
                <textarea
                  className="textarea"
                  rows={2}
                  style={{ minHeight: 60 }}
                  placeholder="Pista (opcional)"
                  aria-label={`Pista de la tarea ${i + 1}`}
                  value={f.taskHints[i] ?? ""}
                  onChange={(e) => update({ taskHints: f.tasks.map((_, k) => (k === i ? e.target.value : (f.taskHints[k] ?? ""))) })}
                />
                <button
                  type="button"
                  className="btn ghost small icon"
                  aria-label={`Quitar tarea ${i + 1}`}
                  disabled={f.tasks.length <= 1}
                  onClick={() => update({ tasks: f.tasks.filter((_, k) => k !== i), taskHints: f.taskHints.filter((_, k) => k !== i) })}
                >
                  <Icon name="trash" size={16} />
                </button>
              </div>
            ))}
          </section>

          <section className="card stack">
            <h2 style={{ fontSize: "1.2rem" }}>Reto extra (opcional)</h2>
            <ChallengeEditor challenge={f.challenge} language={f.language} onChange={(challenge) => update({ challenge })} />
          </section>

          <section className="card stack">
            <h2 style={{ fontSize: "1.2rem" }}>Glosario y documentación</h2>
            <GlossaryEditor items={f.glossary} onChange={(glossary) => update({ glossary })} />
            <ResourcesEditor items={f.resources} onChange={(resources) => update({ resources })} error={fields.resources} />
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
