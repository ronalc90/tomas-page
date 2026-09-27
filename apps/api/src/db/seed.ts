import { count, eq, sql } from "drizzle-orm";
import type { Config } from "../config";
import { hashPassword } from "../lib/password";
import type { Database } from "./client";
import { days, deliverables, phases, questions, settings, users, weeks } from "./schema";
import plan from "./seed-data/plan.json";

type PlanJson = typeof plan;

export const DEFAULT_SETTINGS = {
  passScore: 3,
  timeZone: "America/Bogota",
  programName: "Plan de Tomás · Python y SQL",
};

/** Carga el contenido del plan. Si ya hay contenido y no se pide reset, no toca nada (respeta las ediciones del admin). */
export async function seedContent(db: Database, options: { reset?: boolean } = {}): Promise<boolean> {
  const [{ value: existing }] = await db.select({ value: count() }).from(days);
  if (existing > 0 && !options.reset) return false;

  const data = plan as PlanJson;
  await db.transaction(async (tx) => {
    if (options.reset) {
      await tx.execute(sql`TRUNCATE questions, deliverables, days, weeks, phases RESTART IDENTITY CASCADE`);
    }
    await tx.insert(phases).values(data.phases);
    for (const w of data.weeks) {
      await tx.insert(weeks).values({
        id: w.id,
        number: w.number,
        phaseId: w.phaseId,
        title: w.title,
        rangeLabel: w.rangeLabel,
      });
      for (const d of w.days) {
        const full = d as (typeof w.days)[number] & {
          concept?: string;
          example?: string;
          language?: string;
          exampleOutput?: string;
          tasks?: string[];
          questions?: { prompt: string; code: string; options: string[]; correctIndex: number; explanation: string }[];
        };
        await tx.insert(days).values({
          date: d.date,
          weekId: w.id,
          kind: d.kind as "workshop" | "holiday" | "free",
          title: d.title,
          summary: d.summary,
          concept: full.concept ?? "",
          example: full.example ?? "",
          language: full.language ?? "python",
          exampleOutput: full.exampleOutput ?? "",
          tasks: full.tasks ?? [],
        });
        if (full.questions?.length) {
          await tx.insert(questions).values(full.questions.map((q, i) => ({ ...q, date: d.date, position: i })));
        }
      }
      await tx.insert(deliverables).values({ id: w.id, weekId: w.id, ...w.deliverable });
    }
  });
  return true;
}

export async function seedSettings(db: Database): Promise<void> {
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await db.insert(settings).values({ key, value }).onConflictDoNothing();
  }
}

/** Crea los usuarios iniciales solo si no existen. Nunca cambia la contraseña de un usuario existente. */
export async function seedUsers(db: Database, seed: Config["seed"]): Promise<string[]> {
  const created: string[] = [];
  const accounts = [
    { ...seed.admin, role: "admin" as const },
    { ...seed.student, role: "student" as const },
  ];
  for (const account of accounts) {
    const username = account.username.trim().toLowerCase();
    const [found] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(sql`lower(${users.username})`, username));
    if (found) continue;
    if (!account.password) {
      console.warn(`[seed] No se creó "${username}": falta la contraseña inicial en las variables de entorno.`);
      continue;
    }
    await db.insert(users).values({
      username,
      displayName: account.displayName,
      role: account.role,
      passwordHash: await hashPassword(account.password),
    });
    created.push(username);
  }
  return created;
}

export async function seedAll(db: Database, config: Config, options: { resetContent?: boolean } = {}) {
  const content = await seedContent(db, { reset: options.resetContent });
  await seedSettings(db);
  const createdUsers = await seedUsers(db, config.seed);
  return { content, createdUsers };
}
