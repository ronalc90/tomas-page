import { Fragment } from "react";
import { Link } from "react-router";
import { addDays, formatDayMonth, formatLong, mondayOf, STATUS_LABEL, type PlanResponse, type ProgressView } from "@tomas/shared";

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
        return (
          <Fragment key={week.id}>
            <span className={`wk p${week.phaseId}`}>
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
              const label = `${formatLong(date)}: ${title}. ${status === "rest" ? (day?.kind === "holiday" ? "Festivo" : "Día libre") : STATUS_LABEL[status ?? "pending"]}`;
              return linkTo ? (
                <Link key={date} to={linkTo(date)} className={cls.join(" ")} aria-label={label} title={title}>
                  {num}
                </Link>
              ) : (
                <span key={date} className={cls.join(" ")} aria-label={label} title={title}>
                  {num}
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
        <i className="l-rest" />
        Festivo o descanso
      </span>
    </div>
  );
}
