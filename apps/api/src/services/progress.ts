import { and, eq, sql } from "drizzle-orm";
import {
  computeProgress,
  exerciseCounts,
  isWorkshopDone,
  type DeliverableView,
  type ProgressUserInput,
  type ProgressView,
  type SubmissionStatus,
} from "@tomas/shared";
import type { AppContext } from "../context";
import { dayProgress, deliverables, exerciseProgress, quizAttempts, studyTime, submissions, users } from "../db/schema";
import { logActivity } from "./activity";

export interface QuizStats {
  attempts: number;
  best: number;
  first: number;
  /** Pistas destapadas en el intento más reciente. */
  hints: number;
}

export async function quizStatsByDate(ctx: AppContext, userId: string): Promise<Record<string, QuizStats>> {
  const rows = await ctx.db
    .select({
      date: quizAttempts.date,
      attempts: sql<number>`count(*)::int`,
      best: sql<number>`max(${quizAttempts.score})::int`,
      first: sql<number>`(array_agg(${quizAttempts.score} order by ${quizAttempts.id}))[1]::int`,
      hints: sql<number>`(array_agg(jsonb_array_length(${quizAttempts.hintsUsed}) order by ${quizAttempts.id} desc))[1]::int`,
    })
    .from(quizAttempts)
    .where(eq(quizAttempts.userId, userId))
    .groupBy(quizAttempts.date);
  return Object.fromEntries(rows.map((r) => [r.date, { attempts: r.attempts, best: r.best, first: r.first, hints: r.hints }]));
}

/** Intentos y estado de cada ejercicio del usuario. */
export async function exerciseStats(ctx: AppContext, userId: string): Promise<Record<string, { attempts: number; solved: boolean }>> {
  const rows = await ctx.db
    .select({ id: exerciseProgress.exerciseId, attempts: exerciseProgress.attempts, solved: exerciseProgress.solved })
    .from(exerciseProgress)
    .where(eq(exerciseProgress.userId, userId));
  return Object.fromEntries(rows.map((r) => [r.id, { attempts: r.attempts, solved: r.solved }]));
}

export async function studyByDate(ctx: AppContext, userId: string): Promise<Record<string, number>> {
  const rows = await ctx.db
    .select({ date: studyTime.date, minutes: studyTime.minutes })
    .from(studyTime)
    .where(eq(studyTime.userId, userId));
  return Object.fromEntries(rows.map((r) => [r.date, r.minutes]));
}

export async function loadProgressInput(ctx: AppContext, userId: string): Promise<ProgressUserInput> {
  const [dayRows, quizzes, subRows, exercises, study] = await Promise.all([
    ctx.db.select().from(dayProgress).where(eq(dayProgress.userId, userId)),
    quizStatsByDate(ctx, userId),
    ctx.db.select().from(submissions).where(eq(submissions.userId, userId)),
    exerciseStats(ctx, userId),
    studyByDate(ctx, userId),
  ]);
  return {
    exercises,
    study,
    days: Object.fromEntries(
      dayRows.map((r) => [
        r.date,
        { tasks: r.tasks, completedAt: r.completedAt, hasEvidence: r.evidence.trim().length > 0 },
      ]),
    ),
    quizzes,
    submissions: Object.fromEntries(
      subRows.map((s) => [
        s.deliverableId,
        { status: s.status, touched: s.criteria.some(Boolean) || s.evidence.trim().length > 0 },
      ]),
    ),
  };
}

export async function progressFor(ctx: AppContext, userId: string): Promise<ProgressView> {
  const [plan, input, settings, today] = await Promise.all([
    ctx.plan.get(),
    loadProgressInput(ctx, userId),
    ctx.settings.get(),
    ctx.today(),
  ]);
  return computeProgress(plan.progressInput, input, today, settings.passScore);
}

/** Marca el taller como completo (una sola vez) cuando cumple las reglas. */
export async function refreshWorkshopCompletion(ctx: AppContext, userId: string, date: string): Promise<void> {
  const plan = await ctx.plan.get();
  const day = plan.days.get(date);
  if (!day || day.kind !== "workshop") return;
  const [row] = await ctx.db
    .select()
    .from(dayProgress)
    .where(and(eq(dayProgress.userId, userId), eq(dayProgress.date, date)));
  const stats = (await quizStatsByDate(ctx, userId))[date];
  const { passScore } = await ctx.settings.get();
  const ex = exerciseCounts(day.exerciseIds, await exerciseStats(ctx, userId));
  const done = isWorkshopDone({
    taskCount: day.taskCount,
    tasks: row?.tasks,
    questionCount: day.questionCount,
    best: stats?.best,
    passScore,
    exercisesTotal: ex.total,
    exercisesSolved: ex.solved,
  });

  if (done && !row?.completedAt) {
    await ctx.db
      .insert(dayProgress)
      .values({ userId, date, completedAt: sql`now()` })
      .onConflictDoUpdate({
        target: [dayProgress.userId, dayProgress.date],
        set: { completedAt: sql`now()`, updatedAt: sql`now()` },
      });
    await logActivity(ctx, userId, "workshop_completed", date, { title: day.title });
  } else if (!done && row?.completedAt) {
    await ctx.db
      .update(dayProgress)
      .set({ completedAt: null, updatedAt: sql`now()` })
      .where(and(eq(dayProgress.userId, userId), eq(dayProgress.date, date)));
  }
}

/** Entregables con la entrega del usuario, listos para mostrar. */
export async function deliverableViews(ctx: AppContext, userId: string, onlyId?: string): Promise<DeliverableView[]> {
  const [plan, progress] = await Promise.all([ctx.plan.get(), progressFor(ctx, userId)]);
  const rows = await ctx.db.select().from(deliverables).where(onlyId ? eq(deliverables.id, onlyId) : undefined);
  const subs = await ctx.db
    .select({
      deliverableId: submissions.deliverableId,
      status: submissions.status,
      criteria: submissions.criteria,
      evidence: submissions.evidence,
      submittedAt: submissions.submittedAt,
      reviewedAt: submissions.reviewedAt,
      feedback: submissions.feedback,
      reviewerName: users.displayName,
    })
    .from(submissions)
    .leftJoin(users, eq(users.id, submissions.reviewerId))
    .where(
      onlyId
        ? and(eq(submissions.userId, userId), eq(submissions.deliverableId, onlyId))
        : eq(submissions.userId, userId),
    );
  const subMap = new Map(subs.map((s) => [s.deliverableId, s]));
  const exerciseViews = await Promise.all(rows.map((d) => ctx.exercises.views(userId, d.exercises)));

  return rows
    .map((d, i): DeliverableView => {
      const week = plan.weeks.get(d.weekId)!;
      const indexed = plan.deliverables.get(d.id)!;
      const sub = subMap.get(d.id);
      return {
        id: d.id,
        weekId: d.weekId,
        weekNumber: week.number,
        weekTitle: week.title,
        phaseId: week.phaseId,
        dueDate: d.dueDate,
        kind: indexed.kind,
        title: indexed.title,
        path: d.path,
        description: d.description,
        criteria: d.criteria,
        steps: d.steps,
        tips: d.tips,
        stretch: d.stretch,
        checklist: d.checklist,
        exercises: exerciseViews[i],
        state: progress.deliverables[d.id] ?? { status: "pending", submission: null, exercisesDone: 0, exercisesTotal: 0 },
        submission: sub
          ? {
              status: sub.status as SubmissionStatus,
              criteria: sub.criteria,
              evidence: sub.evidence,
              submittedAt: sub.submittedAt,
              reviewedAt: sub.reviewedAt,
              feedback: sub.feedback,
              reviewerName: sub.reviewerName ?? null,
            }
          : null,
      };
    })
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}
