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
  type ReviewDetail,
  type SqlExercise,
  type StudentExerciseRow,
  type ReviewQueueItem,
  type StudentDetail,
  type StudentRow,
  type UserRow,
} from "@tomas/shared";
import type { AppContext } from "../context";
import { activity, dayProgress, days, deliverables, exerciseProgress, questions, quizAttempts, studyTime, submissions, users } from "../db/schema";
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
    const today = await ctx.today();
    const weekRows = await ctx.db
      .select({ userId: studyTime.userId, minutes: sql<number>`sum(${studyTime.minutes})::int` })
      .from(studyTime)
      .where(sql`${studyTime.date} > ${addDays(today, -7)} and ${studyTime.date} <= ${today}`)
      .groupBy(studyTime.userId);
    const weekMap = new Map(weekRows.map((r) => [r.userId, r.minutes]));
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
          weekMinutes: weekMap.get(u.id) ?? 0,
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
    const localDay = (col: typeof dayProgress.completedAt | typeof quizAttempts.createdAt | typeof exerciseProgress.solvedAt) =>
      sql<string>`to_char((${col} at time zone ${tz})::date, 'YYYY-MM-DD')`;
    const [completedRows, quizRows, solvedRows, minuteRows] = await Promise.all([
      ctx.db
        .select({ day: localDay(dayProgress.completedAt), n: sql<number>`count(*)::int` })
        .from(dayProgress)
        .where(sql`${dayProgress.completedAt} is not null`)
        .groupBy(sql`1`),
      ctx.db
        .select({ day: localDay(quizAttempts.createdAt), n: sql<number>`count(*)::int` })
        .from(quizAttempts)
        .groupBy(sql`1`),
      ctx.db
        .select({ day: localDay(exerciseProgress.solvedAt), n: sql<number>`count(*)::int` })
        .from(exerciseProgress)
        .where(sql`${exerciseProgress.solvedAt} is not null`)
        .groupBy(sql`1`),
      ctx.db
        .select({ day: sql<string>`to_char(${studyTime.date}, 'YYYY-MM-DD')`, n: sql<number>`sum(${studyTime.minutes})::int` })
        .from(studyTime)
        .groupBy(sql`1`),
    ]);

    const buckets = new Map<string, { workshops: number; quizzes: number; exercises: number; minutes: number }>();
    const start = plan.response.start || today;
    const end = plan.response.end || today;
    const lastMonday = mondayOf(today < end ? today : end);
    for (let m = mondayOf(start); m <= lastMonday; m = addDays(m, 7)) {
      buckets.set(m, { workshops: 0, quizzes: 0, exercises: 0, minutes: 0 });
    }
    for (const r of completedRows) {
      const b = buckets.get(mondayOf(r.day));
      if (b) b.workshops += r.n;
    }
    for (const r of quizRows) {
      const b = buckets.get(mondayOf(r.day));
      if (b) b.quizzes += r.n;
    }
    for (const r of solvedRows) {
      const b = buckets.get(mondayOf(r.day));
      if (b) b.exercises += r.n;
    }
    for (const r of minuteRows) {
      const b = buckets.get(mondayOf(r.day));
      if (b) b.minutes += r.n;
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
    const [plan, progress, quizStats, evidenceRows, deliverablesList, activityItems, exerciseRows] = await Promise.all([
      ctx.plan.get(),
      progressFor(ctx, student.id),
      quizStatsByDate(ctx, student.id),
      ctx.db
        .select({ date: dayProgress.date, evidence: dayProgress.evidence, challengeDone: dayProgress.challengeDone })
        .from(dayProgress)
        .where(eq(dayProgress.userId, student.id)),
      deliverableViews(ctx, student.id),
      recentActivity(ctx, { userId: student.id, limit: 40 }),
      ctx.db.select().from(exerciseProgress).where(eq(exerciseProgress.userId, student.id)),
    ]);
    const evidence = new Map(evidenceRows.map((r) => [r.date, r]));
    const byExercise = new Map(exerciseRows.map((r) => [r.exerciseId, r]));
    const exercisesOf = (ids: string[]) => ids.map((id) => byExercise.get(id)).filter((r) => r !== undefined);
    const exercises: StudentExerciseRow[] = exerciseRows
      .filter((r) => plan.exercises.has(r.exerciseId))
      .map((r) => {
        const where = plan.exercises.get(r.exerciseId)!;
        return {
          id: r.exerciseId,
          title: where.exercise.title,
          date: where.date,
          deliverableId: where.deliverableId,
          state: { attempts: r.attempts, solved: r.solved, solvedAt: r.solvedAt, revealed: r.revealed, lastSql: r.lastSql },
        };
      })
      .sort((a, b) => a.id.localeCompare(b.id, "es", { numeric: true }));
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
          exerciseAttempts: exercisesOf(d.exerciseIds).reduce((a, r) => a + r.attempts, 0),
          solutionsRevealed: exercisesOf(d.exerciseIds).filter((r) => r.revealed).length,
          studyMinutes: progress.study[d.date] ?? 0,
        })),
      exercises,
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
          exerciseCount: day.exerciseCount,
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
              exercises: d.exercises,
            }
          : null,
      };
    });
  });

  /**
   * Revisa los ejercicios que el administrador quiere guardar: ids únicos en todo el plan y una
   * solución que corre y devuelve filas (si no, no se podrían calificar).
   */
  async function validateExercises(list: SqlExercise[], owner: { date?: string; deliverableId?: string }) {
    const plan = await ctx.plan.get();
    const fields: Record<string, string> = {};
    const seen = new Set<string>();
    for (const [i, e] of list.entries()) {
      if (seen.has(e.id)) fields[`exercises.${i}.id`] = `El id ${e.id} está repetido en este día.`;
      seen.add(e.id);
      const other = plan.exercises.get(e.id);
      const sameOwner = owner.date ? other?.date === owner.date : other?.deliverableId === owner.deliverableId;
      if (other && !sameOwner) {
        fields[`exercises.${i}.id`] = `El id ${e.id} ya lo usa otro ejercicio (${other.date ?? other.deliverableId}).`;
      }
    }
    const problems = await Promise.all(list.map((e) => ctx.exercises.validate(e)));
    problems.forEach((p, i) => {
      if (p) fields[`exercises.${i}.solution`] = `Ejercicio ${i + 1}: ${p}.`;
    });
    if (Object.keys(fields).length) throw badRequest(Object.values(fields)[0], { fields });
  }

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
      schedule: day.schedule,
      topics: day.topics,
      tasks: day.tasks,
      taskHints: day.taskHints,
      challenge: day.challenge,
      glossary: day.glossary,
      resources: day.resources,
      exercises: day.exercises,
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
    if (day.kind === "workshop" && input.tasks.length === 0 && input.exercises.length === 0) {
      throw badRequest("Un taller necesita al menos una tarea o un ejercicio.");
    }
    if (input.taskHints.length > input.tasks.length) throw badRequest("Hay más pistas que tareas.");
    await validateExercises(input.exercises, { date: day.date });
    await ctx.db.transaction(async (tx) => {
      await tx
        .update(days)
        .set({
          title: input.title,
          summary: input.summary,
          objectives: input.objectives,
          schedule: input.schedule,
          topics: input.topics,
          tasks: input.tasks,
          taskHints: input.taskHints,
          challenge: input.challenge,
          glossary: input.glossary,
          resources: input.resources,
          exercises: input.exercises,
          updatedAt: sql`now()`,
        })
        .where(eq(days.date, day.date));
      await tx.delete(questions).where(eq(questions.date, day.date));
      if (input.questions.length) {
        await tx.insert(questions).values(input.questions.map((q, i) => ({ ...q, date: day.date, position: i })));
      }
    });
    ctx.plan.invalidate();
    ctx.exercises.invalidate();
    return { ok: true };
  });

  app.put<{ Params: { id: string } }>("/api/admin/deliverables/:id", async (request) => {
    const input = parse(adminDeliverableSchema, request.body);
    if (input.exercises) await validateExercises(input.exercises, { deliverableId: request.params.id });
    const updated = await ctx.db
      .update(deliverables)
      .set(input)
      .where(eq(deliverables.id, request.params.id))
      .returning({ id: deliverables.id });
    if (!updated.length) throw notFound("Ese entregable no existe.");
    ctx.plan.invalidate();
    ctx.exercises.invalidate();
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
