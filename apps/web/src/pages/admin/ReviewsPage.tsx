import { useState } from "react";
import { Link } from "react-router";
import { formatShort } from "@tomas/shared";
import { Empty, ErrorState, Loading, PageHeader, SubmissionPill } from "../../components/ui";
import { relativeTime } from "../../lib/format";
import { useReviews } from "../../lib/queries";

export function ReviewsPage() {
  const [status, setStatus] = useState<"submitted" | "all">("submitted");
  const { data, isLoading, error, refetch } = useReviews(status);

  return (
    <div className="page">
      <PageHeader
        eyebrow="Revisiones"
        title="Entregables por revisar"
        lede="Aprueba o pide cambios con un comentario. El estudiante ve tu respuesta en su entregable."
      />
      <div className="tabs" role="tablist" aria-label="Filtro">
        <button type="button" role="tab" aria-selected={status === "submitted"} onClick={() => setStatus("submitted")}>
          Por revisar
        </button>
        <button type="button" role="tab" aria-selected={status === "all"} onClick={() => setStatus("all")}>
          Todas
        </button>
      </div>
      <div className="card flush">
        {isLoading ? (
          <Loading />
        ) : error ? (
          <ErrorState error={error} retry={() => void refetch()} />
        ) : !data?.length ? (
          <Empty title={status === "submitted" ? "No hay nada por revisar" : "Todavía no hay entregas"}>
            {status === "submitted" ? "Cuando un estudiante envíe un entregable, aparecerá aquí." : undefined}
          </Empty>
        ) : (
          <ul className="deliverable-list">
            {data.map((r) => (
              <li key={`${r.userId}-${r.deliverableId}`}>
                <Link to={`/admin/revisiones/${r.userId}/${r.deliverableId}`}>
                  <span className="when">{formatShort(r.dueDate)}</span>
                  <span className="what">
                    <b>
                      {r.userName} · {r.title}
                    </b>
                    <span>
                      {r.status === "submitted"
                        ? `Enviado ${relativeTime(r.submittedAt)}`
                        : `Revisado ${relativeTime(r.reviewedAt)}`}
                    </span>
                  </span>
                  <span className="row">
                    <SubmissionPill status={r.status} />
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
