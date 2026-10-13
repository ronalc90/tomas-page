import { Link } from "react-router";
import { formatShort } from "@tomas/shared";
import { Empty, ErrorState, Loading, PageHeader, StatusPill, SubmissionPill } from "../../components/ui";
import { useDeliverables } from "../../lib/queries";

export function DeliverablesPage() {
  const { data, isLoading, error, refetch } = useDeliverables();
  if (isLoading) return <Loading />;
  if (error) return <ErrorState error={error} retry={() => void refetch()} />;
  const list = data ?? [];
  const submitted = list.filter((d) => d.state.status === "done").length;
  const withFeedback = list.filter((d) => d.submission?.status === "changes_requested");

  return (
    <div className="page">
      <PageHeader
        eyebrow="Entregables"
        title="Lo que entregas cada sábado"
        lede={`Llevas ${submitted} de ${list.length}. En las semanas de SQL el entregable es un informe con preguntas que se califican solas y tu conclusión; el administrador lo aprueba o te pide cambios.`}
      />
      {withFeedback.length > 0 && (
        <div className="alert warn" role="status">
          Tienes {withFeedback.length === 1 ? "1 entregable" : `${withFeedback.length} entregables`} con cambios pedidos. Ábrelo, corrige y
          vuelve a enviarlo.
        </div>
      )}
      <div className="card flush">
        {list.length === 0 ? (
          <Empty title="Todavía no hay entregables" />
        ) : (
          <ul className="deliverable-list">
            {list.map((d) => (
              <li key={d.id} className={`p${d.phaseId}`}>
                <Link to={`/dia/${d.dueDate}`}>
                  <span className="when">{formatShort(d.dueDate)}</span>
                  <span className="what">
                    <b>{d.title}</b>
                    <span>
                      {d.path}
                      {d.exercises.length > 0 &&
                        ` · ${d.exercises.filter((e) => e.state.solved).length} de ${d.exercises.length} preguntas resueltas`}
                    </span>
                  </span>
                  <span className="row">
                    {d.submission ? <SubmissionPill status={d.submission.status} /> : <StatusPill status={d.state.status} />}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
