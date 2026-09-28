import { Link } from "react-router";
import { formatShort, STATUS_LABEL, type ItemStatus } from "@tomas/shared";
import { Help } from "../../components/CodeBlock";
import { Icon } from "../../components/Icon";
import { ErrorState, Loading, PageHeader, StatusPill, SubmissionPill } from "../../components/ui";
import { usePlan, useProgress } from "../../lib/queries";

/** Todo el plan de un vistazo: fases, semanas, días y temas. Cualquier día se puede abrir. */
export function SyllabusPage() {
  const plan = usePlan();
  const progress = useProgress();
  if (plan.isLoading || progress.isLoading) return <Loading />;
  if (plan.error || progress.error) return <ErrorState error={plan.error ?? progress.error} retry={() => void Promise.all([plan.refetch(), progress.refetch()])} />;
  const p = plan.data!;
  const pr = progress.data!;
  const workshops = p.weeks.flatMap((w) => w.days).filter((d) => d.kind === "workshop").length;
  const topics = p.weeks.flatMap((w) => w.days).reduce((n, d) => n + d.topics.length, 0);

  return (
    <div className="page">
      <PageHeader
        eyebrow="Plan completo"
        title="Temario"
        lede={`${p.phases.length} fases, ${workshops} días de estudio y ${topics} temas del ${formatShort(p.start)} al ${formatShort(p.end)}. Puedes abrir cualquier día para leerlo, estudiarlo o adelantar, aunque no lo hayas hecho todavía.`}
      />
      <div className="syllabus">
        {p.phases.map((phase) => (
          <section key={phase.id} className={`syllabus-phase p${phase.id}`}>
            <header className="syllabus-phase-head">
              <p className="eyebrow">
                Fase {phase.id} · {phase.rangeLabel}
              </p>
              <h2>{phase.name}</h2>
              <p className="muted">{phase.goal}</p>
            </header>
            {p.weeks
              .filter((w) => w.phaseId === phase.id)
              .map((w) => (
                <div key={w.id} className="syllabus-week">
                  <h3>
                    <span className="week-n">S{w.number}</span> {w.title} <span className="muted small">· {w.rangeLabel}</span>
                  </h3>
                  <ul className="syllabus-days">
                    {w.days.map((d) => {
                      const state = pr.days[d.date];
                      const status: ItemStatus | undefined = state?.status;
                      return (
                        <li key={d.date} className={`syllabus-day ${d.kind}`}>
                          <Link to={`/dia/${d.date}`} className="syllabus-link">
                            <span className="syllabus-date">{formatShort(d.date)}</span>
                            <span className="syllabus-body">
                              <b>{d.title}</b>
                              {d.topics.length > 0 ? (
                                <span className="syllabus-topics">
                                  {d.topics.map((t, i) => (
                                    <span key={i} className="topic-chip">
                                      {t}
                                    </span>
                                  ))}
                                </span>
                              ) : (
                                <span className="muted small">{d.summary}</span>
                              )}
                            </span>
                            <span className="syllabus-status">
                              {status && status !== "rest" && <StatusPill status={status} label={STATUS_LABEL[status]} />}
                              {d.kind !== "workshop" && <span className="pill rest">{d.kind === "holiday" ? "Feriado" : "Libre"}</span>}
                              <Icon name="right" size={16} />
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                    {w.deliverable && (
                      <li className="syllabus-day deliverable">
                        <Link to={`/dia/${w.deliverable.dueDate}`} className="syllabus-link">
                          <span className="syllabus-date">{formatShort(w.deliverable.dueDate)}</span>
                          <span className="syllabus-body">
                            <b>
                              {w.deliverable.title}
                              <Help text="Los sábados se entrega un programa que junta lo de la semana. Lo revisa el administrador y te deja comentarios." label="Qué es un entregable" />
                            </b>
                            <span className="muted small mono">{w.deliverable.path}</span>
                          </span>
                          <span className="syllabus-status">
                            <SubmissionPill status={pr.deliverables[w.deliverable.id]?.submission ?? null} />
                            <Icon name="right" size={16} />
                          </span>
                        </Link>
                      </li>
                    )}
                  </ul>
                </div>
              ))}
          </section>
        ))}
      </div>
    </div>
  );
}
