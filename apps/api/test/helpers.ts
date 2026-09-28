import type { Answer } from "@tomas/shared";
import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll } from "vitest";
import { buildApp } from "../src/app";
import { loadConfig } from "../src/config";
import type { AppContext } from "../src/context";
import { createDb, type DbHandle } from "../src/db/client";
import { seedUsers } from "../src/db/seed";

export const ADMIN = { username: "admin", password: "admin-password-123" };
export const STUDENT = { username: "tomas", password: "1234" };

export interface TestEnv {
  app: FastifyInstance;
  ctx: AppContext;
  handle: DbHandle;
}

/** Crea la app con una fecha fija de "hoy" y usuarios nuevos para cada archivo de pruebas. */
export function useTestApp(today = "2026-10-01"): TestEnv {
  const env = {} as TestEnv;
  beforeAll(async () => {
    const config = loadConfig({
      ...process.env,
      FAKE_TODAY: today,
      SEED_ADMIN_PASSWORD: ADMIN.password,
      SEED_STUDENT_PASSWORD: STUDENT.password,
    });
    env.handle = createDb(config.databaseUrl);
    await env.handle.db.execute(sql`TRUNCATE users, activity RESTART IDENTITY CASCADE`);
    await env.handle.db.execute(sql`UPDATE settings SET value = '5'::jsonb WHERE key = 'passScore'`);
    await seedUsers(env.handle.db, config.seed);
    const built = await buildApp(config, env.handle.db);
    env.app = built.app;
    env.ctx = built.ctx;
    await env.app.ready();
  });
  afterAll(async () => {
    await env.app?.close();
    await env.handle?.close();
  });
  return env;
}

export async function login(app: FastifyInstance, username: string, password: string): Promise<string> {
  const res = await app.inject({ method: "POST", url: "/api/auth/login", payload: { username, password } });
  if (res.statusCode !== 200) throw new Error(`Login falló (${res.statusCode}): ${res.body}`);
  const cookie = res.cookies.find((c) => c.name === "tp_session");
  if (!cookie) throw new Error("No llegó la cookie de sesión");
  return `tp_session=${cookie.value}`;
}

export function client(app: FastifyInstance, cookie?: string) {
  const call = (method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", url: string, payload?: unknown) =>
    app.inject({ method, url, payload: payload as object | undefined, headers: cookie ? { cookie } : {} });
  return {
    get: (url: string) => call("GET", url),
    post: (url: string, body?: unknown) => call("POST", url, body ?? {}),
    put: (url: string, body: unknown) => call("PUT", url, body),
    patch: (url: string, body: unknown) => call("PATCH", url, body),
  };
}

/** Respuestas correctas de un día, leídas directamente de la base: índice o texto según el tipo. */
export async function correctAnswers(env: TestEnv, date: string): Promise<Answer[]> {
  const rows = await env.handle.db.execute<{ type: string; correct_index: number; accepted: string[] }>(
    sql`select type, correct_index, accepted from questions where date = ${date} order by position`,
  );
  return rows.rows.map((r) => (r.type === "output" || r.type === "fill" ? r.accepted[0] : r.correct_index));
}

/** Una respuesta equivocada por pregunta (válida en forma, incorrecta en contenido). */
export const wrongAnswers = (answers: Answer[]): Answer[] => answers.map((a) => (typeof a === "number" ? (a + 1) % 2 : "respuesta mala"));
