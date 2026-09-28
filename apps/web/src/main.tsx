import "@fontsource-variable/bricolage-grotesque/opsz.css";
import "@fontsource/atkinson-hyperlegible/400.css";
import "@fontsource/atkinson-hyperlegible/700.css";
import "@fontsource/atkinson-hyperlegible/400-italic.css";
import "@fontsource-variable/jetbrains-mono";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/layout.css";
import "./styles/components.css";
import "./styles/pages.css";

import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { App } from "./App";
import { ToastProvider } from "./components/Toast";
import { ApiError } from "./lib/api";
import { keys } from "./lib/queries";
import { BASENAME, LOCAL_MODE } from "./lib/mode";
import { applyTheme, getTheme } from "./lib/theme";

applyTheme(getTheme());

// Si una petición responde 401, la sesión expiró: volvemos a la pantalla de inicio de sesión.
const onError = (error: unknown) => {
  if (error instanceof ApiError && error.status === 401) queryClient.setQueryData(keys.me, null);
};

const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError }),
  mutationCache: new MutationCache({ onError }),
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnWindowFocus: true,
      retry: (count, error) => !(error instanceof ApiError && error.status >= 400 && error.status < 500) && count < 2,
    },
  },
});

if (LOCAL_MODE) {
  // Si los datos cambian en otra pestaña, se recargan aquí.
  window.addEventListener("storage", (event) => {
    if (event.key?.startsWith("tp-local")) {
      void import("./local/store").then(({ resetCache }) => {
        resetCache();
        void queryClient.invalidateQueries();
      });
    }
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter basename={BASENAME || undefined}>
        <ToastProvider>
          <App />
        </ToastProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
