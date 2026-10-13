import { useEffect } from "react";
import { api } from "./api";

/** Cada cuánto se avisa al servidor (suma 1 minuto de estudio por aviso). */
const PING_EVERY_MS = 60_000;
/** Sin teclado, mouse ni desplazamiento en este tiempo, no se cuenta como estudio. */
const IDLE_AFTER_MS = 3 * 60_000;

/**
 * Tiempo de estudio: mientras la pestaña está visible y hubo actividad en los últimos 3 minutos,
 * envía un ping por minuto. El servidor ignora los pings demasiado seguidos.
 */
export function useStudyPing(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    let last = Date.now();
    const mark = () => {
      last = Date.now();
    };
    const events = ["keydown", "pointerdown", "pointermove", "wheel", "scroll", "touchstart"] as const;
    for (const e of events) window.addEventListener(e, mark, { passive: true, capture: true });
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - last > IDLE_AFTER_MS) return;
      void api.post("/api/activity/ping").catch(() => undefined);
    }, PING_EVERY_MS);
    return () => {
      window.clearInterval(timer);
      for (const e of events) window.removeEventListener(e, mark, { capture: true });
    };
  }, [enabled]);
}
