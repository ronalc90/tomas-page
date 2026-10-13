import { Fragment, useState } from "react";
import { Link, useParams } from "react-router";
import { formatMinutes, formatShort } from "@tomas/shared";
import { Calendar, CalendarLegend } from "../../components/Calendar";
import { Empty, ErrorState, Loading, PacePill, PageHeader, ProgressBar, Stat, StatusPill, SubmissionPill } from "../../components/ui";
import { dateTime, percent, relativeTime } from "../../lib/format";
import { usePlan, useStudent } from "../../lib/queries";
import { ActivityFeed, SqlLog } from "./shared";

type Tab = "talleres" | "sql" | "entregables" | "actividad";

export function StudentDetailPage() {
  const { id = "" } = useParams();
  const { data, isLoading, error, refetch } = useStudent(id);
  const plan = usePlan();
  const [tab, setTab] = useState<Tab>("talleres");
  const [filter, setFilter] = useState<"hoy" | "atrasados" | "todos">("hoy");
  const [open, setOpen] = useState<string | null>(null);

  if (isLoading || plan.isLoading) return <Loading />;
  if (error) return <ErrorState error={error} retry={() => void refetch()} />;
  const d = data!;
  const t = d.progress.totals;
  const revealed = d.exercises.filter((e) => e.state.revealed).length;
  // Ejercicios agrupados por taller o entregable, lo más reciente primero.
  const titleOf = new Map(d.days.map((x) => [x.date, x.title]));
  const deliverableOf = new Map(d.deliverables.map((x) => [x.id, x]));
  const groupMap = new Map<string, { key: string; label: string; sort: string; items: typeof d.exercises }>();
  for (const e of d.exercises) {
    const key = e.date ?? e.deliverableId ?? "otros";
    const dv = e.deliverableId ? deliverableOf.get(e.deliverableId) : undefined;
    const label = e.date ? `${formatShort(e.date)} · ${titleOf.get(e.date) ?? ""}` : dv ? `${formatShort(dv.dueDate)} · ${dv.title}` : key;
    const sort = e.date ?? dv?.dueDate ?? "";
    const g = groupMap.get(key) ?? { key, label, sort, items: [] };
    g.items.push(e);
    groupMap.set(key, g);
  }
  const groups = [...groupMap.values()].sort((a, b) => b.sort.localeCompare(a.sort));
  const attempts = d.exercises.reduce((a, e) => a + e.state.attempts, 0);
  const days = d.days.filter((x) =>
    filter === "todos" ? true : filter === "atrasados" ? x.state.status === "overdue" : x.date <= d.progress.today,
  );

  return (
    <div className="page">
      <PageHeader
        eyebrow={
          <Link to="/admin/estudiantes" style={{ textDecoration: "none" }}>
            ← Estudiantes
          </Link>
        }
        title={d.student.displayName}
        lede={
          <>
            @{d.student.username} · Último ingreso {relativeTime(d.student.lastLoginAt)} · Última actividad{" "}
            {relativeTime(d.student.lastActivityAt)}
          </>
        }
        actions={<PacePill pace={d.progress.pace} />}
      />

      <dl className="stats six">
        <Stat label="Avance total" value={percent(t.completion)} sub={`${t.overdue} pendientes atrasados`} />
        <Stat label="Talleres" value={`${t.workshopsDone}/${t.workshops}`} sub={t.streak > 1 ? `Racha de ${t.streak}` : `${t.expectedByToday} esperados a hoy (con entregables)`} />
        <Stat
          label="Ejercicios SQL"
          value={`${t.exercisesSolved}/${t.exercisesTotal}`}
          sub={`${revealed} ${revealed === 1 ? "solución vista" : "soluciones vistas"} · ${attempts} intentos`}
        />
        <Stat label="Evaluaciones" value={percent(t.quizAverage)} sub={`Primer intento: ${percent(t.firstTryAverage)}`} />
        <Stat label="Entregables" value={`${t.deliverablesSubmitted}/${t.deliverables}`} sub={`${t.deliverablesApproved} aprobados`} />
        <Stat label="Estudio" value={formatMinutes(d.student.weekMinutes)} sub={`últimos 7 días · ${formatMinutes(t.studyMinutes)} en total`} />
      </dl>
      <ProgressBar value={t.completion} label="Avance total" />

      <div className="grid-2">
        <div className="card">
          <div className="card-head">
            <h2>Calendario</h2>
          </div>
          <Calendar plan={plan.data!} progress={d.progress} linkTo={null} />
          <CalendarLegend />
        </div>
        <div className="card">
          <div className="card-head">
            <h2>Avance por fase</h2>
          </div>
          <ol className="phase-list">
            {d.progress.phases.map((p) => (
              <li key={p.id} className={`p${p.id}`}>
                <div className="line">
                  <b>{p.name}</b>
                  <span>
                    {p.done} / {p.total}
                  </span>
                </div>
                <ProgressBar thin value={p.total ? p.done / p.total : 0} label={`Avance de ${p.name}`} />
              </li>
            ))}
          </ol>
        </div>
      </div>

      <div className="row between">
        <div className="tabs" role="tablist" aria-label="Detalle">
          {(["talleres", "sql", "entregables", "actividad"] as Tab[]).map((k) => (
            <button key={k} role="tab" type="button" aria-selected={tab === k} onClick={() => setTab(k)}>
              {{ talleres: "Talleres", sql: "SQL enviado", entregables: "Entregables", actividad: "Actividad" }[k]}
            </button>
          ))}
        </div>
        {tab === "talleres" && (
          <div className="tabs" role="tablist" aria-label="Filtro">
            <button type="button" role="tab" aria-selected={filter === "hoy"} onClick={() => setFilter("hoy")}>
              Hasta hoy
            </button>
            <button type="button" role="tab" aria-selected={filter === "atrasados"} onClick={() => setFilter("atrasados")}>
              Atrasados
            </button>
            <button type="button" role="tab" aria-selected={filter === "todos"} onClick={() => setFilter("todos")}>
              Todo el plan
            </button>
          </div>
        )}
      </div>

      {tab === "talleres" && (
        <div className="card flush">
          {days.length === 0 ? (
            <Empty title={filter === "atrasados" ? "Nada atrasado" : "Todavía no hay talleres"}>{filter === "atrasados" ? "Va al día con los talleres." : undefined}</Empty>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Taller</th>
                    <th>Estado</th>
                    <th className="num">Ejercicios</th>
                    <th className="num" title="Intentos sumados de los ejercicios SQL del día">
                      Intentos SQL
                    </th>
                    <th className="num" title="Ejercicios en los que vio la solución">
                      Soluciones
                    </th>
                    <th className="num">Tareas</th>
                    <th className="num" title="Intentos de la evaluación">
                      Evaluación
                    </th>
                    <th className="num">1er intento</th>
                    <th className="num">Mejor</th>
                    <th className="num" title="Pistas destapadas en el último intento">
                      Pistas
                    </th>
                    <th className="num">Estudio</th>
                    <th>Reto</th>
                    <th>Evidencia</th>
                  </tr>
                </thead>
                <tbody>
                  {days.map((row) => (
                    <Fragment key={row.date}>
                      <tr>
                        <td className="mono" style={{ whiteSpace: "nowrap", fontSize: 13 }}>
                          {formatShort(row.date)}
                        </td>
                        <td>
                          <b>{row.title}</b>
                          <div className="muted" style={{ fontSize: 13 }}>
                            Semana {row.weekNumber}
                          </div>
                        </td>
                        <td>
                          <StatusPill status={row.state.status} />
                        </td>
                        <td className="num">{row.state.exercisesTotal ? `${row.state.exercisesDone}/${row.state.exercisesTotal}` : "–"}</td>
                        <td className="num">{row.exerciseAttempts || "–"}</td>
                        <td className="num">{row.solutionsRevealed ? <span className="pill overdue">{row.solutionsRevealed}</span> : "–"}</td>
                        <td className="num">{row.state.tasksTotal ? `${row.state.tasksDone}/${row.state.tasksTotal}` : "–"}</td>
                        <td className="num">{row.state.attempts || "–"}</td>
                        <td className="num">{row.firstScore === null ? "–" : `${row.firstScore}/${row.state.total}`}</td>
                        <td className="num">{row.state.attempts ? `${row.state.best}/${row.state.total}` : "–"}</td>
                        <td className="num">{row.state.attempts ? row.hintsUsed : "–"}</td>
                        <td className="num" style={{ whiteSpace: "nowrap" }}>
                          {row.studyMinutes ? formatMinutes(row.studyMinutes) : "–"}
                        </td>
                        <td>{row.challengeDone ? <span className="pill done">Hecho</span> : <span className="muted">–</span>}</td>
                        <td>
                          {row.evidence.trim() ? (
                            <button type="button" className="btn ghost small" onClick={() => setOpen(open === row.date ? null : row.date)} aria-expanded={open === row.date}>
                              {open === row.date ? "Ocultar" : "Ver"}
                            </button>
                          ) : (
                            <span className="muted">–</span>
                          )}
                        </td>
                      </tr>
                      {open === row.date && (
                        <tr>
                          <td colSpan={14}>
                            <pre className="evidence-view">{row.evidence}</pre>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === "sql" && (
        <div className="card stack">
          <p className="muted" style={{ fontSize: 14 }}>
            El último SQL que envió a comprobar en cada ejercicio, del más reciente al más antiguo del plan.
          </p>
          {groups.length === 0 ? (
            <SqlLog items={[]} />
          ) : (
            groups.map((g) => (
              <section key={g.key} className="stack tight">
                <h3 style={{ fontSize: "1.05rem" }}>{g.label}</h3>
                <SqlLog items={g.items} />
              </section>
            ))
          )}
        </div>
      )}

      {tab === "entregables" && (
        <div className="card flush">
          <ul className="deliverable-list">
            {d.deliverables.map((x) => (
              <li key={x.id} className={`p${x.phaseId}`}>
                <Link to={x.submission && x.submission.status !== "draft" ? `/admin/revisiones/${d.student.id}/${x.id}` : "#"} onClick={(e) => (!x.submission || x.submission.status === "draft") && e.preventDefault()}>
                  <span className="when">{formatShort(x.dueDate)}</span>
                  <span className="what">
                    <b>{x.title}</b>
                    <span>{x.submission?.submittedAt ? `Enviado ${dateTime(x.submission.submittedAt)}` : x.path}</span>
                  </span>
                  <span className="row">{x.submission ? <SubmissionPill status={x.submission.status} /> : <StatusPill status={x.state.status} />}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {tab === "actividad" && (
        <div className="card">
          <ActivityFeed items={d.activity} />
        </div>
      )}
    </div>
  );
}
