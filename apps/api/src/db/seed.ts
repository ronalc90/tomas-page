import { count, eq, sql } from "drizzle-orm";
import type { AdminQuestion, DayContent } from "@tomas/shared";
import type { Config } from "../config";
import { hashPassword } from "../lib/password";
import type { Database } from "./client";
import { days, deliverables, phases, questions, settings, users, weeks } from "./schema";
import plan from "@tomas/shared/plan.json";

type PlanJson = typeof plan;
type PlanWeek = PlanJson["weeks"][number];
type PlanDayJson = Omit<PlanWeek["days"][number], "questions" | "steps" | "challenge"> & Partial<DayContent> & { questions?: AdminQuestion[] };

export const DEFAULT_SETTINGS = {
  passScore: 4,
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
        const full = d as unknown as PlanDayJson;
        await tx.insert(days).values({ date: d.date, weekId: w.id, ...dayColumns(full) });
        if (full.questions?.length) {
          await tx.insert(questions).values(full.questions.map((q, i) => questionRow(q, d.date, i)));
        }
      }
      await tx.insert(deliverables).values({ id: w.id, weekId: w.id, ...w.deliverable });
    }
  });
  return true;
}

function dayColumns(d: PlanDayJson) {
  return {
    kind: d.kind as "workshop" | "holiday" | "free",
    title: d.title,
    summary: d.summary,
    objectives: d.objectives ?? [],
    concept: d.concept ?? "",
    tip: d.tip ?? "",
    example: d.example ?? "",
    language: d.language ?? "python",
    exampleOutput: d.exampleOutput ?? "",
    steps: d.steps ?? [],
    commonErrors: d.commonErrors ?? [],
    tasks: d.tasks ?? [],
    taskHints: d.taskHints ?? [],
    challenge: d.challenge ?? null,
    glossary: d.glossary ?? [],
    resources: d.resources ?? [],
  };
}

function questionRow(q: AdminQuestion, date: string, position: number) {
  return {
    date,
    position,
    type: q.type ?? "choice",
    prompt: q.prompt,
    code: q.code ?? "",
    options: q.options ?? [],
    correctIndex: q.correctIndex ?? 0,
    accepted: q.accepted ?? [],
    optionFeedback: q.optionFeedback ?? [],
    explanation: q.explanation,
    hint: q.hint ?? "",
  };
}

/**
 * Bases creadas con la primera versión del contenido (solo concepto, tareas y 4 preguntas de opción
 * múltiple): se completan las lecciones (objetivos, guía paso a paso, errores comunes, pistas, reto,
 * glosario, recursos y guías de los entregables) y se reemplazan las evaluaciones por las de 6 preguntas
 * de varios tipos. Solo ocurre si ninguna pregunta es de un tipo nuevo, es decir, una sola vez; después
 * las ediciones del administrador mandan. La nota mínima pasa de 3 a 4 si nadie la había cambiado.
 */
export async function seedLessonsV2(db: Database): Promise<boolean> {
  const [{ value: newTypes }] = await db.select({ value: count() }).from(questions).where(sql`${questions.type} <> 'choice'`);
  if (newTypes > 0) return false;
  await db.transaction(async (tx) => {
    for (const w of (plan as PlanJson).weeks) {
      for (const d of w.days) {
        const full = d as unknown as PlanDayJson;
        const { kind: _kind, title: _title, summary: _summary, concept: _concept, tip: _tip, example: _example, language: _language, exampleOutput: _out, tasks: _tasks, ...lesson } = dayColumns(full);
        await tx.update(days).set(lesson).where(eq(days.date, d.date));
        await tx.delete(questions).where(eq(questions.date, d.date));
        if (full.questions?.length) {
          await tx.insert(questions).values(full.questions.map((q, i) => questionRow(q, d.date, i)));
        }
      }
      const { steps, tips, stretch, checklist } = w.deliverable;
      await tx.update(deliverables).set({ steps, tips, stretch, checklist }).where(eq(deliverables.id, w.id));
    }
    await tx.execute(sql`UPDATE settings SET value = '4'::jsonb WHERE key = 'passScore' AND value = '3'::jsonb`);
  });
  return true;
}

/**
 * Bases creadas antes de que existiera el consejo del día: si ningún taller tiene consejo,
 * se copian los del plan. Si el administrador ya escribió alguno, no se toca nada.
 */
export async function seedTips(db: Database): Promise<number> {
  const [{ value: withTip }] = await db.select({ value: count() }).from(days).where(sql`${days.tip} <> ''`);
  if (withTip > 0) return 0;
  let filled = 0;
  for (const w of (plan as PlanJson).weeks) {
    for (const d of w.days) {
      const tip = (d as { tip?: string }).tip;
      if (!tip) continue;
      const updated = await db.update(days).set({ tip }).where(eq(days.date, d.date)).returning({ date: days.date });
      filled += updated.length;
    }
  }
  return filled;
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
    ...(seed.test.password ? [{ ...seed.test, role: "student" as const }] : []),
  ];
  for (const account of accounts) {
    const username = account.username.trim().toLowerCase();
    const [found] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(sql`lower(${users.username})`, username));
    if (found) continue;
    if (!account.password) {
      if (account.username === seed.test.username) continue;
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
  if (!content) {
    await seedTips(db);
    await seedLessonsV2(db);
  }
  await seedSettings(db);
  const createdUsers = await seedUsers(db, config.seed);
  return { content, createdUsers };
}
