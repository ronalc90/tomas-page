import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router";
import { ROLE_LABEL, type MeResponse } from "@tomas/shared";
import { initials } from "../lib/format";
import { LOCAL_MODE } from "../lib/mode";
import { useLogout, useOverview } from "../lib/queries";
import { applyTheme, getTheme, type Theme } from "../lib/theme";
import { Icon, type IconName } from "./Icon";

interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  end?: boolean;
  badge?: number;
}

function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(getTheme);
  const next: Theme = theme === "system" ? "dark" : theme === "dark" ? "light" : "system";
  const labels: Record<Theme, string> = { system: "Tema del sistema", dark: "Tema oscuro", light: "Tema claro" };
  return (
    <button
      type="button"
      className="btn ghost small icon"
      onClick={() => {
        applyTheme(next);
        setTheme(next);
      }}
      title={`${labels[theme]} (cambiar)`}
      aria-label={`${labels[theme]}. Cambiar a ${labels[next].toLowerCase()}`}
    >
      <Icon name={theme === "dark" ? "moon" : "sun"} size={18} />
    </button>
  );
}

function PendingBadge() {
  const { data } = useOverview();
  return data?.pendingReviews ? <span className="badge">{data.pendingReviews}</span> : null;
}

export function AppShell({ me }: { me: MeResponse }) {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const logout = useLogout();
  const isAdmin = me.user.role === "admin";

  useEffect(() => setOpen(false), [location.pathname]);

  const student: NavItem[] = [
    { to: "/", label: "Inicio", icon: "home", end: true },
    { to: "/hoy", label: "Hoy", icon: "today" },
    { to: "/entregables", label: "Entregables", icon: "inbox" },
  ];
  const admin: NavItem[] = [
    { to: "/admin", label: "Resumen", icon: "chart", end: true },
    { to: "/admin/estudiantes", label: "Estudiantes", icon: "users" },
    { to: "/admin/revisiones", label: "Revisiones", icon: "review" },
    { to: "/admin/contenido", label: "Contenido", icon: "book" },
    { to: "/admin/usuarios", label: "Usuarios", icon: "key" },
    { to: "/admin/ajustes", label: "Ajustes", icon: "settings" },
  ];

  const renderLink = (item: NavItem) => (
    <NavLink key={item.to} to={item.to} end={item.end}>
      <Icon name={item.icon} />
      {item.label}
      {item.to === "/admin/revisiones" && <PendingBadge />}
    </NavLink>
  );

  return (
    <div className={`shell ${open ? "open" : ""}`}>
      <header className="topbar">
        <NavLink to={isAdmin ? "/admin" : "/"} className="brand">
          <span className="brand-mark">
            <Icon name="code" size={18} />
          </span>
          <span className="brand-name">{me.settings.programName.split("·")[0].trim()}</span>
        </NavLink>
        <button className="btn secondary icon" type="button" aria-label="Abrir menú" onClick={() => setOpen(true)}>
          <Icon name="menu" />
        </button>
      </header>
      <div className="scrim" onClick={() => setOpen(false)} aria-hidden="true" />

      <aside className="sidebar" aria-label="Navegación principal">
        <div className="row between">
          <NavLink to={isAdmin ? "/admin" : "/"} className="brand">
            <span className="brand-mark">
              <Icon name="code" size={18} />
            </span>
            <span className="brand-name">
              {me.settings.programName.split("·")[0].trim()}
              <small>{me.settings.programName.split("·")[1]?.trim() ?? "Python y SQL"}</small>
            </span>
          </NavLink>
          <button
            className="btn ghost icon small topbar-close"
            type="button"
            aria-label="Cerrar menú"
            onClick={() => setOpen(false)}
            style={{ display: open ? undefined : "none" }}
          >
            <Icon name="close" />
          </button>
        </div>

        {isAdmin && (
          <nav className="nav" aria-label="Administración">
            <span className="nav-label eyebrow">Administración</span>
            {admin.map(renderLink)}
          </nav>
        )}
        <nav className="nav" aria-label={isAdmin ? "Vista del estudiante" : "Mi plan"}>
          <span className="nav-label eyebrow">{isAdmin ? "Vista del estudiante" : "Mi plan"}</span>
          {(isAdmin ? student.filter((i) => i.to !== "/") : student).map(renderLink)}
          <NavLink to="/cuenta">
            <Icon name="user" />
            Mi cuenta
          </NavLink>
        </nav>

        <div className="sidebar-footer">
          {LOCAL_MODE && (
            <NavLink to="/cuenta" className="local-note" title="Los datos se guardan en este navegador. Descarga una copia desde Mi cuenta.">
              <span className="dot" aria-hidden="true" />
              Datos guardados en este navegador
            </NavLink>
          )}
          <div className="user-card">
            <span className="avatar" aria-hidden="true">
              {initials(me.user.displayName)}
            </span>
            <span className="who">
              <b>{me.user.displayName}</b>
              <span>
                @{me.user.username} · {ROLE_LABEL[me.user.role]}
              </span>
            </span>
          </div>
          <div className="sidebar-actions">
            <ThemeToggle />
            <button
              type="button"
              className="btn ghost small"
              disabled={logout.isPending}
              onClick={() => logout.mutate()}
            >
              <Icon name="logout" size={18} />
              Cerrar sesión
            </button>
          </div>
        </div>
      </aside>

      <main className="main" id="contenido">
        <Outlet />
      </main>
    </div>
  );
}
