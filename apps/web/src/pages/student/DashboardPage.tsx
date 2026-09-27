import { Link } from "react-router";
import { formatLong, formatShort, capitalize, PACE_LABEL, type PlanResponse, type ProgressView } from "@tomas/shared";
import { Calendar, CalendarLegend } from "../../components/Calendar";
import { Icon } from "../../components/Icon";
import { ErrorState, Loading, ProgressBar, Stat, StatusPill } from "../../components/ui";
import { percent } from "../../lib/format";
import { useMe, usePlan, useProgress } from "../../lib/queries";

function nextItemDate(plan: PlanResponse, today: string): string | null {
  const dates = plan.weeks
    .flatMap((w) => [...w.days.map((d) => d.date), ...(w.deliverable ? [w.deliverable.dueDate] : [])])
    .sort();
  return dates.find((d) => d >= today) ?? null;
}

function TodayCard({ plan, progress }: { plan: PlanResponse; progress: ProgressView }) {
  const date = nextItemDate(plan, progress.today);
  if (!date) {
    return (
      <div className="card today-card">
        <p className="eyebrow">Plan terminado</p>
        <h2>Llegaste al final del plan</h2>
        <p>Revisa tus entregables y escribe qué sigue para enero.</p>
        <div className="row">
          <Link className="btn" to="/entregables">
            Ver entregables
          </Link>
        </div>
      </div>
    );
  }
  const week = plan.weeks.find((w) => w.days.some((d) => d.date === date) || w.deliverable?.dueDate === date)!;
  const day = week.days.find((d) => d.date === date);
  const deliverable = week.deliverable?.dueDate === date ? week.deliverable : null;
  const isToday = date === progress.today;
  const status = day ? progress.days[date]?.status : deliverable ? progress.deliverables[deliverable.id]?.status : undefined;
  const title = day?.kind === "workshop" ? day.title : deliverable ? deliverable.title : day?.title ?? "";
  const sub =
    day?.kind === "workshop"
      ? deliverable
        ? "Taller y entregable del día."
        : "Taller de 1 hora: concepto, 3 tareas y evaluación."
      : deliverable
        ? `Entregable: ${deliverable.path}`
        : day?.kind === "holiday"
          ? "Festivo: día para ponerte al día o descansar."
          : "Día libre.";

  return (
    <div className={`card today-card p${week.phaseId}`}>
      <p className="eyebrow">{isToday ? `Hoy · ${formatShort(date)}` : `Hoy no hay taller · Próximo: ${formatShort(date)}`}</p>
      <h2>{title}</h2>
      <p>{sub}</p>
      <div className="row">
        <Link className="btn" to={`/dia/${date}`}>
          {status === "done" ? "Revisar" : isToday ? "Empezar" : "Ver"}
          <Icon name="right" size={18} />
        </Link>
        {status && status !== "rest" && <StatusPill status={status} />}
      </div>
    </div>
  );
}

export function DashboardPage() {
  const me = useMe();
  const plan = usePlan();
  const progress = useProgress();

  if (plan.isLoading || progress.isLoading) return <Loading />;
  if (plan.error || progress.error)
    return <ErrorState error={plan.error ?? progress.error} retry={() => void Promise.all([plan.refetch(), progress.refetch()])} />;
  const p = progress.data!;
  const t = p.totals;
  const name = me.data?.user.displayName.split(" ")[0] ?? "";

  const paceText: Record<string, string> = {
    not_started: `El plan arranca el ${formatLong(p.start)}.`,
    on_track: t.streak > 1 ? `Vas al día. Llevas ${t.streak} talleres seguidos.` : "Vas al día.",
    behind: t.overdue === 1 ? "Tienes 1 pendiente de días anteriores:" : `Tienes ${t.overdue} pendientes de días anteriores:`,
    finished: `Terminaste el plan: ${t.workshopsDone} talleres y ${t.deliverablesSubmitted} entregables.`,
  };

  return (
    <div className="page">
      <section className="hero">
        <p className="eyebrow">{capitalize(formatLong(p.today))}</p>
        <h1>
          Hola, {name}. <span className="accent">{percent(t.completion)}</span> del plan listo.
        </h1>
        <dl className="stats">
          <Stat label="Avance total" value={percent(t.completion)} sub="de talleres y entregables" />
          <Stat
            label="Talleres"
            value={
              <>
                {t.workshopsDone} <span className="muted">/ {t.workshops}</span>
              </>
            }
            sub={t.streak > 1 ? `Racha de ${t.streak} seguidos` : "completados"}
          />
          <Stat
            label="Evaluaciones"
            value={percent(t.quizAverage)}
            sub={t.quizzesTaken ? `${t.quizzesPassed} aprobadas de ${t.quizzesTaken}` : "aún no presentas ninguna"}
          />
          <Stat
            label="Entregables"
            value={
              <>
                {t.deliverablesSubmitted} <span className="muted">/ {t.deliverables}</span>
              </>
            }
            sub={t.deliverablesApproved ? `${t.deliverablesApproved} aprobados` : "entregados"}
          />
        </dl>
        <ProgressBar value={t.completion} label="Avance total del plan" />
        <div className="pace">
          <p className={p.pace}>
            <span className="visually-hidden">{PACE_LABEL[p.pace]}. </span>
            {paceText[p.pace]}
          </p>
          {p.pending.length > 0 && (
            <div className="chips">
              {p.pending.slice(0, 6).map((item) => (
                <Link key={`${item.type}-${item.ref}`} className="chip" to={`/dia/${item.date}`}>
                  <span className="when">{formatShort(item.date)}</span>
                  {item.title}
                </Link>
              ))}
              {p.pending.length > 6 && <span className="chip">y {p.pending.length - 6} más</span>}
            </div>
          )}
        </div>
      </section>

      <div className="grid-2">
        <div className="card">
          <div className="card-head">
            <h2>Calendario</h2>
            <span className="muted" style={{ fontSize: 14 }}>
              Toca un día para abrirlo
            </span>
          </div>
          <Calendar plan={plan.data!} progress={p} />
          <CalendarLegend />
        </div>
        <div className="stack">
          <TodayCard plan={plan.data!} progress={p} />
          <div className="card">
            <div className="card-head">
              <h2>Avance por fase</h2>
            </div>
            <ol className="phase-list">
              {p.phases.map((phase) => (
                <li key={phase.id} className={`p${phase.id}`}>
                  <div className="line">
                    <b>{phase.name}</b>
                    <span>
                      {phase.done} / {phase.total}
                    </span>
                  </div>
                  <ProgressBar thin value={phase.total ? phase.done / phase.total : 0} label={`Avance de ${phase.name}`} />
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
