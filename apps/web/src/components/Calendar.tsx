import { Fragment } from "react";
import { Link } from "react-router";
import { addDays, formatDayMonth, formatLong, formatMinutes, mondayOf, STATUS_LABEL, type PlanResponse, type ProgressView } from "@tomas/shared";

/** Minutos de estudio y ejercicios de la semana (lunes a domingo) que contiene `date`. */
export function weekSummary(plan: PlanResponse, progress: ProgressView, date: string) {
  const monday = mondayOf(date);
  const sunday = addDays(monday, 6);
  const inWeek = (d: string) => d >= monday && d <= sunday;
  let minutes = 0;
  for (const [d, m] of Object.entries(progress.study)) if (inWeek(d)) minutes += m;
  let done = 0;
  let total = 0;
  for (const w of plan.weeks) {
    for (const d of w.days) {
      if (!inWeek(d.date)) continue;
      done += progress.days[d.date]?.exercisesDone ?? 0;
      total += progress.days[d.date]?.exercisesTotal ?? 0;
    }
    if (w.deliverable && inWeek(w.deliverable.dueDate)) {
      done += progress.deliverables[w.deliverable.id]?.exercisesDone ?? 0;
      total += progress.deliverables[w.deliverable.id]?.exercisesTotal ?? 0;
    }
  }
  return { minutes, done, total };
}

/** "Esta semana: 3 h 20 min de estudio · 12 de 30 ejercicios resueltos" */
export function WeekLine({ plan, progress }: { plan: PlanResponse; progress: ProgressView }) {
  const w = weekSummary(plan, progress, progress.today);
  return (
    <p className="week-line">
      <span>
        <b>Esta semana:</b> {formatMinutes(w.minutes)} de estudio
      </span>
      {w.total > 0 && (
        <span>
          {w.done} de {w.total} ejercicios resueltos
        </span>
      )}
    </p>
  );
}

const WEEKDAYS = ["L", "M", "X", "J", "V", "S", "D"];

/**
 * Calendario del plan: una fila por semana, una celda por día.
 * El color de fondo es la fase; el estado se lee por relleno, borde y forma.
 */
export function Calendar({
  plan,
  progress,
  current,
  linkTo = (date) => `/dia/${date}`,
}: {
  plan: PlanResponse;
  progress: ProgressView;
  current?: string;
  linkTo?: ((date: string) => string) | null;
}) {
  const dayByDate = new Map(plan.weeks.flatMap((w) => w.days.map((d) => [d.date, d] as const)));
  const deliverableByDate = new Map(plan.weeks.flatMap((w) => (w.deliverable ? [[w.deliverable.dueDate, w.deliverable] as const] : [])));

  return (
    <div className="cal" role="group" aria-label="Calendario del plan">
      <span aria-hidden="true" />
      {WEEKDAYS.map((d) => (
        <span key={d} className="head" aria-hidden="true">
          {d}
        </span>
      ))}
      {plan.weeks.map((week) => {
        const first = week.days[0]?.date ?? week.deliverable?.dueDate ?? plan.start;
        const monday = mondayOf(first);
        const ws = weekSummary(plan, progress, first);
        return (
          <Fragment key={week.id}>
            <span
              className={`wk p${week.phaseId}`}
              title={`Semana ${week.number}: ${formatMinutes(ws.minutes)} de estudio${ws.total ? `, ${ws.done} de ${ws.total} ejercicios` : ""}`}
            >
              <b>S{week.number}</b>
              <span>{formatDayMonth(first)}</span>
            </span>
            {Array.from({ length: 7 }, (_, i) => {
              const date = addDays(monday, i);
              const num = Number(date.slice(8));
              if (date < plan.start || date > plan.end) return <span key={date} className="cal-cell empty" aria-hidden="true" />;
              const day = dayByDate.get(date);
              const deliverable = deliverableByDate.get(date);
              const cls = [`cal-cell`, `p${week.phaseId}`];
              if (date === progress.today) cls.push("today");
              if (date === current) cls.push("current");
              if (!day && !deliverable) {
                return (
                  <span key={date} className={[...cls, "rest"].join(" ")} title="Descanso">
                    {num}
                  </span>
                );
              }
              let status = day ? progress.days[date]?.status : progress.deliverables[deliverable!.id]?.status;
              if (day && deliverable && day.kind === "workshop") {
                const a = progress.days[date]?.status;
                const b = progress.deliverables[deliverable.id]?.status;
                status = a === "done" && b === "done" ? "done" : a === "overdue" || b === "overdue" ? "overdue" : a === "pending" && b === "pending" ? "pending" : "in_progress";
              }
              if (!day && deliverable) cls.push("deliverable");
              if (status) cls.push(status);
              const title = day ? day.title : deliverable!.title;
              const st = day ? progress.days[date] : undefined;
              const dst = deliverable ? progress.deliverables[deliverable.id] : undefined;
              const exDone = (st?.exercisesDone ?? 0) + (dst?.exercisesDone ?? 0);
              const exTotal = (st?.exercisesTotal ?? 0) + (dst?.exercisesTotal ?? 0);
              const minutes = progress.study[date] ?? 0;
              const extra = [exTotal ? `${exDone} de ${exTotal} ejercicios` : "", minutes ? `${formatMinutes(minutes)} de estudio` : ""].filter(Boolean).join(", ");
              const label = `${formatLong(date)}: ${title}. ${status === "rest" ? (day?.kind === "holiday" ? "Festivo" : "Día libre") : STATUS_LABEL[status ?? "pending"]}${extra ? `. ${extra}` : ""}`;
              // Barra fina con la parte de los ejercicios resueltos (solo si está empezado y no completo).
              const bar = exTotal > 0 && exDone > 0 && status !== "done" ? <i className="cal-ex" style={{ width: `calc((100% - 10px) * ${exDone / exTotal})` }} aria-hidden="true" /> : null;
              const tip = extra ? `${title} · ${extra}` : title;
              return linkTo ? (
                <Link key={date} to={linkTo(date)} className={cls.join(" ")} aria-label={label} title={tip}>
                  {num}
                  {bar}
                </Link>
              ) : (
                <span key={date} className={cls.join(" ")} aria-label={label} title={tip}>
                  {num}
                  {bar}
                </span>
              );
            })}
          </Fragment>
        );
      })}
    </div>
  );
}

export function CalendarLegend() {
  return (
    <div className="legend">
      <span>
        <i className="l-done" />
        Completo (color de su fase)
      </span>
      <span>
        <i className="l-progress" />
        Empezado
      </span>
      <span>
        <i className="l-overdue" />
        Atrasado
      </span>
      <span>
        <i className="l-deliv" />
        Entregable
      </span>
      <span>
        <i className="l-ex" />
        Ejercicios resueltos (barra)
      </span>
      <span>
        <i className="l-rest" />
        Festivo o descanso
      </span>
    </div>
  );
}
