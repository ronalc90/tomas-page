import type { RunRequest, RunResponse, SchemaTable, WorkerRequest, WorkerResponse } from "./protocol";

type Pending = { resolve: (value: WorkerResponse) => void; reject: (err: Error) => void };

/** La consulta se canceló con "Detener" (o se cerró el motor). */
export class StoppedError extends Error {
  constructor() {
    super("Consulta detenida.");
  }
}

type Listener = () => void;

/**
 * Un motor SQLite en un Web Worker. "Detener" termina el worker (es la única forma de cortar una
 * consulta en curso) y el siguiente uso crea otro con la base original.
 */
export class SqlEngine {
  private worker: Worker | null = null;
  private pending = new Map<number, Pending>();
  private nextId = 1;
  private listeners = new Set<Listener>();
  /** Cuántas peticiones hay en curso (para mostrar "Ejecutando…" y el botón Detener). */
  busy = 0;
  /** Sube cada vez que el worker se recrea: la base del laboratorio volvió a su estado original. */
  generation = 0;

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit() {
    for (const l of this.listeners) l();
  }

  private ensure(): Worker {
    if (this.worker) return this.worker;
    const worker = new Worker(new URL("./sql.worker.ts", import.meta.url), { type: "module", name: "sqlite" });
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const p = this.pending.get(event.data.id);
      if (!p) return;
      this.pending.delete(event.data.id);
      this.busy = Math.max(0, this.busy - 1);
      this.emit();
      if (event.data.type === "error") p.reject(new Error(event.data.error));
      else p.resolve(event.data);
    };
    worker.onerror = (event) => {
      event.preventDefault();
      this.fail(new Error("No se pudo cargar el motor de SQL. Recarga la página."));
    };
    this.worker = worker;
    return worker;
  }

  private fail(err: Error) {
    for (const p of this.pending.values()) p.reject(err);
    this.pending.clear();
    this.busy = 0;
    this.worker?.terminate();
    this.worker = null;
    this.generation += 1;
    this.emit();
  }

  private request(msg: Omit<WorkerRequest, "id">): Promise<WorkerResponse> {
    const worker = this.ensure();
    const id = this.nextId++;
    return new Promise<WorkerResponse>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.busy += 1;
      this.emit();
      worker.postMessage({ ...msg, id } as WorkerRequest);
    });
  }

  async run(req: RunRequest): Promise<RunResponse> {
    const res = await this.request({ type: "run", ...req });
    if (res.type !== "run") throw new Error("Respuesta inesperada del motor de SQL.");
    return res.response;
  }

  async schema(): Promise<SchemaTable[]> {
    const res = await this.request({ type: "schema" });
    return res.type === "schema" ? res.tables : [];
  }

  async reset(): Promise<void> {
    await this.request({ type: "reset" });
    this.generation += 1;
    this.emit();
  }

  async exportDb(): Promise<Uint8Array> {
    const res = await this.request({ type: "export" });
    if (res.type !== "export") throw new Error("No se pudo exportar la base.");
    return res.bytes;
  }

  /** Corta lo que esté corriendo. La base vuelve a su estado original. */
  stop() {
    if (!this.worker) return;
    this.fail(new StoppedError());
  }
}

let lab: SqlEngine | null = null;
let clean: SqlEngine | null = null;

/** La base del laboratorio: los cambios duran mientras la pestaña está abierta. */
export function labEngine(): SqlEngine {
  lab ??= new SqlEngine();
  return lab;
}

/** Para ejemplos y ejercicios: cada ejecución usa una copia limpia de la base. */
export function cleanEngine(): SqlEngine {
  clean ??= new SqlEngine();
  return clean;
}
