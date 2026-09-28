import { useState } from "react";
import type { Challenge, CommonError, GlossaryItem, Resource, TutorialStep } from "@tomas/shared";
import { CodeBlock, RichText } from "./CodeBlock";
import { Icon } from "./Icon";

/** Piezas de la lección del día: guía paso a paso, errores comunes, reto y glosario. */

function Steps({ steps }: { steps: TutorialStep[] }) {
  const [open, setOpen] = useState<number[]>([0]);
  const toggle = (i: number) => setOpen((o) => (o.includes(i) ? o.filter((x) => x !== i) : [...o, i]));
  const all = open.length === steps.length;
  return (
    <div className="steps">
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button type="button" className="btn ghost small" onClick={() => setOpen(all ? [] : steps.map((_, i) => i))}>
          {all ? "Cerrar todos" : "Abrir todos"}
        </button>
      </div>
      <ol className="step-list">
        {steps.map((s, i) => {
          const isOpen = open.includes(i);
          return (
            <li key={i} className={isOpen ? "open" : ""}>
              <button type="button" className="step-head" aria-expanded={isOpen} aria-controls={`paso-${i}`} onClick={() => toggle(i)}>
                <span className="step-n">{i + 1}</span>
                <span className="step-title">{s.title}</span>
                <Icon name={isOpen ? "up" : "down"} size={18} />
              </button>
              {isOpen && (
                <div className="step-body" id={`paso-${i}`}>
                  <p>
                    <RichText text={s.body} />
                  </p>
                  {s.code && <CodeBlock code={s.code} language={s.language} />}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function CommonErrors({ errors }: { errors: CommonError[] }) {
  return (
    <details className="common-errors">
      <summary>
        <Icon name="alert" size={18} /> Errores comunes de hoy ({errors.length})
      </summary>
      <dl>
        {errors.map((e, i) => (
          <div key={i} className="common-error">
            <dt>
              <code>{e.error}</code>
            </dt>
            <dd>
              <span className="label">Por qué pasa:</span> <RichText text={e.cause} />
            </dd>
            <dd>
              <span className="label">Cómo se arregla:</span> <RichText text={e.fix} />
            </dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

function ChallengeCard({ challenge, done, onDone }: { challenge: Challenge; done: boolean; onDone: (checked: boolean) => void }) {
  const [hint, setHint] = useState(false);
  const [solution, setSolution] = useState(false);
  return (
    <div className={`challenge ${done ? "done" : ""}`}>
      <div className="challenge-head">
        <Icon name="flame" size={22} />
        <h3>{challenge.title}</h3>
        <span className="tag">Opcional</span>
      </div>
      <p>
        <RichText text={challenge.description} />
      </p>
      <div className="row">
        {challenge.hint && !hint && (
          <button type="button" className="btn ghost small" onClick={() => setHint(true)}>
            <Icon name="bulb" size={16} /> Ver pista
          </button>
        )}
        {challenge.solution && !solution && (
          <button type="button" className="btn ghost small" onClick={() => setSolution(true)}>
            <Icon name="eye" size={16} /> Ver una solución
          </button>
        )}
      </div>
      {hint && (
        <p className="hint-text" role="status">
          <Icon name="bulb" size={16} />
          <span>
            <RichText text={challenge.hint} />
          </span>
        </p>
      )}
      {solution && (
        <div className="stack">
          <p className="muted small">Inténtalo primero por tu cuenta. Esta es una forma de resolverlo, no la única.</p>
          <CodeBlock code={challenge.solution} language={challenge.language} />
        </div>
      )}
      <label className="check">
        <input type="checkbox" checked={done} onChange={(e) => onDone(e.target.checked)} />
        <span>Hice el reto</span>
      </label>
    </div>
  );
}

function Glossary({ items, resources }: { items: GlossaryItem[]; resources: Resource[] }) {
  return (
    <div className="glossary-grid">
      {items.length > 0 && (
        <div>
          <h3>Glosario del día</h3>
          <dl className="glossary">
            {items.map((g, i) => (
              <div key={i}>
                <dt>{g.term}</dt>
                <dd>
                  <RichText text={g.definition} />
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}
      {resources.length > 0 && (
        <div>
          <h3>Documentación oficial</h3>
          <ul className="resources">
            {resources.map((r, i) => (
              <li key={i}>
                <a href={r.url} target="_blank" rel="noreferrer noopener">
                  <Icon name="external" size={16} /> {r.title}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export const Lesson = { Steps, CommonErrors, Challenge: ChallengeCard, Glossary };
