import { readFileSync } from "node:fs";
import { count, eq, notInArray, sql } from "drizzle-orm";
import { normalizeExercise, type AdminQuestion, type PlanFile, type PlanFileDay, type PlanFileDeliverable } from "@tomas/shared";
import type { Config } from "../config";
import { hashPassword } from "../lib/password";
import type { Database } from "./client";
import { days, deliverables, phases, questions, settings, users, weeks } from "./schema";
import bundledPlan from "@tomas/shared/plan.json";

export const DEFAULT_SETTINGS = {
  passScore: 5,
  timeZone: "America/Costa_Rica",
  programName: "Plan de Tomás Sandí · SQL y Python",
};

/** Nombres por defecto de versiones anteriores: se actualizan al nuevo si nadie los cambió. */
const OLD_PROGRAM_NAMES = ["Plan de Tomás · Python y SQL"];

/** Versión del contenido empaquetado. Sube cuando cambia la estructura del plan (no por ediciones del admin). */
export const CONTENT_VERSION = 4;

/** El plan a cargar: el archivo de PLAN_FILE (por ejemplo, el plan de prueba) o el plan.json del paquete compartido. */
export function loadPlan(file?: string): PlanFile {
  if (file) return JSON.parse(readFileSync(file, "utf8")) as PlanFile;
  return bundledPlan as unknown as PlanFile;
}

/** Carga el contenido del plan. Si ya hay contenido y no se pide reset, no toca nada (respeta las ediciones del admin). */
export async function seedContent(db: Database, options: { reset?: boolean; plan?: PlanFile } = {}): Promise<boolean> {
  const [{ value: existing }] = await db.select({ value: count() }).from(days);
  if (existing > 0 && !options.reset) return false;

  const data = options.plan ?? loadPlan();
  await db.transaction(async (tx) => {
    if (options.reset) {
      await tx.execute(sql`TRUNCATE questions, deliverables, days, weeks, phases RESTART IDENTITY CASCADE`);
    }
    await tx.insert(phases).values(data.phases);
    for (const w of data.weeks) {
      await tx.insert(weeks).values({ id: w.id, number: w.number, phaseId: w.phaseId, title: w.title, rangeLabel: w.rangeLabel });
      for (const d of w.days) {
        await tx.insert(days).values({ date: d.date, weekId: w.id, ...dayColumns(d) });
        if (d.questions?.length) {
          await tx.insert(questions).values(d.questions.map((q, i) => questionRow(q, d.date, i)));
        }
      }
      if (w.deliverable) await tx.insert(deliverables).values({ id: w.id, weekId: w.id, ...deliverableColumns(w.deliverable) });
    }
    await tx.insert(settings).values({ key: "contentVersion", value: CONTENT_VERSION }).onConflictDoUpdate({ target: settings.key, set: { value: CONTENT_VERSION } });
  });
  return true;
}

/**
 * Bases con contenido de una versión anterior del plan: se reemplaza todo el contenido (fases, semanas,
 * días, entregables, preguntas y ejercicios) por el actual SIN borrar el avance de los estudiantes en
 * las fechas y entregables que siguen existiendo. Las filas de avance quedan ligadas a la fecha, así que
 * lo hecho en una fecha se conserva aunque el taller cambie. Lo que ya no está en el plan se borra.
 * Las ediciones del administrador sobre el contenido viejo no se conservan (ya no aplican).
 * La nota mínima pasa a 5 si todavía tenía el valor por defecto de una versión anterior (3 o 4), y el
 * nombre del programa y del estudiante pasan a los nuevos si seguían con los de antes.
 */
export async function syncContentVersion(db: Database, data: PlanFile = loadPlan(), seed?: Config["seed"]): Promise<boolean> {
  const [row] = await db.select({ value: settings.value }).from(settings).where(eq(settings.key, "contentVersion"));
  const current = typeof row?.value === "number" ? row.value : 0;
  if (current >= CONTENT_VERSION) return false;
  await db.transaction(async (tx) => {
    for (const p of data.phases) {
      await tx.insert(phases).values(p).onConflictDoUpdate({ target: phases.id, set: { name: p.name, rangeLabel: p.rangeLabel, goal: p.goal } });
    }
    const keepDates = new Set<string>();
    for (const w of data.weeks) {
      const weekRow = { id: w.id, number: w.number, phaseId: w.phaseId, title: w.title, rangeLabel: w.rangeLabel };
      await tx.insert(weeks).values(weekRow).onConflictDoUpdate({ target: weeks.id, set: weekRow });
      for (const d of w.days) {
        keepDates.add(d.date);
        const cols = dayColumns(d);
        await tx
          .insert(days)
          .values({ date: d.date, weekId: w.id, ...cols })
          .onConflictDoUpdate({ target: days.date, set: { weekId: w.id, ...cols, updatedAt: sql`now()` } });
        await tx.delete(questions).where(eq(questions.date, d.date));
        if (d.questions?.length) {
          await tx.insert(questions).values(d.questions.map((q, i) => questionRow(q, d.date, i)));
        }
      }
      if (w.deliverable) {
        const dcols = deliverableColumns(w.deliverable);
        await tx
          .insert(deliverables)
          .values({ id: w.id, weekId: w.id, ...dcols })
          .onConflictDoUpdate({ target: deliverables.id, set: dcols });
      }
    }
    const existing = await tx.select({ date: days.date }).from(days);
    for (const { date } of existing) {
      if (!keepDates.has(date)) await tx.delete(days).where(eq(days.date, date));
    }
    // Entregables, semanas y fases que ya no están en el plan (sus entregas se borran en cascada).
    const weekIds = data.weeks.map((w) => w.id);
    const deliverableIds = data.weeks.filter((w) => w.deliverable).map((w) => w.id);
    await tx.delete(deliverables).where(deliverableIds.length ? notInArray(deliverables.id, deliverableIds) : undefined);
    await tx.delete(weeks).where(weekIds.length ? notInArray(weeks.id, weekIds) : undefined);
    const phaseIds = data.phases.map((p) => p.id);
    await tx.delete(phases).where(phaseIds.length ? notInArray(phases.id, phaseIds) : undefined);
    await tx.execute(sql`UPDATE settings SET value = '5'::jsonb WHERE key = 'passScore' AND value IN ('3'::jsonb, '4'::jsonb)`);
    for (const old of OLD_PROGRAM_NAMES) {
      await tx
        .update(settings)
        .set({ value: DEFAULT_SETTINGS.programName })
        .where(sql`${settings.key} = 'programName' AND ${settings.value} = ${JSON.stringify(old)}::jsonb`);
    }
    if (seed) {
      // El estudiante inicial pasa a llamarse con su nombre completo si conserva el nombre corto de antes.
      await tx
        .update(users)
        .set({ displayName: seed.student.displayName })
        .where(sql`lower(${users.username}) = ${seed.student.username.toLowerCase()} AND ${users.displayName} = 'Tomás'`);
    }
    await tx.execute(sql`UPDATE settings SET value = '"America/Costa_Rica"'::jsonb WHERE key = 'timeZone' AND value = '"America/Bogota"'::jsonb`);
    await tx.insert(settings).values({ key: "contentVersion", value: CONTENT_VERSION }).onConflictDoUpdate({ target: settings.key, set: { value: CONTENT_VERSION } });
  });
  return true;
}

function dayColumns(d: PlanFileDay) {
  return {
    kind: d.kind as "workshop" | "holiday" | "free",
    title: d.title,
    summary: d.summary,
    objectives: d.objectives ?? [],
    schedule: d.schedule ?? [],
    topics: d.topics ?? [],
    tasks: d.tasks ?? [],
    taskHints: d.taskHints ?? [],
    challenge: d.challenge ?? null,
    glossary: d.glossary ?? [],
    resources: d.resources ?? [],
    exercises: (d.exercises ?? []).map(normalizeExercise),
  };
}

function deliverableColumns(d: PlanFileDeliverable) {
  return {
    dueDate: d.dueDate,
    kind: d.kind,
    path: d.path,
    description: d.description,
    criteria: d.criteria,
    steps: d.steps ?? [],
    tips: d.tips ?? [],
    stretch: d.stretch ?? "",
    checklist: d.checklist ?? [],
    exercises: (d.exercises ?? []).map(normalizeExercise),
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
  const plan = loadPlan(config.planFile);
  const content = await seedContent(db, { reset: options.resetContent, plan });
  if (!content) await syncContentVersion(db, plan, config.seed);
  await seedSettings(db);
  const createdUsers = await seedUsers(db, config.seed);
  return { content, createdUsers };
}
