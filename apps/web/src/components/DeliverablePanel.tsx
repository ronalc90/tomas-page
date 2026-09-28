import { useEffect, useRef, useState } from "react";
import { DELIVERABLE_KIND_LABEL, formatLong, type DeliverableView } from "@tomas/shared";
import { errorMessage } from "../lib/api";
import { dateTime } from "../lib/format";
import { useSaveSubmission, useSubmissionAction } from "../lib/queries";
import { useAutosave } from "../lib/useAutosave";
import { RichText } from "./CodeBlock";
import { Icon } from "./Icon";
import { useToast } from "./Toast";
import { SaveIndicator, SubmissionPill } from "./ui";

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

  const ready = criteria.length > 0 && criteria.every(Boolean) && evidence.trim().length > 0;
  const missing = criteria.filter((c) => !c).length;

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
        <p className="concept">
          <RichText text={deliverable.description} />
        </p>
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
            <span className="step">{startStep + 1}</span>
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

      <section className="section">
        <h2>
          <span className="step">{startStep + 2}</span>
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
        <p className="muted">Marca cada criterio solo cuando lo hayas comprobado en tu programa.</p>
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
          <span className="step">{startStep + 3}</span>
          Tu evidencia
        </h2>
        <div className="field">
          <div className="row between">
            <label htmlFor={`ev-${deliverable.id}`}>Enlace a tu código en GitHub, o pega el código, y cuenta qué fue lo más difícil</label>
            <SaveIndicator state={autosave.state} />
          </div>
          <textarea
            id={`ev-${deliverable.id}`}
            className="textarea code"
            rows={6}
            value={evidence}
            readOnly={locked}
            placeholder="https://github.com/…  o  tu código"
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
            <span className="muted">{ready ? "Todo listo para enviar." : missingText(missing, !evidence.trim())}</span>
          </div>
        )}
      </section>
    </>
  );
}

function missingText(criteria: number, noEvidence: boolean): string {
  const parts: string[] = [];
  if (criteria) parts.push(`${criteria} criterio${criteria === 1 ? "" : "s"}`);
  if (noEvidence) parts.push("tu evidencia");
  const plural = criteria > 1 || parts.length > 1;
  return `Falta${plural ? "n" : ""} ${parts.join(" y ")}.`;
}
