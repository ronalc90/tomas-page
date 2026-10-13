import { Link } from "react-router";
import { capitalize, formatLong, formatMinutes } from "@tomas/shared";
import { ErrorState, Loading, PageHeader, Stat } from "../../components/ui";
import { WeeklyChart } from "../../components/WeeklyChart";
import { percent } from "../../lib/format";
import { useOverview } from "../../lib/queries";
import { ActivityFeed, StudentsTable } from "./shared";

export function OverviewPage() {
  const { data, isLoading, error, refetch } = useOverview();
  if (isLoading) return <Loading />;
  if (error) return <ErrorState error={error} retry={() => void refetch()} />;
  const o = data!;
  const active = o.students.filter((s) => s.active);
  const avg = (f: (s: (typeof active)[number]) => number | null) => {
    const values = active.map(f).filter((v): v is number => v !== null);
    return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
  };
  const behind = active.filter((s) => s.pace === "behind").length;
  const solved = active.reduce((a, s) => a + s.totals.exercisesSolved, 0);
  const exTotal = active.reduce((a, s) => a + s.totals.exercisesTotal, 0);
  const weekMinutes = active.reduce((a, s) => a + s.weekMinutes, 0);

  return (
    <div className="page">
      <PageHeader
        eyebrow={capitalize(formatLong(o.today))}
        title="Resumen"
        lede="Cómo van los estudiantes, qué falta por revisar y lo último que pasó."
        actions={
          o.pendingReviews > 0 ? (
            <Link className="btn" to="/admin/revisiones">
              Revisar {o.pendingReviews} {o.pendingReviews === 1 ? "entregable" : "entregables"}
            </Link>
          ) : undefined
        }
      />

      <dl className="stats six">
        <Stat label="Estudiantes activos" value={active.length} sub={behind ? `${behind} con pendientes atrasados` : "todos al día"} />
        <Stat label="Avance promedio" value={percent(avg((s) => s.totals.completion))} sub="talleres y entregables" />
        <Stat
          label="Ejercicios SQL"
          value={exTotal ? percent(solved / exTotal) : "–"}
          sub={`${solved.toLocaleString("es-CR")} ${solved === 1 ? "resuelto" : "resueltos"} de ${exTotal.toLocaleString("es-CR")}`}
          help="Ejercicios resueltos por los estudiantes activos sobre el total que tienen en el plan (talleres y entregables)."
        />
        <Stat label="Evaluaciones" value={percent(avg((s) => s.totals.quizAverage))} sub={`primer intento: ${percent(avg((s) => s.totals.firstTryAverage))}`} />
        <Stat
          label="Estudio (7 días)"
          value={formatMinutes(weekMinutes)}
          sub={active.length > 1 ? "sumando a todos los estudiantes" : "con la página abierta y en uso"}
          help="Minutos con la página abierta y en uso en los últimos 7 días (se cuenta un minuto a la vez cuando hay actividad de teclado, mouse o desplazamiento)."
        />
        <Stat label="Por revisar" value={o.pendingReviews} sub={o.pendingReviews ? "entregables enviados" : "nada pendiente"} />
      </dl>

      <div className="card flush">
        <div className="card-head">
          <h2>Estudiantes</h2>
          <Link to="/admin/estudiantes" className="muted" style={{ fontSize: 14 }}>
            Ver todos
          </Link>
        </div>
        <StudentsTable rows={o.students} />
      </div>

      <div className="grid-2">
        <div className="stack">
          <div className="card">
            <div className="card-head">
              <h2>Actividad por semana</h2>
              <span className="muted" style={{ fontSize: 14 }}>
                {o.weeklyActivity.length === 1 ? "Esta semana" : `Últimas ${o.weeklyActivity.length} semanas`}
              </span>
            </div>
            <WeeklyChart
              data={o.weeklyActivity}
              title="Actividad por semana: talleres completados, ejercicios resueltos y evaluaciones presentadas"
              series={[
                { key: "workshops", label: "Talleres completados", color: "var(--viz-1)" },
                { key: "exercises", label: "Ejercicios resueltos", color: "var(--viz-3)" },
                { key: "quizzes", label: "Evaluaciones presentadas", color: "var(--viz-2)" },
              ]}
            />
          </div>
          <div className="card">
            <div className="card-head">
              <h2>Estudio por semana</h2>
              <span className="muted" style={{ fontSize: 14 }}>
                Minutos con la página abierta y en uso
              </span>
            </div>
            <WeeklyChart
              data={o.weeklyActivity}
              title="Tiempo de estudio por semana"
              series={[{ key: "minutes", label: "Tiempo de estudio", color: "var(--viz-1)" }]}
              format={formatMinutes}
              axisFormat={(v) => (v >= 60 ? `${Math.round((v / 60) * 10) / 10} h` : `${v} min`)}
            />
          </div>
        </div>
        <div className="card">
          <div className="card-head">
            <h2>Actividad reciente</h2>
          </div>
          <ActivityFeed items={o.activity.slice(0, 12)} />
        </div>
      </div>
    </div>
  );
}
