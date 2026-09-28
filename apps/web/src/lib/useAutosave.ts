import { useCallback, useEffect, useRef, useState } from "react";

export type SaveState = "idle" | "pending" | "saving" | "saved" | "error";

/**
 * Guarda un texto automáticamente cuando el usuario deja de escribir.
 * También guarda al salir del campo y antes de cambiar de página.
 */
export function useAutosave(save: (value: string) => Promise<unknown>, delay = 600) {
  const [state, setState] = useState<SaveState>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<string | null>(null);
  const saveRef = useRef(save);
  saveRef.current = save;

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const value = pending.current;
    if (value === null) return;
    pending.current = null;
    setState("saving");
    try {
      await saveRef.current(value);
      setState(pending.current === null ? "saved" : "pending");
    } catch {
      setState("error");
    }
  }, []);

  const schedule = useCallback(
    (value: string) => {
      pending.current = value;
      setState("pending");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), delay);
    },
    [delay, flush],
  );

  useEffect(() => {
    // Al ocultar la pestaña (recargar, cerrar o cambiar de app) se guarda lo que falte.
    const onHide = () => void flush();
    const onVisibility = () => document.visibilityState === "hidden" && onHide();
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onVisibility);
      void flush();
    };
  }, [flush]);

  return { state, schedule, flush };
}
