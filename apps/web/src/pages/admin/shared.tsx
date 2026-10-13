import { useNavigate } from "react-router";
import { ACTIVITY_LABEL, formatMinutes, formatShort, isIsoDate, type ActivityItem, type ExerciseState, type StudentRow } from "@tomas/shared";
import { Empty, PacePill, ProgressBar } from "../../components/ui";
import { initials, percent, relativeTime } from "../../lib/format";

export function StudentsTable({ rows }: { rows: StudentRow[] }) {
  const navigate = useNavigate();
  if (!rows.length) return <Empty title="No hay estudiantes todavía">Créalos desde la sección Usuarios.</Empty>;
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Estudiante</th>
            <th>Ritmo</th>
            <th style={{ minWidth: 160 }}>Avance</th>
            <th className="num">Talleres</th>
            <th className="num">Ejercicios</th>
            <th className="num">Evaluaciones</th>
            <th className="num">1er intento</th>
            <th className="num">Entregables</th>
            <th className="num" title="Minutos de estudio en los últimos 7 días">
              Estudio 7 d
            </th>
            <th>Última actividad</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr
              key={s.id}
              className="clickable"
              onClick={() => navigate(`/admin/estudiantes/${s.id}`)}
              onKeyDown={(e) => e.key === "Enter" && navigate(`/admin/estudiantes/${s.id}`)}
              tabIndex={0}
              aria-label={`Ver a ${s.displayName}`}
            >
              <td>
                <div className="person">
                  <span className="avatar" aria-hidden="true">
                    {initials(s.displayName)}
                  </span>
                  <span>
                    <b>{s.displayName}</b>
                    <span>@{s.username}{!s.active && " · inactivo"}</span>
                  </span>
                </div>
              </td>
              <td>
                <PacePill pace={s.pace} />
                {s.totals.overdue > 0 && (
                  <span className="muted" style={{ fontSize: 13, marginLeft: 6 }}>
                    {s.totals.overdue} pend.
                  </span>
                )}
              </td>
              <td>
                <div className="meter">
                  <ProgressBar thin value={s.totals.completion} label={`Avance de ${s.displayName}`} />
                  <span>{percent(s.totals.completion)}</span>
                </div>
              </td>
              <td className="num">
                {s.totals.workshopsDone}/{s.totals.workshops}
              </td>
              <td className="num">
                {s.totals.exercisesSolved}/{s.totals.exercisesTotal}
              </td>
              <td className="num">{percent(s.totals.quizAverage)}</td>
              <td className="num">{percent(s.totals.firstTryAverage)}</td>
              <td className="num">
                {s.totals.deliverablesSubmitted}/{s.totals.deliverables}
              </td>
              <td className="num" style={{ whiteSpace: "nowrap" }}>
                {formatMinutes(s.weekMinutes)}
              </td>
              <td className="muted" style={{ whiteSpace: "nowrap" }}>
                {relativeTime(s.lastActivityAt ?? s.lastLoginAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function describe(item: ActivityItem): string {
  const verb = ACTIVITY_LABEL[item.type] ?? item.type;
  const d = item.detail as { title?: string; score?: number; total?: number; decision?: string; hints?: number; attempts?: number };
  const when = item.ref && isIsoDate(item.ref) ? formatShort(item.ref) : item.ref;
  switch (item.type) {
    case "quiz_attempt":
      return `${verb} del ${when}: ${d.score}/${d.total}${d.hints ? ` (${d.hints === 1 ? "1 pista" : `${d.hints} pistas`})` : ""}`;
    case "challenge_done":
      return `${verb} del ${when}`;
    case "exercise_solved":
      return `${verb} “${d.title ?? item.ref}”${d.attempts ? ` (${d.attempts === 1 ? "al primer intento" : `en ${d.attempts} intentos`})` : ""}`;
    case "solution_revealed":
      return `${verb} “${d.title ?? item.ref}”`;
    case "workshop_completed":
      return `${verb} “${d.title ?? item.ref}”`;
    case "submission_submitted":
    case "submission_withdrawn":
      return `${verb} “${d.title ?? item.ref}”`;
    case "submission_reviewed":
      return `${d.decision === "approved" ? "aprobó" : "pidió cambios en"} el entregable de la semana ${Number(item.ref?.slice(1) ?? 0)}`;
    default:
      return verb;
  }
}

export function ActivityFeed({ items }: { items: ActivityItem[] }) {
  if (!items.length) return <Empty title="Sin actividad todavía" />;
  return (
    <ul className="feed">
      {items.map((a) => (
        <li key={a.id}>
          <span className={`dot ${a.type}`} aria-hidden="true" />
          <span>
            <b>{a.userName}</b> {describe(a)}
          </span>
          <time dateTime={a.createdAt}>{relativeTime(a.createdAt)}</time>
        </li>
      ))}
    </ul>
  );
}

/** El último SQL que el estudiante envió en cada ejercicio, con su estado. */
export function SqlLog({ items, empty = "Todavía no ha comprobado ningún ejercicio." }: { items: { id: string; title: string; state: ExerciseState }[]; empty?: string }) {
  if (!items.length) return <Empty title="Sin ejercicios">{empty}</Empty>;
  return (
    <ol className="sql-log">
      {items.map((e) => (
        <li key={e.id} className="sql-log-item">
          <div className="row between">
            <b>
              {e.title} <span className="mono muted small">{e.id}</span>
            </b>
            <span className="row" style={{ gap: 6 }}>
              {e.state.solved ? <span className="pill done">Resuelto</span> : <span className={`pill ${e.state.attempts ? "in_progress" : "pending"}`}>Sin resolver</span>}
              {e.state.revealed && <span className="pill overdue">Vio la solución</span>}
            </span>
          </div>
          <span className="muted small">
            {e.state.attempts === 1 ? "1 intento" : `${e.state.attempts} intentos`}
            {e.state.solvedAt ? ` · resuelto ${relativeTime(e.state.solvedAt)}` : ""}
          </span>
          {e.state.lastSql ? <pre>{e.state.lastSql}</pre> : <span className="muted small">Sin SQL enviado.</span>}
        </li>
      ))}
    </ol>
  );
}
