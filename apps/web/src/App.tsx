import { lazy, Suspense, type ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router";
import type { MeResponse } from "@tomas/shared";
import { AppShell } from "./components/AppShell";
import { ErrorState, Loading } from "./components/ui";
import { useMe } from "./lib/queries";
import { LoginPage } from "./pages/LoginPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { AccountPage } from "./pages/student/AccountPage";
import { DashboardPage } from "./pages/student/DashboardPage";
import { DayPage, TodayRedirect } from "./pages/student/DayPage";
import { DeliverablesPage } from "./pages/student/DeliverablesPage";

// El panel de administración se carga aparte: el estudiante nunca descarga ese código.
const AdminRoutes = lazy(() => import("./pages/admin/AdminRoutes"));
// Las guías traen bastante texto: se descargan solo cuando alguien las abre.
const GuidesPage = lazy(() => import("./pages/student/GuidesPage").then((m) => ({ default: m.GuidesPage })));
const GuidePage = lazy(() => import("./pages/student/GuidesPage").then((m) => ({ default: m.GuidePage })));

function RequireAuth({ me, children }: { me: MeResponse | null | undefined; children: ReactNode }) {
  const location = useLocation();
  if (!me) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return children;
}

export function App() {
  const { data: me, isLoading, error, refetch } = useMe();

  if (isLoading) return <Loading label="Abriendo tu plan…" />;
  if (error) return <ErrorState error={error} retry={() => void refetch()} />;

  return (
    <Routes>
      <Route path="/login" element={me ? <Navigate to={me.user.role === "admin" ? "/admin" : "/"} replace /> : <LoginPage />} />
      <Route
        element={
          <RequireAuth me={me}>
            <AppShell me={me!} />
          </RequireAuth>
        }
      >
        <Route index element={me?.user.role === "admin" ? <Navigate to="/admin" replace /> : <DashboardPage />} />
        <Route path="hoy" element={<TodayRedirect />} />
        <Route path="dia/:date" element={<DayPage />} />
        <Route path="entregables" element={<DeliverablesPage />} />
        <Route
          path="guias"
          element={
            <Suspense fallback={<Loading />}>
              <GuidesPage />
            </Suspense>
          }
        />
        <Route
          path="guias/:slug"
          element={
            <Suspense fallback={<Loading />}>
              <GuidePage />
            </Suspense>
          }
        />
        <Route path="cuenta" element={<AccountPage />} />
        <Route
          path="admin/*"
          element={
            me?.user.role === "admin" ? (
              <Suspense fallback={<Loading />}>
                <AdminRoutes />
              </Suspense>
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
