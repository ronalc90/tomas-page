import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useParams } from "react-router";
import { capitalize, formatLong, type DayResponse } from "@tomas/shared";
import { CodeBlock, RichText } from "../../components/CodeBlock";
import { DeliverablePanel } from "../../components/DeliverablePanel";
import { Icon } from "../../components/Icon";
import { Lesson } from "../../components/Lesson";
import { Quiz } from "../../components/Quiz";
import { useToast } from "../../components/Toast";
import { ErrorState, Loading, SaveIndicator, StatusPill } from "../../components/ui";
import { ApiError, errorMessage } from "../../lib/api";
import { useDay, useMe, usePlan, useProgress, useSaveDayProgress, useSubmitQuiz } from "../../lib/queries";
import { useAutosave } from "../../lib/useAutosave";

/** /hoy lleva al día de hoy, o al siguiente día con actividad. */
export function TodayRedirect() {
  const plan = usePlan();
  const progress = useProgress();
  if (plan.isLoading || progress.isLoading) return <Loading />;
  if (!plan.data || !progress.data) return <Navigate to="/" replace />;
  const dates = plan.data.weeks
    .flatMap((w) => [...w.days.map((d) => d.date), ...(w.deliverable ? [w.deliverable.dueDate] : [])])
    .sort();
  const target = dates.find((d) => d >= progress.data.today) ?? dates[dates.length - 1];
  return <Navigate to={`/dia/${target}`} replace />;
}

function Workshop({ data }: { data: DayResponse }) {
  const day = data.day!;
  const toast = useToast();
  const me = useMe();
  const saveProgress = useSaveDayProgress(data.date);
  const submitQuiz = useSubmitQuiz(data.date);
  const [tasks, setTasks] = useState<boolean[]>(data.progress.tasks);
  const [evidence, setEvidence] = useState(data.progress.evidence);
  const [openHints, setOpenHints] = useState<number[]>([]);
  const [challengeDone, setChallengeDoneState] = useState(data.progress.challengeDone);
  const challengePending = useRef(0);
  useEffect(() => {
    if (challengePending.current === 0) setChallengeDoneState(data.progress.challengeDone);
  }, [data.progress.challengeDone]);
  const autosave = useAutosave((value) => saveProgress.mutateAsync({ evidence: value }));

  // Igual que en los entregables: no se pisa lo marcado mientras haya guardados en camino.
  const pending = useRef(0);
  useEffect(() => {
    if (pending.current === 0) setTasks(data.progress.tasks);
  }, [data.progress.tasks]);

  const toggleTask = (i: number, checked: boolean) => {
    const next = tasks.map((t, k) => (k === i ? checked : t));
    setTasks(next);
    pending.current += 1;
    saveProgress.mutate(
      { tasks: next },
      {
        onError: (err) => toast(errorMessage(err), "error"),
        onSettled: () => {
          pending.current -= 1;
        },
      },
    );
  };

  const setChallengeDone = (checked: boolean) => {
    setChallengeDoneState(checked);
    challengePending.current += 1;
    saveProgress.mutate(
      { challengeDone: checked },
      {
        onError: (err) => toast(errorMessage(err), "error"),
        onSuccess: () => checked && toast("Reto marcado como hecho. ¡Bien!"),
        onSettled: () => {
          challengePending.current -= 1;
        },
      },
    );
  };

  const done = data.state.status === "done";

  return (
    <>
      <section className="section">
        <h2>
          <span className="step">1</span>
          Concepto
        </h2>
        {day.objectives.length > 0 && (
          <div className="objectives">
            <b>Al terminar hoy vas a poder:</b>
            <ul>
              {day.objectives.map((o, i) => (
                <li key={i}>
                  <RichText text={o} />
                </li>
              ))}
            </ul>
          </div>
        )}
        <p className="concept">
          <RichText text={day.concept} />
        </p>
        <CodeBlock code={day.example} language={day.language} output={day.exampleOutput} />
        {day.tip && (
          <aside className="tip" aria-label="Consejo del día">
            <Icon name="bulb" size={22} />
            <div>
              <strong>Consejo del día</strong>
              <p>
                <RichText text={day.tip} />
              </p>
            </div>
          </aside>
        )}
      </section>

      {day.steps.length > 0 && (
        <section className="section">
          <h2>
            <span className="step">2</span>
            Guía paso a paso
          </h2>
          <p className="muted">Sigue los pasos en orden. Cada uno se puede abrir y cerrar; el código lo puedes copiar.</p>
          <Lesson.Steps steps={day.steps} />
        </section>
      )}

      <section className="section">
        <h2>
          <span className="step">3</span>
          Taller
        </h2>
        <p className="muted">Haz cada tarea en tu computador y márcala cuando la termines. Si te atascas, abre la pista.</p>
        <ul className="checklist">
          {day.tasks.map((task, i) => (
            <li key={i}>
              <label className="check">
                <input type="checkbox" checked={tasks[i] ?? false} onChange={(e) => toggleTask(i, e.target.checked)} />
                <span>
                  <RichText text={task} />
                </span>
              </label>
              {day.taskHints[i] && (
                <div className="hint-row">
                  {openHints.includes(i) ? (
                    <p className="hint-text" role="status">
                      <Icon name="bulb" size={16} />
                      <span>
                        <RichText text={day.taskHints[i]} />
                      </span>
                    </p>
                  ) : (
                    <button type="button" className="btn ghost small" onClick={() => setOpenHints((h) => [...h, i])}>
                      <Icon name="bulb" size={16} /> Ver pista
                    </button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
        {day.commonErrors.length > 0 && <Lesson.CommonErrors errors={day.commonErrors} />}
        <div className="field">
          <div className="row between">
            <label htmlFor="evidence">Evidencia (opcional)</label>
            <SaveIndicator state={autosave.state} />
          </div>
          <textarea
            id="evidence"
            className="textarea code"
            rows={5}
            placeholder="Pega aquí tu código o escribe en dos líneas qué aprendiste hoy."
            value={evidence}
            onChange={(e) => {
              setEvidence(e.target.value);
              autosave.schedule(e.target.value);
            }}
            onBlur={() => void autosave.flush()}
          />
        </div>
      </section>

      {day.challenge && (
        <section className="section" id="reto">
          <h2>
            <span className="step">4</span>
            Reto extra
          </h2>
          <Lesson.Challenge challenge={day.challenge} done={challengeDone} onDone={setChallengeDone} />
        </section>
      )}

      {data.questions.length > 0 && (
        <section className="section" id="evaluacion">
          <h2>
            <span className="step">5</span>
            Evaluación del día
          </h2>
          <Quiz
            key={data.date}
            questions={data.questions}
            passScore={me.data?.settings.passScore ?? 3}
            attempts={data.quiz.attempts}
            best={data.quiz.best}
            last={data.quiz.last}
            onSubmit={async (input) => {
              const result = await submitQuiz.mutateAsync(input);
              toast(
                result.passed
                  ? `Evaluación aprobada: ${result.score} de ${result.total}.`
                  : `Sacaste ${result.score} de ${result.total}. Revisa las explicaciones y repítela.`,
              );
              return result;
            }}
          />
        </section>
      )}

      {done && (
        <div className="complete-banner" role="status">
          <b>Taller completo</b>
          <p>Hiciste las {day.tasks.length} tareas y aprobaste la evaluación.</p>
        </div>
      )}

      {(day.glossary.length > 0 || day.resources.length > 0) && (
        <section className="section">
          <h2>
            <span className="step">6</span>
            Para profundizar
          </h2>
          <Lesson.Glossary items={day.glossary} resources={day.resources} />
        </section>
      )}
    </>
  );
}

function RestDay({ data }: { data: DayResponse }) {
  const progress = useProgress();
  const pending = progress.data?.pending.filter((p) => p.date < data.date) ?? [];
  return (
    <section className="section">
      <p className="concept">{data.day!.summary}</p>
      <h2>Para ponerte al día</h2>
      {pending.length ? (
        <div className="chips">
          {pending.map((p) => (
            <Link key={`${p.type}-${p.ref}`} className="chip" to={`/dia/${p.date}`}>
              <span className="when">{p.date.slice(5)}</span>
              {p.title}
            </Link>
          ))}
        </div>
      ) : (
        <p className="muted">No tienes pendientes. Descansa.</p>
      )}
    </section>
  );
}

export function DayPage() {
  const { date = "" } = useParams();
  const { data, isLoading, error, refetch } = useDay(date);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [date]);

  if (isLoading) return <Loading />;
  if (error) {
    if (error instanceof ApiError && error.status === 404) {
      return (
        <div className="page narrow">
          <div className="empty">
            <h3>Ese día no está en el plan</h3>
            <p>El plan va del 27 de septiembre al 30 de diciembre de 2026.</p>
            <Link className="btn" to="/hoy">
              Ir a hoy
            </Link>
          </div>
        </div>
      );
    }
    return <ErrorState error={error} retry={() => void refetch()} />;
  }

  const d = data!;
  const head = d.day ?? null;
  const deliverable = d.deliverable;
  const phaseId = head?.phaseId ?? deliverable?.phaseId ?? 0;
  const weekNumber = head?.weekNumber ?? deliverable?.weekNumber;
  const weekTitle = head?.weekTitle ?? deliverable?.weekTitle;
  const isWorkshop = head?.kind === "workshop";
  const title = head ? head.title : deliverable!.title;

  return (
    <div className={`page narrow p${phaseId}`}>
      <nav className="day-nav" aria-label="Cambiar de día">
        {d.nav.prev ? (
          <Link className="btn secondary icon" to={`/dia/${d.nav.prev}`} aria-label="Día anterior">
            <Icon name="left" />
          </Link>
        ) : (
          <span />
        )}
        <span className="date">{capitalize(formatLong(d.date))}</span>
        {d.nav.next ? (
          <Link className="btn secondary icon" to={`/dia/${d.nav.next}`} aria-label="Día siguiente">
            <Icon name="right" />
          </Link>
        ) : (
          <span />
        )}
      </nav>

      <header className="day-head">
        <p className="eyebrow">
          Semana {weekNumber} · {weekTitle}
          {head?.phaseName ? ` · ${head.phaseName}` : ""}
        </p>
        <h1>{title}</h1>
        <div className="row">
          {isWorkshop && <StatusPill status={d.state.status} />}
          {head && !isWorkshop && <span className="pill rest">{head.kind === "holiday" ? "Festivo" : "Día libre"}</span>}
        </div>
      </header>

      {isWorkshop && <Workshop data={d} />}
      {head && !isWorkshop && <RestDay data={d} />}

      {deliverable && (
        <div className="stack" style={isWorkshop ? { borderTop: "1px solid var(--rule)", paddingTop: 28 } : undefined}>
          {isWorkshop && <h2 style={{ fontSize: "1.6rem", fontWeight: 800 }}>{deliverable.title}</h2>}
          <DeliverablePanel deliverable={deliverable} startStep={isWorkshop ? 7 : 1} />
        </div>
      )}
    </div>
  );
}
