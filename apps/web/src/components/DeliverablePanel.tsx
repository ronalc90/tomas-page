import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { DELIVERABLE_KIND_LABEL, formatLong, type DeliverableView } from "@tomas/shared";
import { errorMessage } from "../lib/api";
import { dateTime } from "../lib/format";
import { useSaveSubmission, useSubmissionAction } from "../lib/queries";
import { useAutosave } from "../lib/useAutosave";
import { RichText } from "./CodeBlock";
import { Icon } from "./Icon";
import { useToast } from "./Toast";
import { Loading, SaveIndicator, SubmissionPill } from "./ui";

const Exercises = lazy(() => import("./Exercises"));

export function DeliverablePanel({ deliverable, startStep = 1 }: { deliverable: DeliverableView; startStep?: number }) {
  const toast = useToast();
  const save = useSaveSubmission(deliverable.id);
  const action = useSubmissionAction(deliverable.id);
  const sub = deliverable.submission;
  const locked = sub?.status === "submitted" || sub?.status === "approved";
  const [criteria, setCriteria] = useState<boolean[]>(() => sub?.criteria ?? deliverable.criteria.map(() => false));
  const [evidence, setEvidence] = useState(sub?.evidence ?? "");
  const autosave = useAutosave((value) => save.mutateAsync({ evidence: value }));

  // Mientras haya guardados en camino, manda lo que el estudiante marcó en pantalla:
  // así una respuesta atrasada del servidor no desmarca una casilla recién marcada.
  const pending = useRef(0);
  useEffect(() => {
    if (pending.current === 0) setCriteria(sub?.criteria ?? deliverable.criteria.map(() => false));
  }, [sub?.criteria, deliverable.criteria]);

  const toggle = (i: number, checked: boolean) => {
    const next = criteria.map((c, k) => (k === i ? checked : c));
    setCriteria(next);
    pending.current += 1;
    save.mutate(
      { criteria: next },
      {
        onError: (err) => toast(errorMessage(err), "error"),
        onSettled: () => {
          pending.current -= 1;
        },
      },
    );
  };

  const exercisesMissing = deliverable.exercises.filter((e) => !e.state.solved).length;
  const ready = criteria.length > 0 && criteria.every(Boolean) && evidence.trim().length > 0 && exercisesMissing === 0;
  const missing = criteria.filter((c) => !c).length;
  const hasExercises = deliverable.exercises.length > 0;
  // Numeración de las secciones según lo que tiene el entregable.
  let n = startStep;
  const step = {
    how: deliverable.steps.length > 0 || deliverable.tips.length > 0 || deliverable.stretch ? ++n : 0,
    exercises: hasExercises ? ++n : 0,
    review: ++n,
    evidence: ++n,
  };

  const run = async (kind: "submit" | "withdraw") => {
    try {
      await autosave.flush();
      await action.mutateAsync(kind);
      toast(kind === "submit" ? "Entregable enviado. Queda en revisión." : "Entregable retirado. Puedes editarlo.");
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  return (
    <>
      <section className="section">
        <h2>
          <span className="step">{startStep}</span>
          Qué entregar
        </h2>
        <div className="row">
          <span className="tag">{DELIVERABLE_KIND_LABEL[deliverable.kind]}</span>
          <SubmissionPill status={sub?.status ?? null} />
          <span className="muted">Fecha: {formatLong(deliverable.dueDate)}</span>
        </div>
        <p className="path">{deliverable.path}</p>
        <div className="concept">
          <RichText text={deliverable.description} block />
        </div>
        {sub?.feedback && (sub.status === "changes_requested" || sub.status === "approved") && (
          <div className={`feedback ${sub.status}`}>
            <b>
              {sub.status === "approved" ? "Aprobado" : "Cambios pedidos"} por {sub.reviewerName ?? "el administrador"} ·{" "}
              {dateTime(sub.reviewedAt)}
            </b>
            <p>{sub.feedback}</p>
          </div>
        )}
      </section>

      {(deliverable.steps.length > 0 || deliverable.tips.length > 0 || deliverable.stretch) && (
        <section className="section">
          <h2>
            <span className="step">{step.how}</span>
            Cómo abordarlo
          </h2>
          {deliverable.steps.length > 0 && (
            <ol className="how-to">
              {deliverable.steps.map((s, i) => (
                <li key={i}>
                  <RichText text={s} />
                </li>
              ))}
            </ol>
          )}
          {deliverable.tips.length > 0 && (
            <aside className="tip" aria-label="Consejos para el entregable">
              <Icon name="bulb" size={22} />
              <div>
                <strong>Lo que mira el revisor</strong>
                <ul className="plain">
                  {deliverable.tips.map((t, i) => (
                    <li key={i}>
                      <RichText text={t} />
                    </li>
                  ))}
                </ul>
              </div>
            </aside>
          )}
          {deliverable.stretch && (
            <div className="challenge small">
              <div className="challenge-head">
                <Icon name="flame" size={20} />
                <h3>Si quieres ir más allá</h3>
                <span className="tag">Opcional</span>
              </div>
              <p>
                <RichText text={deliverable.stretch} />
              </p>
            </div>
          )}
        </section>
      )}

      {hasExercises && (
        <section className="section" id={`ejercicios-${deliverable.id}`}>
          <h2>
            <span className="step">{step.exercises}</span>
            Preguntas del informe
          </h2>
          <p className="muted">
            Cada pregunta se responde con una consulta que se califica sola. Para enviar el entregable tienen que estar todas resueltas.
          </p>
          <Suspense fallback={<Loading label="Cargando los ejercicios…" />}>
            <Exercises exercises={deliverable.exercises} scope={{ kind: "deliverable", id: deliverable.id, dueDate: deliverable.dueDate }} />
          </Suspense>
        </section>
      )}

      <section className="section">
        <h2>
          <span className="step">{step.review}</span>
          Revisa antes de entregar
        </h2>
        {deliverable.checklist.length > 0 && (
          <ul className="plain checklist-plain">
            {deliverable.checklist.map((c, i) => (
              <li key={i}>
                <Icon name="check" size={16} /> <RichText text={c} />
              </li>
            ))}
          </ul>
        )}
        <p className="muted">Marca cada criterio solo cuando lo hayas comprobado{hasExercises ? "" : " en tu programa"}.</p>
        <ul className="checklist">
          {deliverable.criteria.map((c, i) => (
            <li key={i}>
              <label className="check">
                <input type="checkbox" checked={criteria[i] ?? false} disabled={locked} onChange={(e) => toggle(i, e.target.checked)} />
                <span>
                  <RichText text={c} />
                </span>
              </label>
            </li>
          ))}
        </ul>
      </section>

      <section className="section">
        <h2>
          <span className="step">{step.evidence}</span>
          {hasExercises ? "Tu conclusión" : "Tu evidencia"}
        </h2>
        <div className="field">
          <div className="row between">
            <label htmlFor={`ev-${deliverable.id}`}>
              {hasExercises
                ? "Qué descubriste en los datos: escribe tu conclusión con los números que encontraste"
                : "Enlace a tu código en GitHub, o pega el código, y cuenta qué fue lo más difícil"}
            </label>
            <SaveIndicator state={autosave.state} />
          </div>
          <textarea
            id={`ev-${deliverable.id}`}
            className="textarea code"
            rows={6}
            value={evidence}
            readOnly={locked}
            placeholder={hasExercises ? "Por ejemplo: la categoría que más vende es… porque…" : "https://github.com/…  o  tu código"}
            onChange={(e) => {
              setEvidence(e.target.value);
              autosave.schedule(e.target.value);
            }}
            onBlur={() => void autosave.flush()}
          />
        </div>
        {sub?.status === "approved" ? (
          <div className="alert ok">Este entregable está aprobado. ¡Buen trabajo!</div>
        ) : locked ? (
          <div className="row">
            <span className="muted">Enviado el {dateTime(sub?.submittedAt)}. Queda en revisión.</span>
            <button type="button" className="btn secondary" disabled={action.isPending} onClick={() => run("withdraw")}>
              Retirar para editar
            </button>
          </div>
        ) : (
          <div className="row">
            <button type="button" className="btn" disabled={!ready || action.isPending} onClick={() => run("submit")}>
              {sub?.status === "changes_requested" ? "Reenviar entregable" : "Enviar entregable"}
            </button>
            <span className="muted">{ready ? "Todo listo para enviar." : missingText(missing, !evidence.trim(), exercisesMissing)}</span>
          </div>
        )}
      </section>
    </>
  );
}

function missingText(criteria: number, noEvidence: boolean, exercises = 0): string {
  const parts: string[] = [];
  if (exercises) parts.push(`${exercises} ejercicio${exercises === 1 ? "" : "s"} por resolver`);
  if (criteria) parts.push(`${criteria} criterio${criteria === 1 ? "" : "s"}`);
  if (noEvidence) parts.push(exercises || criteria ? "tu texto" : "tu evidencia");
  const plural = criteria > 1 || exercises > 1 || parts.length > 1;
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} y ${parts[parts.length - 1]}` : parts[0];
  return `Falta${plural ? "n" : ""} ${list}.`;
}
