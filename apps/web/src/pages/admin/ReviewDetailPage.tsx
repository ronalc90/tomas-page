import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { DELIVERABLE_KIND_LABEL, formatLong } from "@tomas/shared";
import { RichText } from "../../components/CodeBlock";
import { useToast } from "../../components/Toast";
import { ErrorState, Field, Loading, PageHeader, SubmissionPill } from "../../components/ui";
import { ApiError, errorMessage } from "../../lib/api";
import { dateTime, splitLinks } from "../../lib/format";
import { useReview, useSubmitReview } from "../../lib/queries";

export function ReviewDetailPage() {
  const { userId = "", deliverableId = "" } = useParams();
  const { data, isLoading, error, refetch } = useReview(userId, deliverableId);
  const review = useSubmitReview(userId, deliverableId);
  const toast = useToast();
  const navigate = useNavigate();
  const [feedback, setFeedback] = useState("");
  const fields = review.error instanceof ApiError ? review.error.fields : {};

  if (isLoading) return <Loading />;
  if (error) return <ErrorState error={error} retry={() => void refetch()} />;
  const { deliverable: d, userName } = data!;
  const sub = d.submission;

  const decide = async (decision: "approved" | "changes_requested") => {
    try {
      await review.mutateAsync({ decision, feedback });
      toast(decision === "approved" ? `Aprobaste el entregable de ${userName}.` : `Le pediste cambios a ${userName}.`);
      navigate("/admin/revisiones");
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  return (
    <div className={`page narrow p${d.phaseId}`}>
      <PageHeader
        eyebrow={
          <Link to="/admin/revisiones" style={{ textDecoration: "none" }}>
            ← Revisiones
          </Link>
        }
        title={`${userName} · ${d.title}`}
        lede={`${DELIVERABLE_KIND_LABEL[d.kind]} · fecha ${formatLong(d.dueDate)}`}
        actions={<SubmissionPill status={sub?.status ?? null} />}
      />

      <section className="card stack">
        <h2 style={{ fontSize: "1.2rem" }}>Qué se pidió</h2>
        <p className="path">{d.path}</p>
        <p>
          <RichText text={d.description} />
        </p>
        <ul className="checklist">
          {d.criteria.map((c, i) => (
            <li key={i}>
              <label className="check">
                <input type="checkbox" checked={sub?.criteria[i] ?? false} disabled readOnly />
                <span>
                  <RichText text={c} />
                </span>
              </label>
            </li>
          ))}
        </ul>
      </section>

      <section className="card stack">
        <div className="row between">
          <h2 style={{ fontSize: "1.2rem" }}>Evidencia</h2>
          <span className="muted" style={{ fontSize: 14 }}>
            Enviado {dateTime(sub?.submittedAt)}
          </span>
        </div>
        {sub?.evidence ? (
          <pre className="evidence-view">
            {splitLinks(sub.evidence).map((part, i) =>
              part.href ? (
                <a key={i} href={part.href} target="_blank" rel="noopener noreferrer">
                  {part.text}
                </a>
              ) : (
                part.text
              ),
            )}
          </pre>
        ) : (
          <p className="muted">Sin evidencia.</p>
        )}
        {sub?.feedback && (
          <div className={`feedback ${sub.status}`}>
            <b>
              Comentario anterior de {sub.reviewerName ?? "administración"} · {dateTime(sub.reviewedAt)}
            </b>
            <p>{sub.feedback}</p>
          </div>
        )}
      </section>

      {sub && sub.status !== "draft" && (
        <section className="card stack">
          <h2 style={{ fontSize: "1.2rem" }}>Tu revisión</h2>
          <Field id="feedback" label="Comentario para el estudiante" hint="Obligatorio si pides cambios. Sé concreto: qué falta y cómo comprobarlo." error={fields.feedback}>
            <textarea id="feedback" className="textarea" rows={5} value={feedback} onChange={(e) => setFeedback(e.target.value)} />
          </Field>
          <div className="row">
            <button type="button" className="btn" disabled={review.isPending} onClick={() => decide("approved")}>
              Aprobar
            </button>
            <button type="button" className="btn secondary" disabled={review.isPending || !feedback.trim()} onClick={() => decide("changes_requested")}>
              Pedir cambios
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
