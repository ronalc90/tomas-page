import { useEffect, useRef, type ReactNode } from "react";
import { PACE_LABEL, STATUS_LABEL, SUBMISSION_LABEL, type ItemStatus, type Pace, type SubmissionStatus } from "@tomas/shared";
import { errorMessage } from "../lib/api";
import { Icon } from "./Icon";

export function StatusPill({ status, label }: { status: ItemStatus; label?: string }) {
  return <span className={`pill ${status}`}>{label ?? STATUS_LABEL[status]}</span>;
}

export function SubmissionPill({ status }: { status: SubmissionStatus | null }) {
  const s = status ?? "draft";
  return <span className={`pill ${s}`}>{status ? SUBMISSION_LABEL[s] : "Sin empezar"}</span>;
}

export function PacePill({ pace }: { pace: Pace }) {
  return <span className={`pill ${pace}`}>{PACE_LABEL[pace]}</span>;
}

export function ProgressBar({ value, label, thin }: { value: number; label: string; thin?: boolean }) {
  const pct = Math.max(0, Math.min(100, Math.round(value * 100)));
  return (
    <div
      className={`bar ${thin ? "thin" : ""}`}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
    >
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="stat">
      <dt>{label}</dt>
      <dd>{value}</dd>
      {sub && <span className="sub">{sub}</span>}
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  lede,
  actions,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  lede?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div className="titles">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {lede && <p className="lede">{lede}</p>}
      </div>
      {actions && <div className="row">{actions}</div>}
    </header>
  );
}

export function Loading({ label = "Cargando…" }: { label?: string }) {
  return (
    <div className="center-screen" role="status">
      <div className="row">
        <span className="spinner" aria-hidden="true" />
        <span className="muted">{label}</span>
      </div>
    </div>
  );
}

export function ErrorState({ error, retry }: { error: unknown; retry?: () => void }) {
  return (
    <div className="empty" role="alert">
      <h3>No pudimos cargar esta sección</h3>
      <p>{errorMessage(error)}</p>
      {retry && (
        <button className="btn secondary" type="button" onClick={retry}>
          Intentar de nuevo
        </button>
      )}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {children && <p>{children}</p>}
    </div>
  );
}

export function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children}
      {error ? (
        <span className="error" id={`${id}-error`}>
          {error}
        </span>
      ) : (
        hint && <span className="hint">{hint}</span>
      )}
    </div>
  );
}

/** Diálogo modal accesible basado en <dialog>. */
export function Modal({ open, onClose, children, label }: { open: boolean; onClose: () => void; children: ReactNode; label: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);
  return (
    <dialog ref={ref} className="modal" aria-label={label} onClose={onClose} onCancel={onClose}>
      {open && <div className="modal-body">{children}</div>}
    </dialog>
  );
}

export function SaveIndicator({ state }: { state: "idle" | "pending" | "saving" | "saved" | "error" }) {
  if (state === "idle") return null;
  const text = { pending: "Sin guardar", saving: "Guardando…", saved: "Guardado", error: "No se pudo guardar" }[state];
  return (
    <span className="saving" aria-live="polite" style={state === "error" ? { color: "var(--bad)" } : undefined}>
      {state === "saved" && <Icon name="check" size={14} />}
      {text}
    </span>
  );
}
