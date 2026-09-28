/**
 * Implementación en el navegador de la misma API que expone el servidor.
 * Se usa cuando la página se publica sin servidor (GitHub Pages): la interfaz
 * no cambia, solo cambia dónde viven los datos.
 */
import plan from "@tomas/shared/plan.json";
import {
  ADMIN_MIN_PASSWORD,
  addDays,
  adminDaySchema,
  adminDeliverableSchema,
  changePasswordSchema,
  computeProgress,
  correctAnswerOf,
  createUserSchema,
  feedbackFor,
  isCorrectAnswer,
  isValidAnswer,
  dayProgressSchema,
  deliverableTitle,
  formatDayMonth,
  isIsoDate,
  isWorkshopDone,
  loginSchema,
  mondayOf,
  quizAttemptSchema,
  resetPasswordSchema,
  reviewSchema,
  settingsSchema,
  submissionDraftSchema,
  todayIn,
  updateUserSchema,
  type ActivityItem,
  type AdminDay,
  type AdminOverview,
  type AdminQuestion,
  type Challenge,
  type CommonError,
  type ContentWeek,
  type GlossaryItem,
  type Resource,
  type TutorialStep,
  type DayKind,
  type DayResponse,
  type DeliverableKind,
  type DeliverableView,
  type Language,
  type MeResponse,
  type PlanResponse,
  type ProgressPlanInput,
  type ProgressUserInput,
  type ProgressView,
  type QuizResult,
  type ReviewDetail,
  type ReviewQueueItem,
  type SessionUser,
  type StudentDetail,
  type StudentRow,
  type UserRow,
} from "@tomas/shared";
import type { ZodType } from "zod";
import { ApiError } from "../lib/api";
import { hashPassword, loadDb, nextId, randomId, saveDb, SESSION_KEY, storage, TODAY_KEY, uuid, type LocalDb, type LocalUser } from "./store";

// ---------- Utilidades ----------

const fail = (status: number, code: string, message: string, fields: Record<string, string> = {}) =>
  new ApiError(status, code, message, fields);
const badRequest = (message: string, fields: Record<string, string> = {}) => fail(400, "bad_request", message, fields);
const notFound = (message = "No encontramos lo que buscas.") => fail(404, "not_found", message);
const conflict = (message: string) => fail(409, "conflict", message);

function parse<T>(schema: ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  const fields: Record<string, string> = {};
  for (const issue of result.error.issues) fields[issue.path.join(".") || "_"] ??= issue.message;
  throw badRequest(result.error.issues[0]?.message ?? "Datos inválidos.", fields);
}

const now = () => new Date().toISOString();
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

// ---------- Contenido ----------

type PlanJson = typeof plan;
interface FullDay {
  date: string;
  weekId: string;
  kind: DayKind;
  title: string;
  summary: string;
  objectives: string[];
  concept: string;
  tip: string;
  example: string;
  language: Language;
  exampleOutput: string;
  steps: TutorialStep[];
  commonErrors: CommonError[];
  tasks: string[];
  taskHints: string[];
  challenge: Challenge | null;
  glossary: GlossaryItem[];
  resources: Resource[];
  questions: AdminQuestion[];
  updatedAt: string | null;
}
interface FullDeliverable {
  id: string;
  weekId: string;
  dueDate: string;
  kind: DeliverableKind;
  path: string;
  description: string;
  criteria: string[];
  steps: string[];
  tips: string[];
  stretch: string;
  checklist: string[];
}

/** Preguntas guardadas por versiones anteriores (solo opción múltiple) reciben los campos nuevos. */
function normalizeQuestion(q: Partial<AdminQuestion>): AdminQuestion {
  return {
    type: q.type ?? "choice",
    prompt: q.prompt ?? "",
    code: q.code ?? "",
    options: q.options ?? [],
    correctIndex: q.correctIndex ?? 0,
    accepted: q.accepted ?? [],
    optionFeedback: q.optionFeedback ?? [],
    explanation: q.explanation ?? "",
    hint: q.hint ?? "",
  };
}

function content(db: LocalDb) {
  const data = plan as PlanJson;
  const days = new Map<string, FullDay>();
  const deliverables = new Map<string, FullDeliverable>();
  const weeks = data.weeks.map((w) => ({ id: w.id, number: w.number, phaseId: w.phaseId, title: w.title, rangeLabel: w.rangeLabel }));
  for (const w of data.weeks) {
    for (const d of w.days) {
      const base = d as (typeof w.days)[number] & Partial<FullDay>;
      const override = db.overrides.days[d.date];
      const baseDay: FullDay = {
        date: d.date,
        weekId: w.id,
        kind: d.kind as DayKind,
        title: base.title,
        summary: base.summary ?? "",
        objectives: base.objectives ?? [],
        concept: base.concept ?? "",
        tip: base.tip ?? "",
        example: base.example ?? "",
        language: (base.language ?? "python") as Language,
        exampleOutput: base.exampleOutput ?? "",
        steps: base.steps ?? [],
        commonErrors: base.commonErrors ?? [],
        tasks: base.tasks ?? [],
        taskHints: base.taskHints ?? [],
        challenge: base.challenge ?? null,
        glossary: base.glossary ?? [],
        resources: base.resources ?? [],
        questions: ((base.questions ?? []) as Partial<AdminQuestion>[]).map(normalizeQuestion),
        updatedAt: null,
      };
      if (override) {
        const merged: FullDay = { ...baseDay };
        for (const [k, v] of Object.entries(override)) if (v !== undefined) (merged as unknown as Record<string, unknown>)[k] = v;
        merged.questions = override.questions.map(normalizeQuestion);
        days.set(d.date, merged);
      } else {
        days.set(d.date, baseDay);
      }
    }
    const dv = w.deliverable as typeof w.deliverable & Partial<FullDeliverable>;
    const baseDeliverable: FullDeliverable = {
      id: w.id,
      weekId: w.id,
      dueDate: dv.dueDate,
      kind: dv.kind as DeliverableKind,
      path: dv.path,
      description: dv.description,
      criteria: dv.criteria,
      steps: dv.steps ?? [],
      tips: dv.tips ?? [],
      stretch: dv.stretch ?? "",
      checklist: dv.checklist ?? [],
    };
    const dOverride = db.overrides.deliverables[w.id];
    deliverables.set(w.id, dOverride ? { ...baseDeliverable, ...dOverride } : baseDeliverable);
  }
  const weekMap = new Map(weeks.map((w) => [w.id, w]));
  const byDate = new Map([...deliverables.values()].map((d) => [d.dueDate, d]));
  const dates = [...new Set([...days.keys(), ...byDate.keys()])].sort();
  const titleOf = (d: FullDeliverable) => deliverableTitle(d.kind, weekMap.get(d.weekId)?.number ?? 0);

  const progressInput: ProgressPlanInput = {
    phases: data.phases.map((p) => ({ id: p.id, name: p.name })),
    weeks: weeks.map((w) => ({ id: w.id, phaseId: w.phaseId })),
    days: [...days.values()].map((d) => ({
      date: d.date,
      weekId: d.weekId,
      kind: d.kind,
      title: d.title,
      taskCount: d.tasks.length,
      questionCount: d.questions.length,
    })),
    deliverables: [...deliverables.values()].map((d) => ({ id: d.id, weekId: d.weekId, dueDate: d.dueDate, title: titleOf(d) })),
  };

  const response: PlanResponse = {
    start: dates[0],
    end: dates[dates.length - 1],
    phases: data.phases,
    weeks: weeks.map((w) => {
      const d = deliverables.get(w.id)!;
      return {
        ...w,
        days: [...days.values()]
          .filter((x) => x.weekId === w.id)
          .map((x) => ({ date: x.date, kind: x.kind, title: x.title, taskCount: x.tasks.length })),
        deliverable: { id: d.id, weekId: d.weekId, dueDate: d.dueDate, kind: d.kind, path: d.path, title: titleOf(d) },
      };
    }),
  };

  return { data, days, deliverables, weeks: weekMap, byDate, dates, titleOf, progressInput, response };
}

// ---------- Sesión y usuarios ----------

function sessionUser(db: LocalDb): LocalUser | null {
  const id = storage.get(SESSION_KEY);
  const user = id ? db.users.find((u) => u.id === id && u.active) : null;
  return user ?? null;
}

const toSession = (u: LocalUser): SessionUser => ({ id: u.id, username: u.username, displayName: u.displayName, role: u.role });
const toRow = (u: LocalUser): UserRow => ({
  id: u.id,
  username: u.username,
  displayName: u.displayName,
  role: u.role,
  active: u.active,
  createdAt: u.createdAt,
  lastLoginAt: u.lastLoginAt,
});

function requireUser(db: LocalDb): LocalUser {
  const user = sessionUser(db);
  if (!user) throw fail(401, "unauthorized", "Inicia sesión para continuar.");
  return user;
}

function requireAdmin(db: LocalDb): LocalUser {
  const user = requireUser(db);
  if (user.role !== "admin") throw fail(403, "forbidden", "Esta sección es solo para administradores.");
  return user;
}

function log(db: LocalDb, userId: string, type: string, ref: string | null = null, detail: Record<string, unknown> = {}) {
  db.activity.push({ id: nextId(db), userId, type, ref, detail, createdAt: now() });
}

function today(db: LocalDb): string {
  const forced = storage.get(TODAY_KEY);
  return forced && isIsoDate(forced) ? forced : todayIn(db.settings.timeZone);
}

// ---------- Avance ----------

function quizStats(db: LocalDb, userId: string) {
  const stats: Record<string, { attempts: number; best: number; first: number; hints: number }> = {};
  for (const a of db.quizAttempts) {
    if (a.userId !== userId) continue;
    const s = (stats[a.date] ??= { attempts: 0, best: 0, first: a.score, hints: 0 });
    s.attempts += 1;
    s.best = Math.max(s.best, a.score);
    s.hints = a.hintsUsed?.length ?? 0;
  }
  return stats;
}

function progressInput(db: LocalDb, userId: string): ProgressUserInput {
  const days = db.dayProgress[userId] ?? {};
  const subs = db.submissions[userId] ?? {};
  return {
    days: Object.fromEntries(
      Object.entries(days).map(([d, r]) => [d, { tasks: r.tasks, completedAt: r.completedAt, hasEvidence: r.evidence.trim().length > 0 }]),
    ),
    quizzes: quizStats(db, userId),
    submissions: Object.fromEntries(
      Object.entries(subs).map(([id, s]) => [id, { status: s.status, touched: s.criteria.some(Boolean) || s.evidence.trim().length > 0 }]),
    ),
  };
}

function progressFor(db: LocalDb, userId: string): ProgressView {
  return computeProgress(content(db).progressInput, progressInput(db, userId), today(db), db.settings.passScore);
}

function refreshCompletion(db: LocalDb, userId: string, date: string) {
  const c = content(db);
  const day = c.days.get(date);
  if (!day || day.kind !== "workshop") return;
  const rec = db.dayProgress[userId]?.[date];
  const best = quizStats(db, userId)[date]?.best;
  const done = isWorkshopDone(day.tasks.length, rec?.tasks, best, day.questions.length, db.settings.passScore);
  const record = ((db.dayProgress[userId] ??= {})[date] ??= { tasks: [], evidence: "", completedAt: null, updatedAt: now() });
  if (done && !record.completedAt) {
    record.completedAt = now();
    log(db, userId, "workshop_completed", date, { title: day.title });
  } else if (!done && record.completedAt) {
    record.completedAt = null;
  }
}

function deliverableViews(db: LocalDb, userId: string, onlyId?: string): DeliverableView[] {
  const c = content(db);
  const progress = progressFor(db, userId);
  return [...c.deliverables.values()]
    .filter((d) => !onlyId || d.id === onlyId)
    .map((d) => {
      const week = c.weeks.get(d.weekId)!;
      const sub = db.submissions[userId]?.[d.id];
      const reviewer = sub?.reviewerId ? db.users.find((u) => u.id === sub.reviewerId) : null;
      return {
        id: d.id,
        weekId: d.weekId,
        weekNumber: week.number,
        weekTitle: week.title,
        phaseId: week.phaseId,
        dueDate: d.dueDate,
        kind: d.kind,
        title: c.titleOf(d),
        path: d.path,
        description: d.description,
        criteria: d.criteria,
        steps: d.steps,
        tips: d.tips,
        stretch: d.stretch,
        checklist: d.checklist,
        state: progress.deliverables[d.id] ?? { status: "pending", submission: null },
        submission: sub
          ? {
              status: sub.status,
              criteria: sub.criteria,
              evidence: sub.evidence,
              submittedAt: sub.submittedAt,
              reviewedAt: sub.reviewedAt,
              feedback: sub.feedback,
              reviewerName: reviewer?.displayName ?? null,
            }
          : null,
      };
    })
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

function quizResult(db: LocalDb, userId: string, attempt: LocalDb["quizAttempts"][number]): QuizResult {
  const day = content(db).days.get(attempt.date)!;
  const stats = quizStats(db, userId)[attempt.date];
  return {
    score: attempt.score,
    total: attempt.total,
    passed: attempt.score >= Math.min(db.settings.passScore, attempt.total),
    best: stats?.best ?? attempt.score,
    attempts: stats?.attempts ?? 1,
    createdAt: attempt.createdAt,
    hintsUsed: attempt.hintsUsed ?? [],
    review: day.questions.map((q, i) => {
      const chosen = attempt.answers[i] ?? -1;
      return { position: i, chosen, correct: correctAnswerOf(q), isCorrect: isCorrectAnswer(q, chosen), explanation: q.explanation, feedback: feedbackFor(q, chosen) };
    }),
  };
}

function activityItems(db: LocalDb, userId?: string, limit = 30): ActivityItem[] {
  const names = new Map(db.users.map((u) => [u.id, u.displayName]));
  return db.activity
    .filter((a) => !userId || a.userId === userId)
    .slice(-limit)
    .reverse()
    .map((a) => ({ ...a, userName: names.get(a.userId) ?? "Alguien" }));
}

function studentRow(db: LocalDb, u: LocalUser): StudentRow {
  const p = progressFor(db, u.id);
  const last = db.activity.filter((a) => a.userId === u.id && a.type !== "login").at(-1);
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    active: u.active,
    lastLoginAt: u.lastLoginAt,
    lastActivityAt: last?.createdAt ?? null,
    totals: p.totals,
    pace: p.pace,
  };
}

// ---------- Rutas ----------

type Handler = (ctx: { db: LocalDb; params: Record<string, string>; query: URLSearchParams; body: unknown }) => Promise<unknown> | unknown;
const routes: { method: string; pattern: RegExp; keys: string[]; handler: Handler; writes: boolean }[] = [];

function route(method: string, path: string, handler: Handler, writes = method !== "GET") {
  const keys: string[] = [];
  const pattern = new RegExp(`^${path.replace(/:(\w+)/g, (_, k) => (keys.push(k), "([^/]+)"))}$`);
  routes.push({ method, pattern, keys, handler, writes });
}

// Autenticación
route("GET", "/api/health", ({ db }) => ({ status: "ok", database: "navegador", version: import.meta.env.VITE_APP_VERSION ?? "local", users: db.users.length }), false);

route("POST", "/api/auth/login", async ({ db, body }) => {
  const input = parse(loginSchema, body);
  const user = db.users.find((u) => u.username.toLowerCase() === input.username);
  const hash = await hashPassword(input.password, user?.salt ?? "relleno");
  if (!user || hash !== user.passwordHash || !user.active) throw fail(401, "unauthorized", "Usuario o contraseña incorrectos.");
  storage.set(SESSION_KEY, user.id);
  user.lastLoginAt = now();
  log(db, user.id, "login");
  return { user: toSession(user) };
});

route("POST", "/api/auth/logout", () => {
  storage.remove(SESSION_KEY);
  return { ok: true };
}, false);

route("GET", "/api/auth/me", ({ db }): MeResponse | null => {
  const user = sessionUser(db);
  if (!user) return null;
  return { user: toSession(user), today: today(db), settings: { ...db.settings } };
});

route("POST", "/api/auth/password", async ({ db, body }) => {
  const user = requireUser(db);
  const input = parse(changePasswordSchema, body);
  if ((await hashPassword(input.currentPassword, user.salt)) !== user.passwordHash) {
    throw badRequest("La contraseña actual no es correcta.", { currentPassword: "No es correcta" });
  }
  if (user.role === "admin" && input.newPassword.length < ADMIN_MIN_PASSWORD) {
    throw badRequest(`Para administradores usa al menos ${ADMIN_MIN_PASSWORD} caracteres.`, { newPassword: `Usa al menos ${ADMIN_MIN_PASSWORD} caracteres` });
  }
  user.salt = randomId(12);
  user.passwordHash = await hashPassword(input.newPassword, user.salt);
  log(db, user.id, "password_changed");
  return { ok: true };
});

// Estudiante
route("GET", "/api/plan", ({ db }) => (requireUser(db), content(db).response));
route("GET", "/api/progress", ({ db }) => progressFor(db, requireUser(db).id));

route("GET", "/api/days/:date", ({ db, params }): DayResponse => {
  const user = requireUser(db);
  const date = params.date;
  const c = content(db);
  const day = isIsoDate(date) ? c.days.get(date) : undefined;
  const due = isIsoDate(date) ? c.byDate.get(date) : undefined;
  if (!day && !due) throw notFound("Ese día no tiene actividades en el plan.");
  const week = c.weeks.get(day?.weekId ?? due!.weekId)!;
  const phase = c.data.phases.find((p) => p.id === week.phaseId)!;
  const progress = progressFor(db, user.id);
  const rec = db.dayProgress[user.id]?.[date];
  const last = db.quizAttempts.filter((a) => a.userId === user.id && a.date === date).at(-1);
  const pos = c.dates.indexOf(date);
  const state = progress.days[date] ?? { status: "rest", tasksDone: 0, tasksTotal: 0, attempts: 0, best: 0, total: 0, completedAt: null };
  return {
    date,
    day: day
      ? {
          date,
          weekId: week.id,
          weekNumber: week.number,
          weekTitle: week.title,
          phaseId: phase.id,
          phaseName: phase.name,
          kind: day.kind,
          title: day.title,
          summary: day.summary,
          objectives: day.objectives,
          concept: day.concept,
          tip: day.tip,
          example: day.example,
          language: day.language,
          exampleOutput: day.exampleOutput,
          steps: day.steps,
          commonErrors: day.commonErrors,
          tasks: day.tasks,
          taskHints: day.taskHints,
          challenge: day.challenge,
          glossary: day.glossary,
          resources: day.resources,
        }
      : null,
    questions: day ? day.questions.map((q, i) => ({ position: i, type: q.type, prompt: q.prompt, code: q.code, options: q.options, hint: q.hint })) : [],
    progress: {
      tasks: day ? day.tasks.map((_, i) => rec?.tasks[i] ?? false) : [],
      evidence: rec?.evidence ?? "",
      challengeDone: rec?.challengeDone ?? false,
      completedAt: rec?.completedAt ?? null,
    },
    quiz: { attempts: state.attempts, best: state.best, last: last ? quizResult(db, user.id, last) : null },
    state,
    deliverable: due ? deliverableViews(db, user.id, due.id)[0] ?? null : null,
    nav: { prev: pos > 0 ? c.dates[pos - 1] : null, next: pos >= 0 && pos < c.dates.length - 1 ? c.dates[pos + 1] : null },
  };
}, false);

route("PUT", "/api/days/:date/progress", ({ db, params, body }) => {
  const user = requireUser(db);
  const input = parse(dayProgressSchema, body);
  const day = content(db).days.get(params.date);
  if (!day || day.kind !== "workshop") throw notFound("Ese día no tiene taller.");
  if (input.tasks && input.tasks.length !== day.tasks.length) throw badRequest(`El taller tiene ${day.tasks.length} tareas.`);
  const record = ((db.dayProgress[user.id] ??= {})[params.date] ??= { tasks: [], evidence: "", completedAt: null, updatedAt: now() });
  if (input.tasks) record.tasks = input.tasks;
  if (input.evidence !== undefined) record.evidence = input.evidence;
  if (input.challengeDone !== undefined) {
    record.challengeDone = input.challengeDone;
    if (input.challengeDone) log(db, user.id, "challenge_done", params.date, {});
  }
  record.updatedAt = now();
  refreshCompletion(db, user.id, params.date);
  const progress = progressFor(db, user.id);
  return { state: progress.days[params.date], totals: progress.totals };
});

route("POST", "/api/days/:date/quiz", ({ db, params, body }) => {
  const user = requireUser(db);
  const input = parse(quizAttemptSchema, body);
  const day = content(db).days.get(params.date);
  if (!day || day.questions.length === 0) throw notFound("Ese día no tiene evaluación.");
  if (input.answers.length !== day.questions.length) throw badRequest(`Responde las ${day.questions.length} preguntas.`);
  input.answers.forEach((a, i) => {
    if (!isValidAnswer(day.questions[i], a)) throw badRequest(`La respuesta de la pregunta ${i + 1} no es válida.`);
  });
  const score = day.questions.filter((q, i) => isCorrectAnswer(q, input.answers[i])).length;
  const hintsUsed = [...new Set(input.hints.filter((h) => h < day.questions.length))].sort((a, b) => a - b);
  const attempt = { id: nextId(db), userId: user.id, date: params.date, answers: input.answers, hintsUsed, score, total: day.questions.length, createdAt: now() };
  db.quizAttempts.push(attempt);
  log(db, user.id, "quiz_attempt", params.date, { score, total: attempt.total, hints: hintsUsed.length });
  refreshCompletion(db, user.id, params.date);
  return quizResult(db, user.id, attempt);
});

route("GET", "/api/deliverables", ({ db }) => deliverableViews(db, requireUser(db).id));

function loadDeliverable(db: LocalDb, userId: string, id: string) {
  const view = deliverableViews(db, userId, id)[0];
  if (!view) throw notFound("Ese entregable no existe.");
  return view;
}

route("PUT", "/api/deliverables/:id", ({ db, params, body }) => {
  const user = requireUser(db);
  const input = parse(submissionDraftSchema, body);
  const view = loadDeliverable(db, user.id, params.id);
  const sub = (db.submissions[user.id] ??= {})[view.id];
  if (sub && (sub.status === "submitted" || sub.status === "approved")) {
    throw conflict("Este entregable ya fue enviado. Retíralo si necesitas cambiarlo.");
  }
  if (input.criteria && input.criteria.length !== view.criteria.length) throw badRequest(`El entregable tiene ${view.criteria.length} criterios.`);
  const record = (db.submissions[user.id][view.id] ??= {
    criteria: view.criteria.map(() => false),
    evidence: "",
    status: "draft",
    submittedAt: null,
    reviewedAt: null,
    reviewerId: null,
    feedback: "",
    updatedAt: now(),
  });
  if (input.criteria) record.criteria = input.criteria;
  if (input.evidence !== undefined) record.evidence = input.evidence;
  record.updatedAt = now();
  return loadDeliverable(db, user.id, view.id);
});

route("POST", "/api/deliverables/:id/submit", ({ db, params }) => {
  const user = requireUser(db);
  const view = loadDeliverable(db, user.id, params.id);
  const sub = db.submissions[user.id]?.[view.id];
  if (sub?.status === "submitted" || sub?.status === "approved") throw conflict("Este entregable ya fue enviado.");
  if (!sub || sub.criteria.filter(Boolean).length < view.criteria.length) throw badRequest("Marca todos los criterios antes de enviar.", { criteria: "Faltan criterios" });
  if (!sub.evidence.trim()) throw badRequest("Agrega tu evidencia antes de enviar.", { evidence: "Falta la evidencia" });
  sub.status = "submitted";
  sub.submittedAt = now();
  sub.updatedAt = now();
  log(db, user.id, "submission_submitted", view.id, { title: view.title });
  return loadDeliverable(db, user.id, view.id);
});

route("POST", "/api/deliverables/:id/withdraw", ({ db, params }) => {
  const user = requireUser(db);
  const view = loadDeliverable(db, user.id, params.id);
  const sub = db.submissions[user.id]?.[view.id];
  if (sub?.status !== "submitted") {
    throw conflict(sub?.status === "approved" ? "Este entregable ya fue aprobado y no se puede retirar." : "Este entregable no está enviado.");
  }
  sub.status = "draft";
  sub.submittedAt = null;
  sub.updatedAt = now();
  log(db, user.id, "submission_withdrawn", view.id, { title: view.title });
  return loadDeliverable(db, user.id, view.id);
});

// Administración
const students = (db: LocalDb) =>
  db.users.filter((u) => u.role === "student").sort((a, b) => a.displayName.localeCompare(b.displayName));

route("GET", "/api/admin/overview", ({ db }): AdminOverview => {
  requireAdmin(db);
  const c = content(db);
  const t = today(db);
  const localDay = (iso: string) => todayIn(db.settings.timeZone, new Date(iso));
  const buckets = new Map<string, { workshops: number; quizzes: number }>();
  const lastMonday = mondayOf(t < c.response.end ? t : c.response.end);
  for (let m = mondayOf(c.response.start); m <= lastMonday; m = addDays(m, 7)) buckets.set(m, { workshops: 0, quizzes: 0 });
  for (const days of Object.values(db.dayProgress)) {
    for (const r of Object.values(days)) {
      const b = r.completedAt ? buckets.get(mondayOf(localDay(r.completedAt))) : undefined;
      if (b) b.workshops += 1;
    }
  }
  for (const a of db.quizAttempts) {
    const b = buckets.get(mondayOf(localDay(a.createdAt)));
    if (b) b.quizzes += 1;
  }
  const pending = Object.values(db.submissions).reduce((n, subs) => n + Object.values(subs).filter((s) => s.status === "submitted").length, 0);
  return {
    today: t,
    students: students(db).map((u) => studentRow(db, u)),
    pendingReviews: pending,
    activity: activityItems(db, undefined, 25),
    weeklyActivity: [...buckets.entries()].slice(-10).map(([week, v]) => ({ week, label: formatDayMonth(week), ...v })),
  };
}, false);

route("GET", "/api/admin/students", ({ db }) => (requireAdmin(db), students(db).map((u) => studentRow(db, u))), false);

route("GET", "/api/admin/students/:id", ({ db, params }): StudentDetail => {
  requireAdmin(db);
  const u = db.users.find((x) => x.id === params.id);
  if (!u) throw notFound("Ese estudiante no existe.");
  const c = content(db);
  const progress = progressFor(db, u.id);
  const stats = quizStats(db, u.id);
  return {
    student: studentRow(db, u),
    progress,
    days: [...c.days.values()]
      .filter((d) => d.kind === "workshop")
      .map((d) => ({
        date: d.date,
        title: d.title,
        weekNumber: c.weeks.get(d.weekId)?.number ?? 0,
        kind: d.kind,
        state: progress.days[d.date],
        firstScore: stats[d.date]?.first ?? null,
        evidence: db.dayProgress[u.id]?.[d.date]?.evidence ?? "",
        challengeDone: db.dayProgress[u.id]?.[d.date]?.challengeDone ?? false,
        hintsUsed: stats[d.date]?.hints ?? 0,
      })),
    deliverables: deliverableViews(db, u.id),
    activity: activityItems(db, u.id, 40),
  };
}, false);

route("GET", "/api/admin/reviews", ({ db, query }): ReviewQueueItem[] => {
  requireAdmin(db);
  const status = query.get("status") ?? "submitted";
  const allowed = status === "all" ? ["submitted", "approved", "changes_requested"] : [status];
  const c = content(db);
  const items: ReviewQueueItem[] = [];
  for (const [userId, subs] of Object.entries(db.submissions)) {
    const u = db.users.find((x) => x.id === userId);
    for (const [id, s] of Object.entries(subs)) {
      if (!allowed.includes(s.status)) continue;
      const d = c.deliverables.get(id)!;
      items.push({
        userId,
        userName: u?.displayName ?? "Alguien",
        deliverableId: id,
        weekNumber: c.weeks.get(d.weekId)?.number ?? 0,
        title: c.titleOf(d),
        dueDate: d.dueDate,
        status: s.status,
        submittedAt: s.submittedAt,
        reviewedAt: s.reviewedAt,
      });
    }
  }
  return items.sort((a, b) => (b.reviewedAt ?? b.submittedAt ?? "").localeCompare(a.reviewedAt ?? a.submittedAt ?? ""));
}, false);

route("GET", "/api/admin/reviews/:userId/:deliverableId", ({ db, params }): ReviewDetail => {
  requireAdmin(db);
  const u = db.users.find((x) => x.id === params.userId);
  if (!u) throw notFound("Ese estudiante no existe.");
  return { userId: u.id, userName: u.displayName, deliverable: loadDeliverable(db, u.id, params.deliverableId) };
}, false);

route("POST", "/api/admin/reviews/:userId/:deliverableId", ({ db, params, body }) => {
  const admin = requireAdmin(db);
  const input = parse(reviewSchema, body);
  const sub = db.submissions[params.userId]?.[params.deliverableId];
  if (!sub) throw notFound("No hay entrega para revisar.");
  if (sub.status === "draft") throw conflict("El estudiante todavía no ha enviado este entregable.");
  if (input.decision === "changes_requested" && !input.feedback) {
    throw badRequest("Cuando pides cambios, escribe qué debe corregir.", { feedback: "Escribe qué cambiar" });
  }
  Object.assign(sub, { status: input.decision, feedback: input.feedback, reviewedAt: now(), reviewerId: admin.id, updatedAt: now() });
  log(db, admin.id, "submission_reviewed", params.deliverableId, { decision: input.decision, studentId: params.userId });
  return loadDeliverable(db, params.userId, params.deliverableId);
});

route("GET", "/api/admin/content", ({ db }): ContentWeek[] => {
  requireAdmin(db);
  const c = content(db);
  return c.response.weeks.map((w) => ({
    id: w.id,
    number: w.number,
    phaseId: w.phaseId,
    title: w.title,
    rangeLabel: w.rangeLabel,
    days: w.days.map((d) => ({
      date: d.date,
      kind: d.kind,
      title: d.title,
      questionCount: c.days.get(d.date)?.questions.length ?? 0,
      updatedAt: c.days.get(d.date)?.updatedAt ?? null,
    })),
    deliverable: clone(c.deliverables.get(w.id)!),
  }));
}, false);

route("GET", "/api/admin/days/:date", ({ db, params }): AdminDay => {
  requireAdmin(db);
  const c = content(db);
  const d = c.days.get(params.date);
  if (!d) throw notFound("Ese día no existe.");
  const week = c.weeks.get(d.weekId)!;
  return {
    date: d.date,
    weekId: week.id,
    weekNumber: week.number,
    weekTitle: week.title,
    phaseId: week.phaseId,
    phaseName: c.data.phases.find((p) => p.id === week.phaseId)?.name ?? "",
    kind: d.kind,
    title: d.title,
    summary: d.summary,
    objectives: [...d.objectives],
    concept: d.concept,
    tip: d.tip,
    example: d.example,
    language: d.language,
    exampleOutput: d.exampleOutput,
    steps: clone(d.steps),
    commonErrors: clone(d.commonErrors),
    tasks: [...d.tasks],
    taskHints: [...d.taskHints],
    challenge: d.challenge ? { ...d.challenge } : null,
    glossary: clone(d.glossary),
    resources: clone(d.resources),
    questions: clone(d.questions),
    updatedAt: d.updatedAt,
  };
}, false);

route("PUT", "/api/admin/days/:date", ({ db, params, body }) => {
  requireAdmin(db);
  const input = parse(adminDaySchema, body);
  const d = content(db).days.get(params.date);
  if (!d) throw notFound("Ese día no existe.");
  if (d.kind === "workshop" && input.tasks.length === 0) throw badRequest("Un taller necesita al menos una tarea.");
  db.overrides.days[params.date] = { ...input, updatedAt: now() };
  return { ok: true };
});

route("PUT", "/api/admin/deliverables/:id", ({ db, params, body }) => {
  requireAdmin(db);
  const input = parse(adminDeliverableSchema, body);
  if (!content(db).deliverables.has(params.id)) throw notFound("Ese entregable no existe.");
  db.overrides.deliverables[params.id] = input;
  return { ok: true };
});

route("GET", "/api/admin/users", ({ db }) => {
  requireAdmin(db);
  return [...db.users].sort((a, b) => a.role.localeCompare(b.role) || a.displayName.localeCompare(b.displayName)).map(toRow);
}, false);

route("POST", "/api/admin/users", async ({ db, body }) => {
  requireAdmin(db);
  const input = parse(createUserSchema, body);
  if (db.users.some((u) => u.username.toLowerCase() === input.username)) throw conflict("Ya existe un usuario con ese nombre.");
  const salt = randomId(12);
  const user: LocalUser = {
    id: uuid(),
    username: input.username,
    displayName: input.displayName,
    role: input.role,
    passwordHash: await hashPassword(input.password, salt),
    salt,
    active: true,
    createdAt: now(),
    lastLoginAt: null,
  };
  db.users.push(user);
  return toRow(user);
});

route("PATCH", "/api/admin/users/:id", ({ db, params, body }) => {
  const admin = requireAdmin(db);
  const input = parse(updateUserSchema, body);
  const target = db.users.find((u) => u.id === params.id);
  if (!target) throw notFound("Ese usuario no existe.");
  if (target.id === admin.id && (input.active === false || input.role === "student")) {
    throw conflict("No puedes desactivar tu propia cuenta ni quitarte el rol de administrador.");
  }
  const activeAdmins = db.users.filter((u) => u.role === "admin" && u.active).length;
  if (target.role === "admin" && target.active && (input.active === false || input.role === "student") && activeAdmins <= 1) {
    throw conflict("Debe quedar al menos un administrador activo.");
  }
  Object.assign(target, input);
  return toRow(target);
});

route("POST", "/api/admin/users/:id/password", async ({ db, params, body }) => {
  requireAdmin(db);
  const input = parse(resetPasswordSchema, body);
  const target = db.users.find((u) => u.id === params.id);
  if (!target) throw notFound("Ese usuario no existe.");
  if (target.role === "admin" && input.password.length < ADMIN_MIN_PASSWORD) {
    throw badRequest(`Para administradores usa al menos ${ADMIN_MIN_PASSWORD} caracteres.`, { password: `Usa al menos ${ADMIN_MIN_PASSWORD} caracteres` });
  }
  target.salt = randomId(12);
  target.passwordHash = await hashPassword(input.password, target.salt);
  return { ok: true };
});

route("GET", "/api/admin/settings", ({ db }) => (requireAdmin(db), { ...db.settings }), false);

route("PUT", "/api/admin/settings", ({ db, body }) => {
  requireAdmin(db);
  const input = parse(settingsSchema, body);
  Object.assign(db.settings, input);
  return { ...db.settings };
});

// ---------- Punto de entrada ----------

/** Atiende una petición de la interfaz como lo haría el servidor. */
export async function handleLocal<T>(method: string, url: string, body?: unknown): Promise<T> {
  const [path, search = ""] = url.split("?");
  const db = await loadDb();
  for (const r of routes) {
    if (r.method !== method) continue;
    const match = r.pattern.exec(path);
    if (!match) continue;
    const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(match[i + 1])]));
    const result = await r.handler({ db, params, query: new URLSearchParams(search), body: body === undefined ? undefined : clone(body) });
    if (r.writes) saveDb(db);
    else if (method === "POST" && path === "/api/auth/logout") saveDb(db);
    return clone(result) as T;
  }
  throw notFound(`No existe la ruta ${method} ${path}.`);
}
