import type { AdminQuestion, Challenge, CommonError, GlossaryItem, Language, QuestionType, Resource, ScheduleBlock, Topic, TutorialStep } from "@tomas/shared";
import { CodeBlock } from "../../components/CodeBlock";
import { QUESTION_TYPE_LABEL } from "@tomas/shared";
import { Icon } from "../../components/Icon";
import { Field } from "../../components/ui";

/** Editores de las piezas de una lección, usados por el editor del día. */

export const emptyQuestion = (type: QuestionType = "choice"): AdminQuestion => ({
  type,
  prompt: "",
  code: "",
  options: type === "choice" ? ["", "", "", ""] : type === "boolean" ? ["Verdadero", "Falso"] : [],
  correctIndex: 0,
  accepted: type === "output" || type === "fill" ? [""] : [],
  optionFeedback: [],
  explanation: "",
  hint: "",
});

export const emptyStep = (language: Language): TutorialStep => ({ title: "", body: "", code: "", language });
export const emptyError = (): CommonError => ({ error: "", cause: "", fix: "" });
export const emptyTopic = (language: Language = "python"): Topic => ({ title: "", concept: "", tip: "", example: "", language, exampleOutput: "", steps: [], commonErrors: [] });
export const emptyChallenge = (language: Language): Challenge => ({ title: "", description: "", hint: "", solution: "", language });

export function LanguageSelect({ id, value, onChange }: { id: string; value: Language; onChange: (l: Language) => void }) {
  return (
    <select id={id} className="select" value={value} onChange={(e) => onChange(e.target.value as Language)}>
      <option value="python">Python</option>
      <option value="sql">SQL</option>
      <option value="bash">Terminal</option>
    </select>
  );
}

/** Lista de textos cortos (objetivos, criterios, pasos de un entregable…). */
export function TextList({
  label,
  hint,
  items,
  onChange,
  max = 10,
  rows = 2,
  addLabel = "Agregar",
  error,
}: {
  label: string;
  hint?: string;
  items: string[];
  onChange: (items: string[]) => void;
  max?: number;
  rows?: number;
  addLabel?: string;
  error?: string;
}) {
  return (
    <div className="stack">
      <div className="row between">
        <div>
          <span className="label" style={{ fontWeight: 700, fontSize: 14 }}>
            {label}
          </span>
          {hint && <div className="hint">{hint}</div>}
        </div>
        <button type="button" className="btn secondary small" onClick={() => onChange([...items, ""])} disabled={items.length >= max}>
          <Icon name="plus" size={16} /> {addLabel}
        </button>
      </div>
      {items.map((t, i) => (
        <div className="option-edit" key={i} style={{ gridTemplateColumns: "24px minmax(0,1fr) auto" }}>
          <span className="mono muted">{i + 1}.</span>
          <textarea className="textarea" rows={rows} aria-label={`${label} ${i + 1}`} value={t} onChange={(e) => onChange(items.map((x, k) => (k === i ? e.target.value : x)))} />
          <button type="button" className="btn ghost small icon" aria-label={`Quitar ${label.toLowerCase()} ${i + 1}`} onClick={() => onChange(items.filter((_, k) => k !== i))}>
            <Icon name="trash" size={16} />
          </button>
        </div>
      ))}
      {error && <span className="error">{error}</span>}
    </div>
  );
}

export function StepsEditor({ steps, language, onChange, idPrefix = "" }: { steps: TutorialStep[]; language: Language; onChange: (s: TutorialStep[]) => void; idPrefix?: string }) {
  const set = (i: number, patch: Partial<TutorialStep>) => onChange(steps.map((s, k) => (k === i ? { ...s, ...patch } : s)));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= steps.length) return;
    const next = [...steps];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  return (
    <div className="stack">
      {steps.map((s, i) => (
        <div className="editor-item" key={i}>
          <div className="row between">
            <h3>Paso {i + 1}</h3>
            <div className="row">
              <button type="button" className="btn ghost small icon" aria-label={`Subir paso ${i + 1}`} disabled={i === 0} onClick={() => move(i, -1)}>
                <Icon name="up" size={16} />
              </button>
              <button type="button" className="btn ghost small icon" aria-label={`Bajar paso ${i + 1}`} disabled={i === steps.length - 1} onClick={() => move(i, 1)}>
                <Icon name="down" size={16} />
              </button>
              <button type="button" className="btn ghost small" onClick={() => onChange(steps.filter((_, k) => k !== i))}>
                <Icon name="trash" size={16} /> Quitar
              </button>
            </div>
          </div>
          <Field id={`${idPrefix}step${i}-title`} label={`Título del paso ${i + 1}`}>
            <input id={`${idPrefix}step${i}-title`} className="input" value={s.title} onChange={(e) => set(i, { title: e.target.value })} />
          </Field>
          <Field id={`${idPrefix}step${i}-body`} label={`Explicación del paso ${i + 1}`}>
            <textarea id={`${idPrefix}step${i}-body`} className="textarea" rows={3} value={s.body} onChange={(e) => set(i, { body: e.target.value })} />
          </Field>
          <div className="form-grid">
            <Field id={`${idPrefix}step${i}-code`} label={`Código del paso ${i + 1} (opcional)`}>
              <textarea id={`${idPrefix}step${i}-code`} className="textarea code" rows={5} value={s.code} onChange={(e) => set(i, { code: e.target.value })} />
            </Field>
            <Field id={`${idPrefix}step${i}-lang`} label={`Lenguaje del paso ${i + 1}`}>
              <LanguageSelect id={`${idPrefix}step${i}-lang`} value={s.language} onChange={(l) => set(i, { language: l })} />
            </Field>
          </div>
        </div>
      ))}
      <button type="button" className="btn secondary small" style={{ justifySelf: "start" }} onClick={() => onChange([...steps, emptyStep(language)])} disabled={steps.length >= 10}>
        <Icon name="plus" size={16} /> Agregar paso
      </button>
    </div>
  );
}

export function CommonErrorsEditor({ errors, onChange, idPrefix = "" }: { errors: CommonError[]; onChange: (e: CommonError[]) => void; idPrefix?: string }) {
  const set = (i: number, patch: Partial<CommonError>) => onChange(errors.map((e, k) => (k === i ? { ...e, ...patch } : e)));
  return (
    <div className="stack">
      {errors.map((e, i) => (
        <div className="editor-item" key={i}>
          <div className="row between">
            <h3>Error común {i + 1}</h3>
            <button type="button" className="btn ghost small" onClick={() => onChange(errors.filter((_, k) => k !== i))}>
              <Icon name="trash" size={16} /> Quitar
            </button>
          </div>
          <Field id={`${idPrefix}err${i}-error`} label="Qué se ve (el mensaje o el síntoma)">
            <input id={`${idPrefix}err${i}-error`} className="input code" value={e.error} onChange={(ev) => set(i, { error: ev.target.value })} />
          </Field>
          <div className="form-grid">
            <Field id={`${idPrefix}err${i}-cause`} label="Por qué pasa">
              <textarea id={`${idPrefix}err${i}-cause`} className="textarea" rows={2} value={e.cause} onChange={(ev) => set(i, { cause: ev.target.value })} />
            </Field>
            <Field id={`${idPrefix}err${i}-fix`} label="Cómo se arregla">
              <textarea id={`${idPrefix}err${i}-fix`} className="textarea" rows={2} value={e.fix} onChange={(ev) => set(i, { fix: ev.target.value })} />
            </Field>
          </div>
        </div>
      ))}
      <button type="button" className="btn secondary small" style={{ justifySelf: "start" }} onClick={() => onChange([...errors, emptyError()])} disabled={errors.length >= 8}>
        <Icon name="plus" size={16} /> Agregar error común
      </button>
    </div>
  );
}

export function ChallengeEditor({ challenge, language, onChange }: { challenge: Challenge | null; language: Language; onChange: (c: Challenge | null) => void }) {
  if (!challenge) {
    return (
      <button type="button" className="btn secondary small" style={{ justifySelf: "start" }} onClick={() => onChange(emptyChallenge(language))}>
        <Icon name="plus" size={16} /> Agregar reto
      </button>
    );
  }
  const set = (patch: Partial<Challenge>) => onChange({ ...challenge, ...patch });
  return (
    <div className="stack">
      <div className="form-grid">
        <Field id="ch-title" label="Título del reto">
          <input id="ch-title" className="input" value={challenge.title} onChange={(e) => set({ title: e.target.value })} />
        </Field>
        <Field id="ch-lang" label="Lenguaje de la solución">
          <LanguageSelect id="ch-lang" value={challenge.language} onChange={(l) => set({ language: l })} />
        </Field>
      </div>
      <Field id="ch-desc" label="Qué hacer (con un ejemplo de entrada y salida)">
        <textarea id="ch-desc" className="textarea" rows={3} value={challenge.description} onChange={(e) => set({ description: e.target.value })} />
      </Field>
      <Field id="ch-hint" label="Pista">
        <textarea id="ch-hint" className="textarea" rows={2} value={challenge.hint} onChange={(e) => set({ hint: e.target.value })} />
      </Field>
      <Field id="ch-sol" label="Solución (el estudiante la puede destapar)">
        <textarea id="ch-sol" className="textarea code" rows={8} value={challenge.solution} onChange={(e) => set({ solution: e.target.value })} />
      </Field>
      <button type="button" className="btn ghost small" style={{ justifySelf: "start" }} onClick={() => onChange(null)}>
        <Icon name="trash" size={16} /> Quitar el reto
      </button>
    </div>
  );
}

export function GlossaryEditor({ items, onChange }: { items: GlossaryItem[]; onChange: (g: GlossaryItem[]) => void }) {
  return (
    <div className="stack">
      {items.map((g, i) => (
        <div className="option-edit" key={i} style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,2fr) auto" }}>
          <input className="input" aria-label={`Término ${i + 1}`} placeholder="Término" value={g.term} onChange={(e) => onChange(items.map((x, k) => (k === i ? { ...x, term: e.target.value } : x)))} />
          <input className="input" aria-label={`Definición ${i + 1}`} placeholder="Definición" value={g.definition} onChange={(e) => onChange(items.map((x, k) => (k === i ? { ...x, definition: e.target.value } : x)))} />
          <button type="button" className="btn ghost small icon" aria-label={`Quitar término ${i + 1}`} onClick={() => onChange(items.filter((_, k) => k !== i))}>
            <Icon name="trash" size={16} />
          </button>
        </div>
      ))}
      <button type="button" className="btn secondary small" style={{ justifySelf: "start" }} onClick={() => onChange([...items, { term: "", definition: "" }])} disabled={items.length >= 10}>
        <Icon name="plus" size={16} /> Agregar término
      </button>
    </div>
  );
}

export function ResourcesEditor({ items, onChange, error }: { items: Resource[]; onChange: (r: Resource[]) => void; error?: string }) {
  return (
    <div className="stack">
      {items.map((r, i) => (
        <div className="option-edit" key={i} style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,2fr) auto" }}>
          <input className="input" aria-label={`Título del enlace ${i + 1}`} placeholder="Título" value={r.title} onChange={(e) => onChange(items.map((x, k) => (k === i ? { ...x, title: e.target.value } : x)))} />
          <input className="input code" aria-label={`Dirección del enlace ${i + 1}`} placeholder="https://…" value={r.url} onChange={(e) => onChange(items.map((x, k) => (k === i ? { ...x, url: e.target.value } : x)))} />
          <button type="button" className="btn ghost small icon" aria-label={`Quitar enlace ${i + 1}`} onClick={() => onChange(items.filter((_, k) => k !== i))}>
            <Icon name="trash" size={16} />
          </button>
        </div>
      ))}
      {error && <span className="error">{error}</span>}
      <button type="button" className="btn secondary small" style={{ justifySelf: "start" }} onClick={() => onChange([...items, { title: "", url: "" }])} disabled={items.length >= 6}>
        <Icon name="plus" size={16} /> Agregar enlace
      </button>
    </div>
  );
}

export function QuestionEditor({
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
  const isText = question.type === "output" || question.type === "fill";
  const changeType = (type: QuestionType) => {
    if (type === question.type) return;
    const base = emptyQuestion(type);
    onChange({ ...base, prompt: question.prompt, code: question.code, explanation: question.explanation, hint: question.hint });
  };
  const setOption = (i: number, value: string) => onChange({ ...question, options: question.options.map((o, k) => (k === i ? value : o)) });
  const setFeedback = (i: number, value: string) => {
    const fb = question.options.map((_, k) => question.optionFeedback[k] ?? "");
    fb[i] = value;
    onChange({ ...question, optionFeedback: fb });
  };
  return (
    <div className="editor-item">
      <div className="row between">
        <h3>Pregunta {index + 1}</h3>
        <button type="button" className="btn ghost small" onClick={onRemove}>
          <Icon name="trash" size={16} /> Quitar
        </button>
      </div>
      <div className="form-grid">
        <Field id={`q${index}-type`} label="Tipo de pregunta">
          <select id={`q${index}-type`} className="select" value={question.type} onChange={(ev) => changeType(ev.target.value as QuestionType)}>
            {(Object.keys(QUESTION_TYPE_LABEL) as QuestionType[]).map((t) => (
              <option key={t} value={t}>
                {QUESTION_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </Field>
        <Field id={`q${index}-hint`} label="Pista (el estudiante la puede destapar)" error={e("hint")}>
          <input id={`q${index}-hint`} className="input" value={question.hint} onChange={(ev) => onChange({ ...question, hint: ev.target.value })} />
        </Field>
      </div>
      <Field id={`q${index}-prompt`} label="Enunciado" error={e("prompt")}>
        <input id={`q${index}-prompt`} className="input" value={question.prompt} onChange={(ev) => onChange({ ...question, prompt: ev.target.value })} />
      </Field>
      <Field
        id={`q${index}-code`}
        label={question.type === "fill" ? "Código con el hueco marcado como ____" : isText ? "Código" : "Código (opcional)"}
        error={e("code")}
      >
        <textarea id={`q${index}-code`} className="textarea code" rows={3} value={question.code} onChange={(ev) => onChange({ ...question, code: ev.target.value })} />
      </Field>

      {isText ? (
        <TextList
          label="Respuestas aceptadas"
          hint={
            question.type === "output"
              ? "La primera es la que se muestra como correcta. Se ignoran mayúsculas, comillas y espacios repetidos."
              : "Lo que va en el hueco. Se ignoran espacios y mayúsculas."
          }
          items={question.accepted}
          onChange={(accepted) => onChange({ ...question, accepted })}
          max={8}
          rows={1}
          addLabel="Agregar respuesta"
          error={e("accepted")}
        />
      ) : (
        <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="label" style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>
            Opciones <span className="muted">(marca la correcta y explica cada una)</span>
          </legend>
          {question.options.map((opt, i) => (
            <div className="option-edit" key={i} style={{ gridTemplateColumns: "auto minmax(0,1fr) minmax(0,1fr) auto" }}>
              <input
                type="radio"
                name={`q${index}-correct`}
                checked={question.correctIndex === i}
                onChange={() => onChange({ ...question, correctIndex: i })}
                aria-label={`Marcar la opción ${i + 1} como correcta`}
              />
              <input className="input" value={opt} aria-label={`Opción ${i + 1}`} readOnly={question.type === "boolean"} onChange={(ev) => setOption(i, ev.target.value)} />
              <input
                className="input"
                value={question.optionFeedback[i] ?? ""}
                placeholder="Por qué está bien o mal"
                aria-label={`Comentario de la opción ${i + 1}`}
                onChange={(ev) => setFeedback(i, ev.target.value)}
              />
              <button
                type="button"
                className="btn ghost small icon"
                aria-label={`Quitar opción ${i + 1}`}
                disabled={question.type === "boolean" || question.options.length <= 2}
                onClick={() =>
                  onChange({
                    ...question,
                    options: question.options.filter((_, k) => k !== i),
                    optionFeedback: question.optionFeedback.filter((_, k) => k !== i),
                    correctIndex: question.correctIndex === i ? 0 : question.correctIndex > i ? question.correctIndex - 1 : question.correctIndex,
                  })
                }
              >
                <Icon name="trash" size={16} />
              </button>
            </div>
          ))}
          {(e("options") || e("correctIndex") || e("optionFeedback")) && <span className="error">{e("options") ?? e("correctIndex") ?? e("optionFeedback")}</span>}
          {question.type === "choice" && question.options.length < 6 && (
            <button type="button" className="btn secondary small" style={{ justifySelf: "start" }} onClick={() => onChange({ ...question, options: [...question.options, ""] })}>
              <Icon name="plus" size={16} /> Agregar opción
            </button>
          )}
        </fieldset>
      )}
      <Field id={`q${index}-exp`} label="Explicación (se muestra al calificar)" error={e("explanation")}>
        <textarea id={`q${index}-exp`} className="textarea" rows={2} value={question.explanation} onChange={(ev) => onChange({ ...question, explanation: ev.target.value })} />
      </Field>
    </div>
  );
}

export function ScheduleEditor({ blocks, onChange, error }: { blocks: ScheduleBlock[]; onChange: (b: ScheduleBlock[]) => void; error?: string }) {
  const total = blocks.reduce((a, b) => a + (Number.isFinite(b.minutes) ? b.minutes : 0), 0);
  return (
    <div className="stack">
      <p className="muted" style={{ fontSize: 14 }}>
        Cómo se reparten las 4 horas del día. Total: <b className="num">{total} min</b>.
      </p>
      {blocks.map((b, i) => (
        <div className="option-edit" key={i} style={{ gridTemplateColumns: "minmax(0,1fr) 110px auto" }}>
          <input className="input" aria-label={`Bloque ${i + 1}`} placeholder="Tema 1: …" value={b.label} onChange={(e) => onChange(blocks.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)))} />
          <input
            className="input"
            type="number"
            min={1}
            max={240}
            aria-label={`Minutos del bloque ${i + 1}`}
            value={b.minutes}
            onChange={(e) => onChange(blocks.map((x, k) => (k === i ? { ...x, minutes: Number(e.target.value) } : x)))}
          />
          <button type="button" className="btn ghost small icon" aria-label={`Quitar bloque ${i + 1}`} onClick={() => onChange(blocks.filter((_, k) => k !== i))}>
            <Icon name="trash" size={16} />
          </button>
        </div>
      ))}
      {error && <span className="error">{error}</span>}
      <button type="button" className="btn secondary small" style={{ justifySelf: "start" }} onClick={() => onChange([...blocks, { label: "", minutes: 30 }])} disabled={blocks.length >= 8}>
        <Icon name="plus" size={16} /> Agregar bloque
      </button>
    </div>
  );
}

export function TopicsEditor({ topics, onChange, errors }: { topics: Topic[]; onChange: (t: Topic[]) => void; errors: Record<string, string> }) {
  const set = (i: number, patch: Partial<Topic>) => onChange(topics.map((t, k) => (k === i ? { ...t, ...patch } : t)));
  return (
    <>
      {topics.map((t, i) => (
        <section className="card stack" key={i}>
          <div className="row between">
            <h2 style={{ fontSize: "1.2rem" }}>Tema {i + 1}</h2>
            <button type="button" className="btn ghost small" disabled={topics.length <= 1} onClick={() => onChange(topics.filter((_, k) => k !== i))}>
              <Icon name="trash" size={16} /> Quitar tema
            </button>
          </div>
          <div className="form-grid">
            <Field id={`topic${i}-title`} label={`Título del tema ${i + 1}`} error={errors[`topics.${i}.title`]}>
              <input id={`topic${i}-title`} className="input" value={t.title} onChange={(e) => set(i, { title: e.target.value })} />
            </Field>
            <Field id={`topic${i}-lang`} label="Lenguaje del ejemplo">
              <LanguageSelect id={`topic${i}-lang`} value={t.language} onChange={(language) => set(i, { language })} />
            </Field>
          </div>
          <Field id={`topic${i}-concept`} label="Concepto" hint="Usa `comillas invertidas` para marcar código en el texto.">
            <textarea id={`topic${i}-concept`} className="textarea" rows={7} value={t.concept} onChange={(e) => set(i, { concept: e.target.value })} />
          </Field>
          <Field id={`topic${i}-tip`} label="Consejo" hint="Un consejo corto: un error común, cómo estudiar o cómo depurar.">
            <textarea id={`topic${i}-tip`} className="textarea" rows={2} value={t.tip} onChange={(e) => set(i, { tip: e.target.value })} />
          </Field>
          <div className="form-grid">
            <Field id={`topic${i}-example`} label="Código de ejemplo">
              <textarea id={`topic${i}-example`} className="textarea code" rows={10} value={t.example} onChange={(e) => set(i, { example: e.target.value })} />
            </Field>
            <Field id={`topic${i}-output`} label="Lo que muestra al correrlo">
              <textarea id={`topic${i}-output`} className="textarea code" rows={10} value={t.exampleOutput} onChange={(e) => set(i, { exampleOutput: e.target.value })} />
            </Field>
          </div>
          <details>
            <summary className="muted" style={{ cursor: "pointer", fontSize: 14 }}>
              Vista previa del ejemplo
            </summary>
            <div style={{ marginTop: 12 }}>
              <CodeBlock code={t.example} language={t.language} output={t.exampleOutput} />
            </div>
          </details>
          <h3 style={{ margin: "8px 0 0", fontSize: "1.05rem" }}>Guía paso a paso ({t.steps.length} pasos)</h3>
          <StepsEditor steps={t.steps} language={t.language} onChange={(steps) => set(i, { steps })} idPrefix={`t${i}`} />
          <h3 style={{ margin: "8px 0 0", fontSize: "1.05rem" }}>Errores comunes ({t.commonErrors.length})</h3>
          <CommonErrorsEditor errors={t.commonErrors} onChange={(commonErrors) => set(i, { commonErrors })} idPrefix={`t${i}`} />
        </section>
      ))}
      <button type="button" className="btn secondary small" style={{ justifySelf: "start" }} onClick={() => onChange([...topics, emptyTopic(topics[0]?.language)])} disabled={topics.length >= 4}>
        <Icon name="plus" size={16} /> Agregar tema
      </button>
    </>
  );
}
