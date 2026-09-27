import { useState, type FormEvent } from "react";
import { ADMIN_MIN_PASSWORD, ROLE_LABEL, STUDENT_MIN_PASSWORD, type Role, type UserRow } from "@tomas/shared";
import { Icon } from "../../components/Icon";
import { useToast } from "../../components/Toast";
import { ErrorState, Field, Loading, Modal, PageHeader } from "../../components/ui";
import { ApiError, errorMessage } from "../../lib/api";
import { initials, relativeTime } from "../../lib/format";
import { useCreateUser, useMe, useResetPassword, useUpdateUser, useUsers } from "../../lib/queries";

function CreateUserForm({ onDone }: { onDone: () => void }) {
  const create = useCreateUser();
  const toast = useToast();
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<Role>("student");
  const [password, setPassword] = useState("");
  const fields = create.error instanceof ApiError ? create.error.fields : {};
  const min = role === "admin" ? ADMIN_MIN_PASSWORD : STUDENT_MIN_PASSWORD;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const user = await create.mutateAsync({ username, displayName, role, password });
      toast(`Usuario @${user.username} creado.`);
      onDone();
    } catch (err) {
      if (!(err instanceof ApiError && Object.keys(err.fields).length)) toast(errorMessage(err), "error");
    }
  };

  return (
    <form className="stack" onSubmit={submit} noValidate>
      <h2>Nuevo usuario</h2>
      <div className="form-grid">
        <Field id="u-name" label="Nombre" error={fields.displayName}>
          <input id="u-name" className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} autoFocus />
        </Field>
        <Field id="u-user" label="Usuario" hint="Minúsculas, sin espacios." error={fields.username}>
          <input id="u-user" className="input" autoCapitalize="none" spellCheck={false} value={username} onChange={(e) => setUsername(e.target.value)} />
        </Field>
        <Field id="u-role" label="Rol">
          <select id="u-role" className="select" value={role} onChange={(e) => setRole(e.target.value as Role)}>
            <option value="student">Estudiante</option>
            <option value="admin">Administrador</option>
          </select>
        </Field>
        <Field id="u-pass" label="Contraseña inicial" hint={`Al menos ${min} caracteres.`} error={fields.password}>
          <input id="u-pass" className="input" type="text" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
      </div>
      <div className="row end">
        <button type="button" className="btn secondary" onClick={onDone}>
          Cancelar
        </button>
        <button type="submit" className="btn" disabled={create.isPending}>
          Crear usuario
        </button>
      </div>
    </form>
  );
}

function ResetPasswordForm({ user, onDone }: { user: UserRow; onDone: () => void }) {
  const reset = useResetPassword();
  const toast = useToast();
  const [password, setPassword] = useState("");
  const fields = reset.error instanceof ApiError ? reset.error.fields : {};
  const min = user.role === "admin" ? ADMIN_MIN_PASSWORD : STUDENT_MIN_PASSWORD;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await reset.mutateAsync({ id: user.id, password });
      toast(`Contraseña de @${user.username} restablecida. Sus sesiones se cerraron.`);
      onDone();
    } catch (err) {
      if (!(err instanceof ApiError && Object.keys(err.fields).length)) toast(errorMessage(err), "error");
    }
  };

  return (
    <form className="stack" onSubmit={submit} noValidate>
      <h2>Restablecer contraseña</h2>
      <p className="muted">
        {user.displayName} (@{user.username}) tendrá que entrar con la contraseña nueva. Se cerrarán sus sesiones abiertas.
      </p>
      <Field id="r-pass" label="Contraseña nueva" hint={`Al menos ${min} caracteres.`} error={fields.password}>
        <input id="r-pass" className="input" type="text" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
      </Field>
      <div className="row end">
        <button type="button" className="btn secondary" onClick={onDone}>
          Cancelar
        </button>
        <button type="submit" className="btn" disabled={reset.isPending || password.length < min}>
          Restablecer
        </button>
      </div>
    </form>
  );
}

export function UsersPage() {
  const { data, isLoading, error, refetch } = useUsers();
  const me = useMe();
  const update = useUpdateUser();
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [resetting, setResetting] = useState<UserRow | null>(null);

  if (isLoading) return <Loading />;
  if (error) return <ErrorState error={error} retry={() => void refetch()} />;

  const toggleActive = async (u: UserRow) => {
    try {
      await update.mutateAsync({ id: u.id, active: !u.active });
      toast(u.active ? `@${u.username} desactivado. Ya no puede entrar.` : `@${u.username} activado.`);
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  return (
    <div className="page">
      <PageHeader
        eyebrow="Usuarios"
        title="Cuentas y accesos"
        lede="Crea estudiantes o administradores, restablece contraseñas y desactiva cuentas."
        actions={
          <button className="btn" type="button" onClick={() => setCreating(true)}>
            <Icon name="plus" size={18} /> Nuevo usuario
          </button>
        }
      />
      <div className="card flush">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Usuario</th>
                <th>Rol</th>
                <th>Estado</th>
                <th>Último ingreso</th>
                <th>Creado</th>
                <th>
                  <span className="visually-hidden">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {data!.map((u) => {
                const self = u.id === me.data?.user.id;
                return (
                  <tr key={u.id}>
                    <td>
                      <div className="person">
                        <span className="avatar" aria-hidden="true">
                          {initials(u.displayName)}
                        </span>
                        <span>
                          <b>
                            {u.displayName}
                            {self && <span className="muted"> (tú)</span>}
                          </b>
                          <span>@{u.username}</span>
                        </span>
                      </div>
                    </td>
                    <td>{ROLE_LABEL[u.role]}</td>
                    <td>
                      <span className={`pill ${u.active ? "done" : "inactive"}`}>{u.active ? "Activo" : "Inactivo"}</span>
                    </td>
                    <td className="muted">{relativeTime(u.lastLoginAt)}</td>
                    <td className="muted">{relativeTime(u.createdAt)}</td>
                    <td>
                      <div className="row end" style={{ flexWrap: "nowrap" }}>
                        <button type="button" className="btn ghost small" onClick={() => setResetting(u)}>
                          <Icon name="key" size={16} /> Contraseña
                        </button>
                        {!self && (
                          <button type="button" className={`btn small ${u.active ? "danger" : "secondary"}`} disabled={update.isPending} onClick={() => toggleActive(u)}>
                            {u.active ? "Desactivar" : "Activar"}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={creating} onClose={() => setCreating(false)} label="Nuevo usuario">
        {creating && <CreateUserForm onDone={() => setCreating(false)} />}
      </Modal>
      <Modal open={resetting !== null} onClose={() => setResetting(null)} label="Restablecer contraseña">
        {resetting && <ResetPasswordForm user={resetting} onDone={() => setResetting(null)} />}
      </Modal>
    </div>
  );
}
