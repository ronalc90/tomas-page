import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";
import { SQL_MAX_ROWS, SQL_TIMEOUT_MS, type SqlValue } from "@tomas/shared";

export interface SqlJob {
  setup?: string;
  sql: string;
  check?: string;
}

export interface RawResult {
  columns: string[];
  rows: SqlValue[][];
  /** true si la consulta devolvió más de SQL_MAX_ROWS filas (se guarda una de más). */
  truncated: boolean;
}

export type SqlOutcome =
  | { ok: true; result: RawResult | null }
  | { ok: false; timeout: false; phase: "setup" | "sql" | "check"; error: string }
  | { ok: false; timeout: true };

interface Pending {
  id: number;
  job: SqlJob;
  resolve: (outcome: SqlOutcome) => void;
  reject: (err: Error) => void;
}

const here = path.dirname(fileURLToPath(import.meta.url));

function firstExisting(candidates: (string | undefined)[], what: string): string {
  const list = candidates.filter((p): p is string => Boolean(p));
  const found = list.find((p) => existsSync(p));
  if (!found) throw new Error(`No se encontró ${what}. Probé: ${list.join(", ")}`);
  return found;
}

/** El script del worker: junto al bundle en producción (dist) y en src/sql en desarrollo y pruebas. */
export function resolveWorkerFile(): string {
  return firstExisting(
    [path.join(here, "sql-worker.mjs"), path.resolve(here, "../sql/sql-worker.mjs"), path.resolve(here, "sql/sql-worker.mjs")],
    "el worker de SQL (sql-worker.mjs)",
  );
}

/** La base de práctica (tienda.sql). En producción el Dockerfile la copia a packages/shared/src/data. */
export function resolveTiendaSql(explicit?: string): string {
  return firstExisting(
    [
      explicit,
      path.resolve(process.cwd(), "packages/shared/src/data/tienda.sql"),
      path.resolve(process.cwd(), "../../packages/shared/src/data/tienda.sql"),
      path.resolve(here, "../../../packages/shared/src/data/tienda.sql"),
      path.resolve(here, "../../../../packages/shared/src/data/tienda.sql"),
    ],
    "la base de práctica (tienda.sql)",
  );
}

/**
 * Ejecuta SQL de los estudiantes en un worker_thread con sql.js. Un trabajo a la vez, cada uno
 * sobre una copia limpia de la base. Si un trabajo pasa del límite de tiempo, se termina el
 * worker (no hay otra forma de cortar una consulta en curso) y se crea otro para lo que sigue.
 */
export class SqlRunner {
  private worker: Worker | null = null;
  private ready: Promise<void> | null = null;
  private queue: Pending[] = [];
  private current: Pending | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private nextId = 1;
  private closed = false;
  private schemaSql: string | null = null;

  constructor(private readonly options: { timeoutMs?: number; maxRows?: number; tiendaPath?: string } = {}) {}

  get timeoutMs(): number {
    return this.options.timeoutMs ?? SQL_TIMEOUT_MS;
  }

  run(job: SqlJob): Promise<SqlOutcome> {
    if (this.closed) return Promise.reject(new Error("El ejecutor de SQL está cerrado."));
    return new Promise<SqlOutcome>((resolve, reject) => {
      this.queue.push({ id: this.nextId++, job, resolve, reject });
      void this.pump();
    });
  }

  async close(): Promise<void> {
    this.closed = true;
    this.clearTimer();
    for (const p of [...this.queue, ...(this.current ? [this.current] : [])]) p.reject(new Error("El servidor se está cerrando."));
    this.queue = [];
    this.current = null;
    const w = this.worker;
    this.worker = null;
    this.ready = null;
    if (w) await w.terminate();
  }

  private start(): Promise<void> {
    this.schemaSql ??= readFileSync(resolveTiendaSql(this.options.tiendaPath), "utf8");
    const worker = new Worker(resolveWorkerFile(), { workerData: { schemaSql: this.schemaSql } });
    this.worker = worker;
    this.ready = new Promise<void>((resolve, reject) => {
      const onFirst = (msg: { ready?: boolean }) => {
        if (msg?.ready) {
          worker.off("error", onEarlyError);
          resolve();
        }
      };
      const onEarlyError = (err: Error) => reject(err);
      worker.once("message", onFirst);
      worker.once("error", onEarlyError);
    });
    worker.on("message", (msg: { id?: number; ok?: boolean; result?: RawResult | null; phase?: "setup" | "sql" | "check"; error?: string }) => {
      if (msg.id === undefined || !this.current || msg.id !== this.current.id) return;
      const done = this.current;
      this.current = null;
      this.clearTimer();
      done.resolve(
        msg.ok ? { ok: true, result: msg.result ?? null } : { ok: false, timeout: false, phase: msg.phase ?? "sql", error: msg.error ?? "Error desconocido" },
      );
      void this.pump();
    });
    worker.on("error", (err) => this.fail(worker, err));
    worker.on("exit", (code) => {
      if (this.worker === worker && !this.closed) this.fail(worker, new Error(`El worker de SQL terminó (código ${code}).`));
    });
    return this.ready;
  }

  /** El worker se cayó: falla el trabajo en curso y se crea uno nuevo para los demás. */
  private fail(worker: Worker, err: Error) {
    if (this.worker !== worker) return;
    this.worker = null;
    this.ready = null;
    this.clearTimer();
    const p = this.current;
    this.current = null;
    p?.reject(err);
    void worker.terminate().catch(() => undefined);
    if (!p) {
      // Falló al arrancar: no se puede atender la cola.
      for (const q of this.queue) q.reject(err);
      this.queue = [];
      return;
    }
    void this.pump();
  }

  private clearTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private async pump(): Promise<void> {
    if (this.current || this.queue.length === 0 || this.closed) return;
    const next = this.queue.shift()!;
    this.current = next;
    try {
      if (!this.worker) await this.start();
      else await this.ready;
    } catch (err) {
      if (this.current === next) this.current = null;
      next.reject(err as Error);
      this.worker = null;
      this.ready = null;
      void this.pump();
      return;
    }
    if (this.current !== next || this.closed) return;
    const worker = this.worker!;
    this.timer = setTimeout(() => {
      if (this.current !== next) return;
      // Se pasó del tiempo: se corta la consulta terminando el worker.
      this.current = null;
      this.worker = null;
      this.ready = null;
      this.timer = null;
      void worker.terminate().catch(() => undefined);
      next.resolve({ ok: false, timeout: true });
      void this.pump();
    }, this.timeoutMs);
    worker.postMessage({ id: next.id, setup: next.job.setup ?? "", sql: next.job.sql, check: next.job.check ?? "", maxRows: this.options.maxRows ?? SQL_MAX_ROWS });
  }
}
