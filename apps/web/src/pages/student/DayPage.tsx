import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Link, Navigate, useParams } from "react-router";
import { capitalize, formatLong, formatMinutes, type DayResponse } from "@tomas/shared";
import { CodeBlock, GlossaryProvider, RichText } from "../../components/CodeBlock";
import { DeliverablePanel } from "../../components/DeliverablePanel";
import { Icon } from "../../components/Icon";
import { Lesson } from "../../components/Lesson";
import { Quiz } from "../../components/Quiz";
import { useToast } from "../../components/Toast";
import { ErrorState, Loading, ProgressBar, SaveIndicator, StatusPill } from "../../components/ui";
import { ApiError, errorMessage } from "../../lib/api";
import { useDay, useMe, usePlan, useProgress, useSaveDayProgress, useSubmitQuiz } from "../../lib/queries";
import { useAutosave } from "../../lib/useAutosave";

// Los ejercicios traen el editor (CodeMirror): se descargan aparte.
const Exercises = lazy(() => import("../../components/Exercises"));

/** Resumen del avance del día: ejercicios, tareas, evaluación y minutos de estudio. */
function DayProgress({ data }: { data: DayResponse }) {
  const progress = useProgress();
  const me = useMe();
  const st = data.state;
  const pass = Math.min(me.data?.settings.passScore ?? 5, st.total);
  const minutes = progress.data?.study[data.date] ?? 0;
  const parts = [
    st.exercisesTotal > 0 ? st.exercisesDone / st.exercisesTotal : null,
    st.tasksTotal > 0 ? st.tasksDone / st.tasksTotal : null,
    st.total > 0 ? Math.min(1, st.best / Math.max(1, pass)) : null,
  ].filter((x): x is number => x !== null);
  const overall = parts.length ? parts.reduce((a, b) => a + b, 0) / parts.length : 0;
  return (
    <section className="day-progress" aria-label="Tu avance de hoy">
      {st.exercisesTotal > 0 && (
        <div>
          <span className="label">Ejercicios SQL</span>
          <span className="value">
            {st.exercisesDone} <span className="muted">/ {st.exercisesTotal}</span>
          </span>
          <ProgressBar thin value={st.exercisesDone / st.exercisesTotal} label="Ejercicios resueltos" />
        </div>
      )}
      {st.tasksTotal > 0 && (
        <div>
          <span className="label">Tareas</span>
          <span className="value">
            {st.tasksDone} <span className="muted">/ {st.tasksTotal}</span>
          </span>
          <ProgressBar thin value={st.tasksDone / st.tasksTotal} label="Tareas marcadas" />
        </div>
      )}
      {st.total > 0 && (
        <div>
          <span className="label">Evaluación</span>
          <span className="value">
            {st.attempts ? (
              <>
                {st.best} <span className="muted">/ {st.total}</span> {st.best >= pass && <Icon name="check" size={18} />}
              </>
            ) : (
              <span className="muted">Pendiente</span>
            )}
          </span>
          <span className="muted small">Aprueba con {pass}</span>
        </div>
      )}
      <div>
        <span className="label">Estudio de este día</span>
        <span className="value">{formatMinutes(minutes)}</span>
        <span className="muted small">{st.status === "done" ? "Taller completo" : `${Math.round(overall * 100)} % del taller`}</span>
      </div>
    </section>
  );
}

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
  // Numeración de las secciones: se salta lo que el día no tiene.
  let n = day.topics.length + 1;
  const step = {
    exercises: data.exercises.length > 0 ? ++n : 0,
    tasks: day.tasks.length > 0 ? ++n : 0,
    challenge: day.challenge ? ++n : 0,
    quiz: data.questions.length > 0 ? ++n : 0,
    more: ++n,
  };
  const doneParts = [
    data.exercises.length ? `resolviste los ${data.exercises.length} ejercicios` : "",
    day.tasks.length ? `hiciste las ${day.tasks.length} tareas` : "",
    data.questions.length ? "aprobaste la evaluación" : "",
  ].filter(Boolean);

  return (
    <GlossaryProvider items={day.glossary}>
      <section className="section">
        <h2>
          <span className="step">1</span>
          Hoy
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
        {day.schedule.length > 0 && <Lesson.Schedule blocks={day.schedule} />}
        <p className="muted small">
          Puedes leer y estudiar cualquier día del plan, aunque no lo hayas hecho todavía: usa el calendario, el temario o las flechas de arriba.
        </p>
      </section>

      {day.topics.map((topic, t) => (
        <section className="section topic" key={t} id={`tema-${t + 1}`}>
          <h2>
            <span className="step">{t + 2}</span>
            Tema {t + 1}: {topic.title}
          </h2>
          <div className="concept">
            <RichText text={topic.concept} block />
          </div>
          {topic.example && <CodeBlock code={topic.example} language={topic.language} output={topic.exampleOutput} />}
          {topic.tip && (
            <aside className="tip" aria-label={`Consejo del tema ${t + 1}`}>
              <Icon name="bulb" size={22} />
              <div>
                <strong>Consejo</strong>
                <p>
                  <RichText text={topic.tip} />
                </p>
              </div>
            </aside>
          )}
          {topic.steps.length > 0 && (
            <>
              <h3 className="sub-heading">Guía paso a paso</h3>
              <p className="muted">
                Sigue los pasos en orden. Cada uno se puede abrir y cerrar; los ejemplos de SQL los puedes ejecutar aquí mismo o abrir en el
                laboratorio.
              </p>
              <Lesson.Steps steps={topic.steps} idPrefix={`t${t}`} />
            </>
          )}
          {topic.commonErrors.length > 0 && <Lesson.CommonErrors errors={topic.commonErrors} />}
        </section>
      ))}

      {data.exercises.length > 0 && (
        <section className="section" id="ejercicios">
          <h2>
            <span className="step">{step.exercises}</span>
            Práctica: ejercicios SQL
          </h2>
          <p className="muted">
            Escribe cada consulta y usa <b>Ejecutar</b> para ver qué devuelve (no cuenta como intento). Cuando creas que está bien, usa{" "}
            <b>Comprobar</b>: se califica en el servidor con una copia limpia de la base.
          </p>
          <Suspense fallback={<Loading label="Cargando los ejercicios…" />}>
            <Exercises exercises={data.exercises} scope={{ kind: "day", date: data.date }} />
          </Suspense>
        </section>
      )}

      {day.tasks.length > 0 && (
        <section className="section" id="tareas">
          <h2>
            <span className="step">{step.tasks}</span>
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
      )}

      {day.challenge && (
        <section className="section" id="reto">
          <h2>
            <span className="step">{step.challenge}</span>
            Reto extra
          </h2>
          <Lesson.Challenge challenge={day.challenge} done={challengeDone} onDone={setChallengeDone} />
        </section>
      )}

      {data.questions.length > 0 && (
        <section className="section" id="evaluacion">
          <h2>
            <span className="step">{step.quiz}</span>
            Evaluación del día
          </h2>
          <Quiz
            key={data.date}
            questions={data.questions}
            passScore={me.data?.settings.passScore ?? 5}
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
          <p>{capitalize(doneParts.length > 1 ? `${doneParts.slice(0, -1).join(", ")} y ${doneParts[doneParts.length - 1]}` : (doneParts[0] ?? "terminaste el taller"))}.</p>
        </div>
      )}

      {(day.glossary.length > 0 || day.resources.length > 0) && (
        <section className="section">
          <h2>
            <span className="step">{step.more}</span>
            Para profundizar
          </h2>
          <Lesson.Glossary items={day.glossary} resources={day.resources} />
        </section>
      )}
    </GlossaryProvider>
  );
}

function NotInPlan() {
  const plan = usePlan();
  const range = plan.data?.start ? `El plan va del ${formatLong(plan.data.start)} al ${formatLong(plan.data.end)} de ${plan.data.end.slice(0, 4)}.` : "";
  return (
    <div className="page narrow">
      <div className="empty">
        <h3>Ese día no está en el plan</h3>
        {range && <p>{range}</p>}
        <Link className="btn" to="/hoy">
          Ir a hoy
        </Link>
      </div>
    </div>
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
    if (error instanceof ApiError && error.status === 404) return <NotInPlan />;
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
        {isWorkshop && head.summary && <p className="lede">{head.summary}</p>}
      </header>

      {isWorkshop && <DayProgress data={d} />}

      {isWorkshop && <Workshop data={d} />}
      {head && !isWorkshop && <RestDay data={d} />}

      {deliverable && (
        <div className="stack" style={isWorkshop ? { borderTop: "1px solid var(--rule)", paddingTop: 28 } : undefined}>
          {isWorkshop && <h2 style={{ fontSize: "1.6rem", fontWeight: 800 }}>{deliverable.title}</h2>}
          <DeliverablePanel deliverable={deliverable} startStep={1} />
        </div>
      )}
    </div>
  );
}
