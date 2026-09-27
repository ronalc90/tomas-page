import { useState, type FormEvent } from "react";
import { ROLE_LABEL } from "@tomas/shared";
import { useToast } from "../../components/Toast";
import { Field, PageHeader } from "../../components/ui";
import { ApiError, errorMessage } from "../../lib/api";
import { useChangePassword, useMe } from "../../lib/queries";
import { applyTheme, getTheme, type Theme } from "../../lib/theme";

export function AccountPage() {
  const me = useMe();
  const change = useChangePassword();
  const toast = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [theme, setTheme] = useState<Theme>(getTheme);
  const fields = change.error instanceof ApiError ? change.error.fields : {};
  const user = me.data?.user;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setLocalError(null);
    if (next !== confirm) {
      setLocalError("La confirmación no coincide con la contraseña nueva.");
      return;
    }
    try {
      await change.mutateAsync({ currentPassword: current, newPassword: next });
      setCurrent("");
      setNext("");
      setConfirm("");
      toast("Contraseña actualizada. Cerramos tus otras sesiones.");
    } catch (err) {
      setLocalError(errorMessage(err));
    }
  };

  return (
    <div className="page narrow">
      <PageHeader eyebrow="Mi cuenta" title={user?.displayName ?? ""} lede={user ? `@${user.username} · ${ROLE_LABEL[user.role]}` : undefined} />

      <form className="card stack" onSubmit={submit} noValidate>
        <div className="card-head" style={{ marginBottom: 0 }}>
          <h2>Cambiar contraseña</h2>
          <span className="muted" style={{ fontSize: 14 }}>
            Al cambiarla se cierran tus sesiones en otros equipos.
          </span>
        </div>
        {localError && (
          <div className="alert error" role="alert">
            {localError}
          </div>
        )}
        <Field id="current" label="Contraseña actual" error={fields.currentPassword}>
          <input id="current" className="input" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        </Field>
        <div className="form-grid">
          <Field id="new" label="Contraseña nueva" error={fields.newPassword} hint={user?.role === "admin" ? "Al menos 10 caracteres." : "Al menos 4 caracteres."}>
            <input id="new" className="input" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
          </Field>
          <Field id="confirm" label="Repite la contraseña nueva">
            <input id="confirm" className="input" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </Field>
        </div>
        <div className="row">
          <button className="btn" type="submit" disabled={change.isPending || !current || !next}>
            {change.isPending ? "Guardando…" : "Guardar contraseña"}
          </button>
        </div>
      </form>

      <div className="card stack">
        <div className="card-head" style={{ marginBottom: 0 }}>
          <h2>Apariencia</h2>
        </div>
        <div className="tabs" role="tablist" aria-label="Tema">
          {(["system", "light", "dark"] as Theme[]).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={theme === t}
              onClick={() => {
                applyTheme(t);
                setTheme(t);
              }}
            >
              {{ system: "Como el sistema", light: "Claro", dark: "Oscuro" }[t]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
