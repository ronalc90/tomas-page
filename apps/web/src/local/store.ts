/**
 * Base de datos del modo sin servidor (GitHub Pages).
 * Todo vive en el almacenamiento del navegador. El contenido del plan viene
 * empaquetado con la página; aquí solo se guardan las ediciones del administrador.
 */
import type { AdminQuestion, DeliverableKind, DayKind, Language, Role, SubmissionStatus } from "@tomas/shared";

export const STORAGE_KEY = "tp-local-db-v1";
export const SESSION_KEY = "tp-local-session";
export const TODAY_KEY = "tp-local-today";

export interface LocalUser {
  id: string;
  username: string;
  displayName: string;
  role: Role;
  passwordHash: string;
  salt: string;
  active: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface DayOverride {
  title: string;
  summary: string;
  concept: string;
  example: string;
  language: Language;
  exampleOutput: string;
  tasks: string[];
  questions: AdminQuestion[];
  updatedAt: string;
}

export interface DeliverableOverride {
  path: string;
  description: string;
  criteria: string[];
}

export interface LocalDb {
  version: 1;
  seq: number;
  users: LocalUser[];
  overrides: { days: Record<string, DayOverride>; deliverables: Record<string, DeliverableOverride> };
  dayProgress: Record<string, Record<string, { tasks: boolean[]; evidence: string; completedAt: string | null; updatedAt: string }>>;
  quizAttempts: { id: number; userId: string; date: string; answers: number[]; score: number; total: number; createdAt: string }[];
  submissions: Record<
    string,
    Record<
      string,
      {
        criteria: boolean[];
        evidence: string;
        status: SubmissionStatus;
        submittedAt: string | null;
        reviewedAt: string | null;
        reviewerId: string | null;
        feedback: string;
        updatedAt: string;
      }
    >
  >;
  activity: { id: number; userId: string; type: string; ref: string | null; detail: Record<string, unknown>; createdAt: string }[];
  settings: { passScore: number; programName: string; timeZone: string };
}

/** Contraseñas iniciales del modo sin servidor. Se pueden cambiar desde "Mi cuenta". */
export const DEFAULT_ACCOUNTS = [
  { username: "admin", displayName: "Administrador", role: "admin" as const, password: "admin-tomas-2026" },
  { username: "tomas", displayName: "Tomás", role: "student" as const, password: "1234" },
];

// ---------- Almacenamiento ----------

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const memory = new Map<string, string>();
const memoryStore: KeyValueStore = {
  getItem: (k) => memory.get(k) ?? null,
  setItem: (k, v) => void memory.set(k, v),
  removeItem: (k) => void memory.delete(k),
};

let store: KeyValueStore = memoryStore;
try {
  if (typeof localStorage !== "undefined") {
    localStorage.setItem("tp-probe", "1");
    localStorage.removeItem("tp-probe");
    store = localStorage;
  }
} catch {
  store = memoryStore;
}

/** Solo para pruebas. */
export function useStore(next: KeyValueStore) {
  store = next;
}

export const storage = {
  get: (key: string) => {
    try {
      return store.getItem(key);
    } catch {
      return null;
    }
  },
  set: (key: string, value: string) => {
    try {
      store.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  },
  remove: (key: string) => {
    try {
      store.removeItem(key);
    } catch {
      /* nada que borrar */
    }
  },
};

// ---------- Contraseñas (PBKDF2) ----------

const encoder = new TextEncoder();
const toHex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

export function randomId(bytes = 16): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return [...arr].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function uuid(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const h = randomId(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export async function hashPassword(password: string, salt: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: encoder.encode(salt), iterations: 120_000, hash: "SHA-256" }, key, 256);
  return toHex(bits);
}

// ---------- Carga y guardado ----------

let cache: LocalDb | null = null;

function isDb(value: unknown): value is LocalDb {
  const v = value as LocalDb;
  return Boolean(v && v.version === 1 && Array.isArray(v.users) && v.overrides && v.settings);
}

async function createDb(): Promise<LocalDb> {
  const now = new Date().toISOString();
  const users: LocalUser[] = [];
  for (const account of DEFAULT_ACCOUNTS) {
    const salt = randomId(12);
    users.push({
      id: uuid(),
      username: account.username,
      displayName: account.displayName,
      role: account.role,
      passwordHash: await hashPassword(account.password, salt),
      salt,
      active: true,
      createdAt: now,
      lastLoginAt: null,
    });
  }
  return {
    version: 1,
    seq: 1,
    users,
    overrides: { days: {}, deliverables: {} },
    dayProgress: {},
    quizAttempts: [],
    submissions: {},
    activity: [],
    settings: { passScore: 3, programName: "Plan de Tomás · Python y SQL", timeZone: "America/Bogota" },
  };
}

export async function loadDb(): Promise<LocalDb> {
  if (cache) return cache;
  const raw = storage.get(STORAGE_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (isDb(parsed)) {
        cache = parsed;
        return parsed;
      }
    } catch {
      /* datos dañados: se crea una base nueva */
    }
  }
  cache = await createDb();
  saveDb(cache);
  return cache;
}

export function saveDb(db: LocalDb): void {
  cache = db;
  // Se guarda solo lo último del registro de actividad para no llenar el almacenamiento.
  if (db.activity.length > 600) db.activity = db.activity.slice(-500);
  storage.set(STORAGE_KEY, JSON.stringify(db));
}

/** Olvida la copia en memoria (por ejemplo, si otra pestaña cambió los datos). */
export function resetCache(): void {
  cache = null;
}

export function nextId(db: LocalDb): number {
  db.seq += 1;
  return db.seq;
}

// ---------- Copia de seguridad ----------

export interface Backup {
  app: "plan-tomas";
  exportedAt: string;
  db: LocalDb;
}

export async function exportBackup(): Promise<Backup> {
  return { app: "plan-tomas", exportedAt: new Date().toISOString(), db: await loadDb() };
}

export function importBackup(text: string): LocalDb {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("El archivo no es un JSON válido.");
  }
  const db = (parsed as Backup)?.db ?? parsed;
  if (!isDb(db)) throw new Error("El archivo no es una copia de seguridad de este plan.");
  // Conserva la sesión: si quien carga la copia existe en ella (mismo usuario), sigue conectado.
  const currentId = storage.get(SESSION_KEY);
  const current = cache?.users.find((u) => u.id === currentId);
  const match = current ? db.users.find((u) => u.username === current.username && u.active) : undefined;
  if (match) storage.set(SESSION_KEY, match.id);
  else storage.remove(SESSION_KEY);
  saveDb(db);
  return db;
}

export type { DayKind, DeliverableKind };
