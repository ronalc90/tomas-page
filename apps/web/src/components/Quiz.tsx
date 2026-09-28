import { useEffect, useState, type FormEvent } from "react";
import { QUESTION_TYPE_LABEL, isTextQuestion, type Answer, type QuestionView, type QuizResult } from "@tomas/shared";
import { errorMessage } from "../lib/api";
import { RichText } from "./CodeBlock";
import { Icon } from "./Icon";

interface Props {
  questions: QuestionView[];
  passScore: number;
  attempts: number;
  best: number;
  last: QuizResult | null;
  onSubmit: (input: { answers: Answer[]; hints: number[] }) => Promise<QuizResult>;
}

const TYPE_HELP: Record<QuestionView["type"], string> = {
  choice: "Elige una opción.",
  boolean: "¿Verdadero o falso?",
  output: "Escribe exactamente lo que muestra el programa (una línea por cada print).",
  fill: "Escribe solo lo que va en el hueco ____.",
};

/**
 * Evaluación del día con cuatro tipos de pregunta. La calificación ocurre en el servidor;
 * la revisión (respuesta correcta, explicación y comentario por opción) solo llega después de presentar.
 */
export function Quiz({ questions, passScore, attempts, best, last, onSubmit }: Props) {
  const empty = () => questions.map((q) => (isTextQuestion(q.type) ? "" : null)) as (Answer | null)[];
  const [answers, setAnswers] = useState<(Answer | null)[]>(empty);
  const [hints, setHints] = useState<number[]>([]);
  const [result, setResult] = useState<QuizResult | null>(last);
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    setResult(last);
  }, [last]);

  const needed = Math.min(passScore, questions.length);
  const reviewing = result !== null && !retrying;
  const isMissing = (a: Answer | null) => a === null || (typeof a === "string" && a.trim() === "");
  const missing = answers.filter(isMissing).length;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (missing > 0) {
      setError(`Te falta responder ${missing === 1 ? "1 pregunta" : `${missing} preguntas`}.`);
      return;
    }
    setError(null);
    setSending(true);
    try {
      const res = await onSubmit({ answers: answers as Answer[], hints });
      setResult(res);
      setRetrying(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSending(false);
    }
  };

  const retry = () => {
    setAnswers(empty());
    setHints([]);
    setRetrying(true);
    setError(null);
  };

  const setAnswer = (i: number, value: Answer) => setAnswers((prev) => prev.map((a, k) => (k === i ? value : a)));
  const showHint = (i: number) => setHints((prev) => (prev.includes(i) ? prev : [...prev, i]));

  const failed = reviewing ? result!.review.filter((r) => !r.isCorrect) : [];

  return (
    <form className={`quiz ${reviewing ? "graded" : ""}`} onSubmit={submit} noValidate>
      <p>
        {questions.length} preguntas de distintos tipos. Apruebas con {needed} correctas. Puedes repetirla las veces que quieras:
        queda tu mejor nota. Cada pregunta tiene una pista si la necesitas.
        {attempts > 0 && (
          <>
            {" "}
            <span className="muted">
              Mejor nota: <b className="num">{best} / {questions.length}</b> · Intentos: <b className="num">{attempts}</b>
            </span>
          </>
        )}
      </p>

      {questions.map((q, i) => {
        const review = reviewing ? result!.review[i] : null;
        const chosen = reviewing ? review?.chosen : answers[i];
        const hintOpen = reviewing ? result!.hintsUsed.includes(i) : hints.includes(i);
        const text = isTextQuestion(q.type);
        return (
          <fieldset className={`question ${review ? (review.isCorrect ? "ok" : "bad") : ""}`} key={q.position}>
            <legend>
              <span className="n">{i + 1}.</span>
              <span>
                <span className="qtype">{QUESTION_TYPE_LABEL[q.type]}</span>
                <RichText text={q.prompt} />
              </span>
            </legend>
            {q.code && (
              <pre className="snippet" tabIndex={0}>
                <code>{q.code}</code>
              </pre>
            )}
            {text ? (
              <div className="answer-box">
                <label htmlFor={`q${i}-text`} className="muted small">
                  {TYPE_HELP[q.type]}
                </label>
                {q.type === "output" ? (
                  <textarea
                    id={`q${i}-text`}
                    name={`q${i}`}
                    className={`textarea code ${review ? (review.isCorrect ? "correct" : "wrong") : ""}`}
                    rows={2}
                    value={(chosen as string) ?? ""}
                    readOnly={reviewing}
                    onChange={(e) => setAnswer(i, e.target.value)}
                  />
                ) : (
                  <input
                    id={`q${i}-text`}
                    name={`q${i}`}
                    className={`input code ${review ? (review.isCorrect ? "correct" : "wrong") : ""}`}
                    autoComplete="off"
                    spellCheck={false}
                    value={(chosen as string) ?? ""}
                    readOnly={reviewing}
                    onChange={(e) => setAnswer(i, e.target.value)}
                  />
                )}
                {review && !review.isCorrect && (
                  <p className="correct-answer">
                    Respuesta correcta: <code>{String(review.correct)}</code>
                  </p>
                )}
              </div>
            ) : (
              <div className="options">
                {q.options.map((option, j) => {
                  let cls = "option";
                  if (review) {
                    if (j === review.correct) cls += " correct";
                    else if (j === review.chosen) cls += " wrong";
                  }
                  return (
                    <label className={cls} key={j}>
                      <input
                        type="radio"
                        name={`q${i}`}
                        value={j}
                        checked={chosen === j}
                        disabled={reviewing}
                        onChange={() => setAnswer(i, j)}
                      />
                      <span>
                        <RichText text={option} />
                      </span>
                    </label>
                  );
                })}
              </div>
            )}

            {q.hint && !review && (
              <div className="hint-row">
                {hintOpen ? (
                  <p className="hint-text" role="status">
                    <Icon name="bulb" size={16} />
                    <span>
                      <RichText text={q.hint} />
                    </span>
                  </p>
                ) : (
                  <button type="button" className="btn ghost small" onClick={() => showHint(i)}>
                    <Icon name="bulb" size={16} /> Ver pista
                  </button>
                )}
              </div>
            )}

            {review && (
              <div className={`explanation ${review.isCorrect ? "" : "wrong"}`}>
                <b>{review.isCorrect ? "Correcto." : "Incorrecto."}</b>
                {review.feedback && (
                  <p>
                    <RichText text={review.feedback} />
                  </p>
                )}
                <p>
                  <RichText text={review.explanation} />
                </p>
                {hintOpen && <p className="muted small">Usaste la pista en esta pregunta.</p>}
              </div>
            )}
          </fieldset>
        );
      })}

      {reviewing ? (
        <div className={`result ${result!.passed ? "passed" : "failed"}`} role="status">
          <span className="score">
            {result!.score} / {result!.total}
          </span>
          <span>
            {result!.passed ? "Evaluación aprobada." : "Todavía no. Repasa y vuelve a intentarlo."}
            {result!.hintsUsed.length > 0 && ` Usaste ${result!.hintsUsed.length === 1 ? "1 pista" : `${result!.hintsUsed.length} pistas`}.`}
          </span>
          <button type="button" className="btn secondary" onClick={retry}>
            Intentar de nuevo
          </button>
        </div>
      ) : (
        <div className="row">
          <button type="submit" className="btn" disabled={sending}>
            {sending ? "Calificando…" : "Calificar"}
          </button>
          {retrying && (
            <button type="button" className="btn ghost" onClick={() => setRetrying(false)}>
              Ver mi último resultado
            </button>
          )}
          {error && (
            <span className="error" role="alert" style={{ color: "var(--warn-text)", fontWeight: 700 }}>
              {error}
            </span>
          )}
        </div>
      )}

      {reviewing && failed.length > 0 && (
        <aside className="review-plan" aria-label="Qué repasar">
          <Icon name="book" size={18} />
          <p>
            <b>Qué repasar:</b> {failed.length === 1 ? "la pregunta" : "las preguntas"}{" "}
            {failed.map((r) => r.position + 1).join(", ")}. Lee la explicación de cada una, vuelve a la guía paso a paso del tema y
            repite la evaluación cuando te sientas seguro.
          </p>
        </aside>
      )}
    </form>
  );
}
