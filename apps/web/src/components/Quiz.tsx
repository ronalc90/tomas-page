import { useEffect, useState, type FormEvent } from "react";
import type { QuestionView, QuizResult } from "@tomas/shared";
import { errorMessage } from "../lib/api";
import { RichText } from "./CodeBlock";

interface Props {
  questions: QuestionView[];
  passScore: number;
  attempts: number;
  best: number;
  last: QuizResult | null;
  onSubmit: (answers: number[]) => Promise<QuizResult>;
}

/**
 * Evaluación del día. La calificación ocurre en el servidor; la revisión
 * (respuesta correcta y explicación) solo llega después de presentar.
 */
export function Quiz({ questions, passScore, attempts, best, last, onSubmit }: Props) {
  const [answers, setAnswers] = useState<(number | null)[]>(() => questions.map(() => null));
  const [result, setResult] = useState<QuizResult | null>(last);
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    setResult(last);
  }, [last]);

  const needed = Math.min(passScore, questions.length);
  const reviewing = result !== null && !retrying;
  const missing = answers.filter((a) => a === null).length;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (missing > 0) {
      setError(`Te falta responder ${missing === 1 ? "1 pregunta" : `${missing} preguntas`}.`);
      return;
    }
    setError(null);
    setSending(true);
    try {
      const res = await onSubmit(answers as number[]);
      setResult(res);
      setRetrying(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSending(false);
    }
  };

  const retry = () => {
    setAnswers(questions.map(() => null));
    setRetrying(true);
    setError(null);
  };

  return (
    <form className={`quiz ${reviewing ? "graded" : ""}`} onSubmit={submit} noValidate>
      <p>
        {questions.length} preguntas. Apruebas con {needed} correctas. Puedes repetirla las veces que quieras: queda tu
        mejor nota.
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
        return (
          <fieldset className="question" key={q.position}>
            <legend>
              <span className="n">{i + 1}.</span>
              <span>
                <RichText text={q.prompt} />
              </span>
            </legend>
            {q.code && (
              <pre className="snippet">
                <code>{q.code}</code>
              </pre>
            )}
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
                      onChange={() => setAnswers((prev) => prev.map((a, k) => (k === i ? j : a)))}
                    />
                    <span>
                      <RichText text={option} />
                    </span>
                  </label>
                );
              })}
            </div>
            {review && (
              <p className={`explanation ${review.isCorrect ? "" : "wrong"}`}>
                <b>{review.isCorrect ? "Correcto." : "Incorrecto."}</b>
                <RichText text={review.explanation} />
              </p>
            )}
          </fieldset>
        );
      })}

      {reviewing ? (
        <div className={`result ${result!.passed ? "passed" : "failed"}`} role="status">
          <span className="score">
            {result!.score} / {result!.total}
          </span>
          <span>{result!.passed ? "Evaluación aprobada." : "Todavía no. Repasa el concepto y vuelve a intentarlo."}</span>
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
            <span className="error" role="alert" style={{ color: "var(--warn)", fontWeight: 700 }}>
              {error}
            </span>
          )}
        </div>
      )}
    </form>
  );
}
