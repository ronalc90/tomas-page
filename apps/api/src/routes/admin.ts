import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import {
  addDays,
  adminDaySchema,
  adminDeliverableSchema,
  createUserSchema,
  formatDayMonth,
  isIsoDate,
  mondayOf,
  resetPasswordSchema,
  reviewSchema,
  settingsSchema,
  updateUserSchema,
  ADMIN_MIN_PASSWORD,
  type AdminDay,
  type AdminOverview,
  type ContentWeek,
  type DeliverableKind,
  type Language,
  type ReviewDetail,
  type ReviewQueueItem,
  type StudentDetail,
  type StudentRow,
  type UserRow,
} from "@tomas/shared";
import type { AppContext } from "../context";
import { activity, dayProgress, days, deliverables, questions, quizAttempts, submissions, users } from "../db/schema";
import { assertUuid, badRequest, conflict, notFound, parse } from "../lib/errors";
import { hashPassword } from "../lib/password";
import { requireAdmin, revokeUserSessions } from "../plugins/auth";
import { logActivity, recentActivity } from "../services/activity";
import { deliverableViews, progressFor, quizStatsByDate } from "../services/progress";

const USER_COLUMNS = {
  id: users.id,
  username: users.username,
  displayName: users.displayName,
  role: users.role,
  active: users.active,
  createdAt: users.createdAt,
  lastLoginAt: users.lastLoginAt,
};

export async function adminRoutes(app: FastifyInstance, ctx: AppContext) {
  app.addHook("preHandler", async (request) => {
    if (request.url.startsWith("/api/admin")) requireAdmin(request);
  });

  async function studentRows(onlyId?: string): Promise<StudentRow[]> {
    const rows = await ctx.db
      .select(USER_COLUMNS)
      .from(users)
      .where(onlyId ? eq(users.id, onlyId) : eq(users.role, "student"))
      .orderBy(asc(users.displayName));
    const lastActivity = await ctx.db
      .select({ userId: activity.userId, at: sql<string>`max(${activity.createdAt})` })
      .from(activity)
      .where(ne(activity.type, "login"))
      .groupBy(activity.userId);
    const lastMap = new Map(lastActivity.map((r) => [r.userId, r.at]));
    return Promise.all(
      rows.map(async (u) => {
        const progress = await progressFor(ctx, u.id);
        return {
          id: u.id,
          username: u.username,
          displayName: u.displayName,
          active: u.active,
          lastLoginAt: u.lastLoginAt,
          lastActivityAt: lastMap.get(u.id) ? new Date(lastMap.get(u.id)!).toISOString() : null,
          totals: progress.totals,
          pace: progress.pace,
        };
      }),
    );
  }

  // ---------- Resumen ----------

  app.get("/api/admin/overview", async (): Promise<AdminOverview> => {
    const [students, pending, activityItems, today, plan, settings] = await Promise.all([
      studentRows(),
      ctx.db
        .select({ n: sql<number>`count(*)::int` })
        .from(submissions)
        .where(eq(submissions.status, "submitted")),
      recentActivity(ctx, { limit: 25 }),
      ctx.today(),
      ctx.plan.get(),
      ctx.settings.get(),
    ]);

    const tz = settings.timeZone;
    const localDay = (col: typeof dayProgress.completedAt | typeof quizAttempts.createdAt) =>
      sql<string>`to_char((${col} at time zone ${tz})::date, 'YYYY-MM-DD')`;
    const [completedRows, quizRows] = await Promise.all([
      ctx.db
        .select({ day: localDay(dayProgress.completedAt), n: sql<number>`count(*)::int` })
        .from(dayProgress)
        .where(sql`${dayProgress.completedAt} is not null`)
        .groupBy(sql`1`),
      ctx.db
        .select({ day: localDay(quizAttempts.createdAt), n: sql<number>`count(*)::int` })
        .from(quizAttempts)
        .groupBy(sql`1`),
    ]);

    const buckets = new Map<string, { workshops: number; quizzes: number }>();
    const lastMonday = mondayOf(today < plan.response.end ? today : plan.response.end);
    for (let m = mondayOf(plan.response.start); m <= lastMonday; m = addDays(m, 7)) {
      buckets.set(m, { workshops: 0, quizzes: 0 });
    }
    for (const r of completedRows) {
      const b = buckets.get(mondayOf(r.day));
      if (b) b.workshops += r.n;
    }
    for (const r of quizRows) {
      const b = buckets.get(mondayOf(r.day));
      if (b) b.quizzes += r.n;
    }

    return {
      today,
      students,
      pendingReviews: pending[0]?.n ?? 0,
      activity: activityItems,
      weeklyActivity: [...buckets.entries()].slice(-10).map(([week, v]) => ({
        week,
        label: formatDayMonth(week),
        ...v,
      })),
    };
  });

  // ---------- Estudiantes ----------

  app.get("/api/admin/students", async () => studentRows());

  app.get<{ Params: { id: string } }>("/api/admin/students/:id", async (request): Promise<StudentDetail> => {
    const [student] = await studentRows(assertUuid(request.params.id, "Ese estudiante no existe."));
    if (!student) throw notFound("Ese estudiante no existe.");
    const [plan, progress, quizStats, evidenceRows, deliverablesList, activityItems] = await Promise.all([
      ctx.plan.get(),
      progressFor(ctx, student.id),
      quizStatsByDate(ctx, student.id),
      ctx.db
        .select({ date: dayProgress.date, evidence: dayProgress.evidence, challengeDone: dayProgress.challengeDone })
        .from(dayProgress)
        .where(eq(dayProgress.userId, student.id)),
      deliverableViews(ctx, student.id),
      recentActivity(ctx, { userId: student.id, limit: 40 }),
    ]);
    const evidence = new Map(evidenceRows.map((r) => [r.date, r]));
    return {
      student,
      progress,
      days: [...plan.days.values()]
        .filter((d) => d.kind === "workshop")
        .map((d) => ({
          date: d.date,
          title: d.title,
          weekNumber: plan.weeks.get(d.weekId)?.number ?? 0,
          kind: d.kind,
          state: progress.days[d.date],
          firstScore: quizStats[d.date]?.first ?? null,
          evidence: evidence.get(d.date)?.evidence ?? "",
          challengeDone: evidence.get(d.date)?.challengeDone ?? false,
          hintsUsed: quizStats[d.date]?.hints ?? 0,
        })),
      deliverables: deliverablesList,
      activity: activityItems,
    };
  });

  // ---------- Revisión de entregables ----------

  app.get<{ Querystring: { status?: string } }>("/api/admin/reviews", async (request): Promise<ReviewQueueItem[]> => {
    const status = request.query.status ?? "submitted";
    const statuses =
      status === "all" ? (["submitted", "approved", "changes_requested"] as const) : ([status] as const);
    if (!statuses.every((s) => ["submitted", "approved", "changes_requested", "draft"].includes(s))) {
      throw badRequest("Estado inválido.");
    }
    const plan = await ctx.plan.get();
    const rows = await ctx.db
      .select({
        userId: submissions.userId,
        userName: users.displayName,
        deliverableId: submissions.deliverableId,
        status: submissions.status,
        submittedAt: submissions.submittedAt,
        reviewedAt: submissions.reviewedAt,
      })
      .from(submissions)
      .innerJoin(users, eq(users.id, submissions.userId))
      .where(inArray(submissions.status, [...statuses] as ("draft" | "submitted" | "approved" | "changes_requested")[]))
      .orderBy(desc(sql`coalesce(${submissions.reviewedAt}, ${submissions.submittedAt}, ${submissions.updatedAt})`));
    return rows.map((r) => {
      const d = plan.deliverables.get(r.deliverableId)!;
      return {
        ...r,
        weekNumber: plan.weeks.get(d.weekId)?.number ?? 0,
        title: d.title,
        dueDate: d.dueDate,
      };
    });
  });

  app.get<{ Params: { userId: string; deliverableId: string } }>(
    "/api/admin/reviews/:userId/:deliverableId",
    async (request): Promise<ReviewDetail> => {
      const { deliverableId } = request.params;
      const userId = assertUuid(request.params.userId, "Ese estudiante no existe.");
      const [user] = await ctx.db.select(USER_COLUMNS).from(users).where(eq(users.id, userId));
      if (!user) throw notFound("Ese estudiante no existe.");
      const [deliverable] = await deliverableViews(ctx, userId, deliverableId);
      if (!deliverable) throw notFound("Ese entregable no existe.");
      return { userId, userName: user.displayName, deliverable };
    },
  );

  app.post<{ Params: { userId: string; deliverableId: string } }>(
    "/api/admin/reviews/:userId/:deliverableId",
    async (request) => {
      const admin = requireAdmin(request);
      const input = parse(reviewSchema, request.body);
      const { deliverableId } = request.params;
      const userId = assertUuid(request.params.userId, "No hay entrega para revisar.");
      const [sub] = await ctx.db
        .select()
        .from(submissions)
        .where(and(eq(submissions.userId, userId), eq(submissions.deliverableId, deliverableId)));
      if (!sub) throw notFound("No hay entrega para revisar.");
      if (sub.status === "draft") throw conflict("El estudiante todavía no ha enviado este entregable.");
      if (input.decision === "changes_requested" && !input.feedback) {
        throw badRequest("Cuando pides cambios, escribe qué debe corregir.", { fields: { feedback: "Escribe qué cambiar" } });
      }
      await ctx.db
        .update(submissions)
        .set({
          status: input.decision,
          feedback: input.feedback,
          reviewedAt: sql`now()`,
          reviewerId: admin.id,
          updatedAt: sql`now()`,
        })
        .where(and(eq(submissions.userId, userId), eq(submissions.deliverableId, deliverableId)));
      await logActivity(ctx, admin.id, "submission_reviewed", deliverableId, {
        decision: input.decision,
        studentId: userId,
      });
      const [deliverable] = await deliverableViews(ctx, userId, deliverableId);
      return deliverable;
    },
  );

  // ---------- Contenido ----------

  app.get("/api/admin/content", async (): Promise<ContentWeek[]> => {
    const plan = await ctx.plan.get();
    const [dayRows, deliverableRows] = await Promise.all([
      ctx.db.select({ date: days.date, updatedAt: days.updatedAt }).from(days),
      ctx.db.select().from(deliverables),
    ]);
    const updated = new Map(dayRows.map((d) => [d.date, d.updatedAt]));
    return plan.response.weeks.map((w) => {
      const d = deliverableRows.find((x) => x.weekId === w.id);
      return {
        id: w.id,
        number: w.number,
        phaseId: w.phaseId,
        title: w.title,
        rangeLabel: w.rangeLabel,
        days: w.days.map((day) => ({
          date: day.date,
          kind: day.kind,
          title: day.title,
          questionCount: plan.days.get(day.date)?.questionCount ?? 0,
          updatedAt: updated.get(day.date) ?? null,
        })),
        deliverable: d
          ? {
              id: d.id,
              weekId: d.weekId,
              dueDate: d.dueDate,
              kind: d.kind as DeliverableKind,
              path: d.path,
              description: d.description,
              criteria: d.criteria,
              steps: d.steps,
              tips: d.tips,
              stretch: d.stretch,
              checklist: d.checklist,
            }
          : null,
      };
    });
  });

  app.get<{ Params: { date: string } }>("/api/admin/days/:date", async (request): Promise<AdminDay> => {
    const plan = await ctx.plan.get();
    const [day] = isIsoDate(request.params.date)
      ? await ctx.db.select().from(days).where(eq(days.date, request.params.date))
      : [];
    if (!day) throw notFound("Ese día no existe.");
    const week = plan.weeks.get(day.weekId)!;
    const qs = await ctx.db.select().from(questions).where(eq(questions.date, day.date)).orderBy(asc(questions.position));
    return {
      date: day.date,
      weekId: week.id,
      weekNumber: week.number,
      weekTitle: week.title,
      phaseId: week.phaseId,
      phaseName: plan.phases.get(week.phaseId)?.name ?? "",
      kind: day.kind,
      title: day.title,
      summary: day.summary,
      objectives: day.objectives,
      concept: day.concept,
      tip: day.tip,
      example: day.example,
      language: day.language as Language,
      exampleOutput: day.exampleOutput,
      steps: day.steps,
      commonErrors: day.commonErrors,
      tasks: day.tasks,
      taskHints: day.taskHints,
      challenge: day.challenge,
      glossary: day.glossary,
      resources: day.resources,
      questions: qs.map((q) => ({
        type: q.type,
        prompt: q.prompt,
        code: q.code,
        options: q.options,
        correctIndex: q.correctIndex,
        accepted: q.accepted,
        optionFeedback: q.optionFeedback,
        explanation: q.explanation,
        hint: q.hint,
      })),
      updatedAt: day.updatedAt,
    };
  });

  app.put<{ Params: { date: string } }>("/api/admin/days/:date", async (request) => {
    const input = parse(adminDaySchema, request.body);
    const [day] = isIsoDate(request.params.date)
      ? await ctx.db.select().from(days).where(eq(days.date, request.params.date))
      : [];
    if (!day) throw notFound("Ese día no existe.");
    if (day.kind === "workshop" && input.tasks.length === 0) throw badRequest("Un taller necesita al menos una tarea.");
    await ctx.db.transaction(async (tx) => {
      await tx
        .update(days)
        .set({
          title: input.title,
          summary: input.summary,
          objectives: input.objectives,
          concept: input.concept,
          tip: input.tip,
          example: input.example,
          language: input.language,
          exampleOutput: input.exampleOutput,
          steps: input.steps,
          commonErrors: input.commonErrors,
          tasks: input.tasks,
          taskHints: input.taskHints,
          challenge: input.challenge,
          glossary: input.glossary,
          resources: input.resources,
          updatedAt: sql`now()`,
        })
        .where(eq(days.date, day.date));
      await tx.delete(questions).where(eq(questions.date, day.date));
      if (input.questions.length) {
        await tx.insert(questions).values(input.questions.map((q, i) => ({ ...q, date: day.date, position: i })));
      }
    });
    ctx.plan.invalidate();
    return { ok: true };
  });

  app.put<{ Params: { id: string } }>("/api/admin/deliverables/:id", async (request) => {
    const input = parse(adminDeliverableSchema, request.body);
    const updated = await ctx.db
      .update(deliverables)
      .set(input)
      .where(eq(deliverables.id, request.params.id))
      .returning({ id: deliverables.id });
    if (!updated.length) throw notFound("Ese entregable no existe.");
    ctx.plan.invalidate();
    return { ok: true };
  });

  // ---------- Usuarios ----------

  app.get("/api/admin/users", async (): Promise<UserRow[]> =>
    ctx.db.select(USER_COLUMNS).from(users).orderBy(asc(users.role), asc(users.displayName)),
  );

  app.post("/api/admin/users", async (request, reply) => {
    const input = parse(createUserSchema, request.body);
    const [exists] = await ctx.db
      .select({ id: users.id })
      .from(users)
      .where(eq(sql`lower(${users.username})`, input.username));
    if (exists) throw conflict("Ya existe un usuario con ese nombre.");
    const [created] = await ctx.db
      .insert(users)
      .values({
        username: input.username,
        displayName: input.displayName,
        role: input.role,
        passwordHash: await hashPassword(input.password),
      })
      .returning(USER_COLUMNS);
    reply.code(201);
    return created;
  });

  async function activeAdminCount(): Promise<number> {
    const [row] = await ctx.db
      .select({ n: sql<number>`count(*)::int` })
      .from(users)
      .where(and(eq(users.role, "admin"), eq(users.active, true)));
    return row?.n ?? 0;
  }

  app.patch<{ Params: { id: string } }>("/api/admin/users/:id", async (request) => {
    const admin = requireAdmin(request);
    const input = parse(updateUserSchema, request.body);
    const [target] = await ctx.db
      .select(USER_COLUMNS)
      .from(users)
      .where(eq(users.id, assertUuid(request.params.id, "Ese usuario no existe.")));
    if (!target) throw notFound("Ese usuario no existe.");
    if (target.id === admin.id && (input.active === false || input.role === "student")) {
      throw conflict("No puedes desactivar tu propia cuenta ni quitarte el rol de administrador.");
    }
    const losesAdmin = target.role === "admin" && target.active && (input.active === false || input.role === "student");
    if (losesAdmin && (await activeAdminCount()) <= 1) {
      throw conflict("Debe quedar al menos un administrador activo.");
    }
    const [updated] = await ctx.db.update(users).set(input).where(eq(users.id, target.id)).returning(USER_COLUMNS);
    if (input.active === false) await revokeUserSessions(ctx, target.id);
    return updated;
  });

  app.post<{ Params: { id: string } }>("/api/admin/users/:id/password", async (request) => {
    const input = parse(resetPasswordSchema, request.body);
    const [target] = await ctx.db
      .select(USER_COLUMNS)
      .from(users)
      .where(eq(users.id, assertUuid(request.params.id, "Ese usuario no existe.")));
    if (!target) throw notFound("Ese usuario no existe.");
    if (target.role === "admin" && input.password.length < ADMIN_MIN_PASSWORD) {
      throw badRequest(`Para administradores usa al menos ${ADMIN_MIN_PASSWORD} caracteres.`, {
        fields: { password: `Usa al menos ${ADMIN_MIN_PASSWORD} caracteres` },
      });
    }
    await ctx.db
      .update(users)
      .set({ passwordHash: await hashPassword(input.password) })
      .where(eq(users.id, target.id));
    await revokeUserSessions(ctx, target.id, target.id === request.user?.id ? request.sessionId : null);
    return { ok: true };
  });

  // ---------- Ajustes ----------

  app.get("/api/admin/settings", async () => ctx.settings.get());

  app.put("/api/admin/settings", async (request) => {
    const input = parse(settingsSchema, request.body);
    return ctx.settings.update(input);
  });
}
