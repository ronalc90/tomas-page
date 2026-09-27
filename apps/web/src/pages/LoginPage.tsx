import { useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router";
import { Icon } from "../components/Icon";
import { Field } from "../components/ui";
import { ApiError, errorMessage } from "../lib/api";
import { useLogin } from "../lib/queries";

export function LoginPage() {
  const login = useLogin();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fields = login.error instanceof ApiError ? login.error.fields : {};

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      const { user } = await login.mutateAsync({ username, password });
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from && from !== "/login" ? from : user.role === "admin" ? "/admin" : "/", { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <div className="auth-screen">
      <section className="auth-art" aria-hidden="false">
        <div className="brand" style={{ color: "inherit" }}>
          <span className="brand-mark" style={{ background: "rgba(255,255,255,.18)", color: "inherit" }}>
            <Icon name="code" size={18} />
          </span>
          <span className="brand-name">Plan de Tomás</span>
        </div>
        <div style={{ display: "grid", gap: 18 }}>
          <h1>Python y SQL antes de 2027.</h1>
          <p>Un taller por día, una evaluación al final de cada taller y un entregable cada sábado. Tu avance queda guardado.</p>
        </div>
        <pre className="auth-code" aria-hidden="true">
          <span className="c"># semana 11: SQL desde Python</span>
          {"\n"}
          <span className="k">import</span> sqlite3{"\n"}
          con = sqlite3.connect(<span className="s">"gastos.db"</span>){"\n"}
          sql = <span className="s">"SELECT categoria, SUM(valor) FROM gastos"</span>
          {"\n"}
          {"      "}
          <span className="s">"GROUP BY categoria"</span>
          {"\n"}
          <span className="k">for</span> cat, total <span className="k">in</span> con.execute(sql):{"\n"}
          {"    "}print(<span className="s">f"</span>
          {"{cat}: ${total:,}"}
          <span className="s">"</span>)
        </pre>
      </section>

      <div className="auth-form-wrap">
        <form className="auth-form" onSubmit={submit} noValidate>
          <div style={{ display: "grid", gap: 6 }}>
            <h2>Inicia sesión</h2>
            <p className="muted">Entra con el usuario y la contraseña que te dieron.</p>
          </div>

          {error && (
            <div className="alert error" role="alert">
              {error}
            </div>
          )}

          <Field id="username" label="Usuario" error={fields.username}>
            <input
              id="username"
              className="input"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              aria-invalid={Boolean(fields.username)}
              required
            />
          </Field>

          <Field id="password" label="Contraseña" error={fields.password}>
            <div style={{ position: "relative" }}>
              <input
                id="password"
                className="input"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-invalid={Boolean(fields.password)}
                style={{ paddingRight: 48 }}
                required
              />
              <button
                type="button"
                className="btn ghost small icon"
                style={{ position: "absolute", right: 5, top: 5 }}
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                aria-pressed={showPassword}
              >
                <Icon name="eye" size={18} />
              </button>
            </div>
          </Field>

          <button className="btn" type="submit" disabled={login.isPending} style={{ minHeight: 46 }}>
            {login.isPending ? "Entrando…" : "Entrar"}
          </button>
          <p className="muted" style={{ fontSize: 14 }}>
            ¿Olvidaste tu contraseña? Pídele al administrador que la restablezca.
          </p>
        </form>
      </div>
    </div>
  );
}
