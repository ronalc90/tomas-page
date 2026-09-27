import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import {
  dayProgressSchema,
  isIsoDate,
  quizAttemptSchema,
  submissionDraftSchema,
  type DayResponse,
  type Language,
  type QuizResult,
} from "@tomas/shared";
import type { AppContext } from "../context";
import { dayProgress, days, questions, quizAttempts, submissions } from "../db/schema";
import { badRequest, conflict, notFound, parse } from "../lib/errors";
import { requireUser } from "../plugins/auth";
import { logActivity } from "../services/activity";
import { deliverableViews, progressFor, quizStatsByDate, refreshWorkshopCompletion } from "../services/progress";

function assertDate(value: string): string {
  if (!isIsoDate(value)) throw notFound("Esa fecha no existe en el plan.");
  return value;
}

async function buildQuizResult(
  ctx: AppContext,
  userId: string,
  date: string,
  attempt: { answers: number[]; score: number; total: number; createdAt: string },
): Promise<QuizResult> {
  const qs = await ctx.db.select().from(questions).where(eq(questions.date, date)).orderBy(asc(questions.position));
  const stats = (await quizStatsByDate(ctx, userId))[date];
  const { passScore } = await ctx.settings.get();
  return {
    score: attempt.score,
    total: attempt.total,
    passed: attempt.score >= Math.min(passScore, attempt.total),
    best: stats?.best ?? attempt.score,
    attempts: stats?.attempts ?? 1,
    createdAt: attempt.createdAt,
    review: qs.map((q, i) => ({
      position: q.position,
      chosen: attempt.answers[i] ?? -1,
      correct: q.correctIndex,
      isCorrect: attempt.answers[i] === q.correctIndex,
      explanation: q.explanation,
    })),
  };
}

export async function studentRoutes(app: FastifyInstance, ctx: AppContext) {
  app.get("/api/plan", async (request) => {
    requireUser(request);
    return (await ctx.plan.get()).response;
  });

  app.get("/api/progress", async (request) => {
    const user = requireUser(request);
    return progressFor(ctx, user.id);
  });

  app.get<{ Params: { date: string } }>("/api/days/:date", async (request): Promise<DayResponse> => {
    const user = requireUser(request);
    const date = assertDate(request.params.date);
    const plan = await ctx.plan.get();
    const indexed = plan.days.get(date);
    const due = plan.deliverableByDate.get(date);
    if (!indexed && !due) throw notFound("Ese día no tiene actividades en el plan.");

    const [dayRow] = indexed ? await ctx.db.select().from(days).where(eq(days.date, date)) : [];
    const qs = indexed
      ? await ctx.db.select().from(questions).where(eq(questions.date, date)).orderBy(asc(questions.position))
      : [];
    const [progressRow] = await ctx.db
      .select()
      .from(dayProgress)
      .where(and(eq(dayProgress.userId, user.id), eq(dayProgress.date, date)));
    const [lastAttempt] = await ctx.db
      .select()
      .from(quizAttempts)
      .where(and(eq(quizAttempts.userId, user.id), eq(quizAttempts.date, date)))
      .orderBy(desc(quizAttempts.id))
      .limit(1);
    const progress = await progressFor(ctx, user.id);
    const deliverable = due ? (await deliverableViews(ctx, user.id, due.id))[0] ?? null : null;

    const week = plan.weeks.get(dayRow?.weekId ?? due!.weekId)!;
    const phase = plan.phases.get(week.phaseId)!;
    const position = plan.dates.indexOf(date);
    const state = progress.days[date] ?? {
      status: "rest",
      tasksDone: 0,
      tasksTotal: 0,
      attempts: 0,
      best: 0,
      total: 0,
      completedAt: null,
    };

    return {
      date,
      day: dayRow
        ? {
            date,
            weekId: week.id,
            weekNumber: week.number,
            weekTitle: week.title,
            phaseId: phase.id,
            phaseName: phase.name,
            kind: dayRow.kind,
            title: dayRow.title,
            summary: dayRow.summary,
            concept: dayRow.concept,
            example: dayRow.example,
            language: dayRow.language as Language,
            exampleOutput: dayRow.exampleOutput,
            tasks: dayRow.tasks,
          }
        : null,
      questions: qs.map((q) => ({ position: q.position, prompt: q.prompt, code: q.code, options: q.options })),
      progress: {
        tasks: dayRow ? dayRow.tasks.map((_, i) => progressRow?.tasks[i] ?? false) : [],
        evidence: progressRow?.evidence ?? "",
        completedAt: progressRow?.completedAt ?? null,
      },
      quiz: {
        attempts: state.attempts,
        best: state.best,
        last: lastAttempt ? await buildQuizResult(ctx, user.id, date, lastAttempt) : null,
      },
      state,
      deliverable,
      nav: {
        prev: position > 0 ? plan.dates[position - 1] : null,
        next: position >= 0 && position < plan.dates.length - 1 ? plan.dates[position + 1] : null,
      },
    };
  });

  app.put<{ Params: { date: string } }>("/api/days/:date/progress", async (request) => {
    const user = requireUser(request);
    const date = assertDate(request.params.date);
    const input = parse(dayProgressSchema, request.body);
    const plan = await ctx.plan.get();
    const day = plan.days.get(date);
    if (!day || day.kind !== "workshop") throw notFound("Ese día no tiene taller.");
    if (input.tasks && input.tasks.length !== day.taskCount) {
      throw badRequest(`El taller tiene ${day.taskCount} tareas.`);
    }

    const set: Partial<typeof dayProgress.$inferInsert> = { updatedAt: sql`now()` as unknown as string };
    if (input.tasks) set.tasks = input.tasks;
    if (input.evidence !== undefined) set.evidence = input.evidence;
    await ctx.db
      .insert(dayProgress)
      .values({ userId: user.id, date, tasks: input.tasks ?? [], evidence: input.evidence ?? "" })
      .onConflictDoUpdate({ target: [dayProgress.userId, dayProgress.date], set });

    await refreshWorkshopCompletion(ctx, user.id, date);
    const progress = await progressFor(ctx, user.id);
    return { state: progress.days[date], totals: progress.totals };
  });

  app.post<{ Params: { date: string } }>(
    "/api/days/:date/quiz",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (request): Promise<QuizResult> => {
      const user = requireUser(request);
      const date = assertDate(request.params.date);
      const input = parse(quizAttemptSchema, request.body);
      const qs = await ctx.db.select().from(questions).where(eq(questions.date, date)).orderBy(asc(questions.position));
      if (qs.length === 0) throw notFound("Ese día no tiene evaluación.");
      if (input.answers.length !== qs.length) throw badRequest(`Responde las ${qs.length} preguntas.`);
      input.answers.forEach((a, i) => {
        if (a >= qs[i].options.length) throw badRequest(`La respuesta de la pregunta ${i + 1} no es válida.`);
      });

      const score = qs.filter((q, i) => input.answers[i] === q.correctIndex).length;
      const [attempt] = await ctx.db
        .insert(quizAttempts)
        .values({ userId: user.id, date, answers: input.answers, score, total: qs.length })
        .returning();
      await logActivity(ctx, user.id, "quiz_attempt", date, { score, total: qs.length });
      await refreshWorkshopCompletion(ctx, user.id, date);
      return buildQuizResult(ctx, user.id, date, attempt);
    },
  );

  // ---------- Entregables ----------

  app.get("/api/deliverables", async (request) => {
    const user = requireUser(request);
    return deliverableViews(ctx, user.id);
  });

  async function loadDeliverable(userId: string, id: string) {
    const [view] = await deliverableViews(ctx, userId, id);
    if (!view) throw notFound("Ese entregable no existe.");
    return view;
  }

  app.put<{ Params: { id: string } }>("/api/deliverables/:id", async (request) => {
    const user = requireUser(request);
    const input = parse(submissionDraftSchema, request.body);
    const view = await loadDeliverable(user.id, request.params.id);
    const status = view.submission?.status ?? "draft";
    if (status === "submitted" || status === "approved") {
      throw conflict("Este entregable ya fue enviado. Retíralo si necesitas cambiarlo.");
    }
    if (input.criteria && input.criteria.length !== view.criteria.length) {
      throw badRequest(`El entregable tiene ${view.criteria.length} criterios.`);
    }
    const set: Partial<typeof submissions.$inferInsert> = { updatedAt: sql`now()` as unknown as string };
    if (input.criteria) set.criteria = input.criteria;
    if (input.evidence !== undefined) set.evidence = input.evidence;
    await ctx.db
      .insert(submissions)
      .values({
        userId: user.id,
        deliverableId: view.id,
        criteria: input.criteria ?? view.criteria.map(() => false),
        evidence: input.evidence ?? "",
      })
      .onConflictDoUpdate({ target: [submissions.userId, submissions.deliverableId], set });
    return loadDeliverable(user.id, view.id);
  });

  app.post<{ Params: { id: string } }>("/api/deliverables/:id/submit", async (request) => {
    const user = requireUser(request);
    const view = await loadDeliverable(user.id, request.params.id);
    const sub = view.submission;
    if (sub?.status === "submitted" || sub?.status === "approved") throw conflict("Este entregable ya fue enviado.");
    const checked = sub?.criteria.filter(Boolean).length ?? 0;
    if (!sub || checked < view.criteria.length) {
      throw badRequest("Marca todos los criterios antes de enviar.", { fields: { criteria: "Faltan criterios" } });
    }
    if (!sub.evidence.trim()) {
      throw badRequest("Agrega tu evidencia antes de enviar.", { fields: { evidence: "Falta la evidencia" } });
    }
    await ctx.db
      .update(submissions)
      .set({ status: "submitted", submittedAt: sql`now()`, updatedAt: sql`now()` })
      .where(and(eq(submissions.userId, user.id), eq(submissions.deliverableId, view.id)));
    await logActivity(ctx, user.id, "submission_submitted", view.id, { title: view.title });
    return loadDeliverable(user.id, view.id);
  });

  app.post<{ Params: { id: string } }>("/api/deliverables/:id/withdraw", async (request) => {
    const user = requireUser(request);
    const view = await loadDeliverable(user.id, request.params.id);
    if (view.submission?.status !== "submitted") {
      throw conflict(
        view.submission?.status === "approved"
          ? "Este entregable ya fue aprobado y no se puede retirar."
          : "Este entregable no está enviado.",
      );
    }
    await ctx.db
      .update(submissions)
      .set({ status: "draft", submittedAt: null, updatedAt: sql`now()` })
      .where(and(eq(submissions.userId, user.id), eq(submissions.deliverableId, view.id)));
    await logActivity(ctx, user.id, "submission_withdrawn", view.id, { title: view.title });
    return loadDeliverable(user.id, view.id);
  });
}
