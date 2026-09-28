import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { DELIVERABLE_KIND_LABEL, formatShort, type AdminDeliverable } from "@tomas/shared";
import { Icon } from "../../components/Icon";
import { useToast } from "../../components/Toast";
import { ErrorState, Field, Loading, Modal, PageHeader } from "../../components/ui";
import { ApiError, errorMessage } from "../../lib/api";
import { relativeTime } from "../../lib/format";
import { useContent, useSaveAdminDeliverable } from "../../lib/queries";
import { TextList } from "./LessonEditors";

function DeliverableEditor({ deliverable, onClose }: { deliverable: AdminDeliverable; onClose: () => void }) {
  const save = useSaveAdminDeliverable(deliverable.id);
  const toast = useToast();
  const [path, setPath] = useState(deliverable.path);
  const [description, setDescription] = useState(deliverable.description);
  const [criteria, setCriteria] = useState(deliverable.criteria);
  const [steps, setSteps] = useState(deliverable.steps);
  const [tips, setTips] = useState(deliverable.tips);
  const [stretch, setStretch] = useState(deliverable.stretch);
  const [checklist, setChecklist] = useState(deliverable.checklist);
  const fields = save.error instanceof ApiError ? save.error.fields : {};
  const clean = (list: string[]) => list.map((c) => c.trim()).filter(Boolean);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await save.mutateAsync({ path, description, criteria: clean(criteria), steps: clean(steps), tips: clean(tips), stretch: stretch.trim(), checklist: clean(checklist) });
      toast("Entregable actualizado.");
      onClose();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  return (
    <form className="stack" onSubmit={submit}>
      <h2>Editar entregable</h2>
      <Field id="d-path" label="Archivo o carpeta que se entrega" error={fields.path}>
        <input id="d-path" className="input mono" value={path} onChange={(e) => setPath(e.target.value)} />
      </Field>
      <Field id="d-desc" label="Descripción" error={fields.description}>
        <textarea id="d-desc" className="textarea" rows={4} value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <div className="field">
        <span className="label">Criterios de revisión</span>
        {criteria.map((c, i) => (
          <div className="option-edit" key={i} style={{ gridTemplateColumns: "minmax(0,1fr) auto" }}>
            <input
              className="input"
              aria-label={`Criterio ${i + 1}`}
              value={c}
              onChange={(e) => setCriteria((list) => list.map((x, k) => (k === i ? e.target.value : x)))}
            />
            <button type="button" className="btn ghost small icon" aria-label={`Quitar criterio ${i + 1}`} disabled={criteria.length <= 1} onClick={() => setCriteria((list) => list.filter((_, k) => k !== i))}>
              <Icon name="trash" size={16} />
            </button>
          </div>
        ))}
        <button type="button" className="btn secondary small" style={{ justifySelf: "start" }} onClick={() => setCriteria((list) => [...list, ""])}>
          <Icon name="plus" size={16} /> Agregar criterio
        </button>
      </div>
      <TextList label="Cómo abordarlo" hint="Pasos en orden para planear, escribir y probar el entregable." items={steps} onChange={setSteps} addLabel="Agregar paso" error={fields.steps} />
      <TextList label="Lo que mira el revisor" items={tips} onChange={setTips} max={6} addLabel="Agregar consejo" error={fields.tips} />
      <Field id="d-stretch" label="Si quiere ir más allá (reto opcional)" error={fields.stretch}>
        <textarea id="d-stretch" className="textarea" rows={2} value={stretch} onChange={(e) => setStretch(e.target.value)} />
      </Field>
      <TextList label="Revisar antes de enviar" items={checklist} onChange={setChecklist} max={8} rows={1} addLabel="Agregar punto" error={fields.checklist} />
      <div className="row end">
        <button type="button" className="btn secondary" onClick={onClose}>
          Cancelar
        </button>
        <button type="submit" className="btn" disabled={save.isPending}>
          Guardar
        </button>
      </div>
    </form>
  );
}

export function ContentPage() {
  const { data, isLoading, error, refetch } = useContent();
  const [editing, setEditing] = useState<AdminDeliverable | null>(null);
  if (isLoading) return <Loading />;
  if (error) return <ErrorState error={error} retry={() => void refetch()} />;

  return (
    <div className="page">
      <PageHeader
        eyebrow="Contenido"
        title="Talleres, evaluaciones y entregables"
        lede="Edita cualquier día: concepto, ejemplo, tareas y preguntas. Los cambios se ven de inmediato en la página del estudiante."
      />
      <div className="card flush">
        {data!.map((week, i) => (
          <details key={week.id} className={`week-group p${week.phaseId}`} open={i === 0}>
            <summary>
              <span className="num-badge">S{week.number}</span>
              <span>
                <b>{week.title}</b>
                <span className="muted" style={{ marginLeft: 8, fontSize: 14 }}>
                  {week.rangeLabel}
                </span>
              </span>
              <span className="chev" aria-hidden="true">
                <Icon name="right" size={18} />
              </span>
            </summary>
            <ul className="week-days">
              {week.days.map((d) => (
                <li key={d.date}>
                  {d.kind === "workshop" ? (
                    <Link to={`/admin/contenido/${d.date}`}>
                      <span className="when">{formatShort(d.date)}</span>
                      <span>{d.title}</span>
                      <span className="muted" style={{ fontSize: 13 }}>
                        {d.questionCount} preguntas · editado {relativeTime(d.updatedAt)}
                      </span>
                    </Link>
                  ) : (
                    <Link to={`/admin/contenido/${d.date}`}>
                      <span className="when">{formatShort(d.date)}</span>
                      <span className="muted">{d.title}</span>
                      <span className="pill rest">{d.kind === "holiday" ? "Festivo" : "Libre"}</span>
                    </Link>
                  )}
                </li>
              ))}
              {week.deliverable && (
                <li>
                  <button type="button" className="link-row" onClick={() => setEditing(week.deliverable)}>
                    <span className="when">{formatShort(week.deliverable.dueDate)}</span>
                    <span>
                      <b>{DELIVERABLE_KIND_LABEL[week.deliverable.kind]}</b>{" "}
                      <span className="mono muted" style={{ fontSize: 13 }}>
                        {week.deliverable.path}
                      </span>
                    </span>
                    <span className="muted" style={{ fontSize: 13 }}>
                      {week.deliverable.criteria.length} criterios · Editar
                    </span>
                  </button>
                </li>
              )}
            </ul>
          </details>
        ))}
      </div>
      <Modal open={editing !== null} onClose={() => setEditing(null)} label="Editar entregable">
        {editing && <DeliverableEditor deliverable={editing} onClose={() => setEditing(null)} />}
      </Modal>
    </div>
  );
}
