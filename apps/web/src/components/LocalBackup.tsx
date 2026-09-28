import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { useToast } from "./Toast";

/**
 * Copia de seguridad del modo sin servidor. Sirve para no perder el avance
 * y para pasarlo de un computador a otro (por ejemplo, del de Tomás al del administrador).
 */
export function LocalBackup() {
  const toast = useToast();
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const download = async () => {
    const { exportBackup } = await import("../local/store");
    const backup = await exportBackup();
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `plan-tomas-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast("Copia descargada.");
  };

  const restore = async (file: File) => {
    setBusy(true);
    try {
      const { importBackup, resetCache } = await import("../local/store");
      importBackup(await file.text());
      resetCache();
      await qc.invalidateQueries();
      toast("Datos cargados desde la copia.");
    } catch (err) {
      toast(err instanceof Error ? err.message : "No se pudo leer el archivo.", "error");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <div className="card stack">
      <div className="card-head" style={{ marginBottom: 0 }}>
        <h2>Copia de seguridad</h2>
      </div>
      <p className="muted">
        Esta versión de la página funciona sin servidor: el avance, las evaluaciones y los entregables se guardan en este navegador.
        Descarga una copia de vez en cuando. Para revisar el trabajo desde otro computador, descarga la copia aquí y cárgala allá.
      </p>
      <div className="row">
        <button type="button" className="btn" onClick={() => void download()}>
          Descargar copia
        </button>
        <label className="btn secondary" htmlFor="backup-file" aria-disabled={busy}>
          Cargar copia
        </label>
        <input
          ref={input}
          id="backup-file"
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void restore(file);
          }}
        />
      </div>
      <p className="muted" style={{ fontSize: 14 }}>
        Cargar una copia reemplaza los datos de este navegador por los del archivo.
      </p>
    </div>
  );
}
