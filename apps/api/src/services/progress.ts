import { and, eq, sql } from "drizzle-orm";
import {
  computeProgress,
  isWorkshopDone,
  type DeliverableView,
  type ProgressUserInput,
  type ProgressView,
  type SubmissionStatus,
} from "@tomas/shared";
import type { AppContext } from "../context";
import { dayProgress, deliverables, quizAttempts, submissions, users } from "../db/schema";
import { logActivity } from "./activity";

export interface QuizStats {
  attempts: number;
  best: number;
  first: number;
}

export async function quizStatsByDate(ctx: AppContext, userId: string): Promise<Record<string, QuizStats>> {
  const rows = await ctx.db
    .select({
      date: quizAttempts.date,
      attempts: sql<number>`count(*)::int`,
      best: sql<number>`max(${quizAttempts.score})::int`,
      first: sql<number>`(array_agg(${quizAttempts.score} order by ${quizAttempts.id}))[1]::int`,
    })
    .from(quizAttempts)
    .where(eq(quizAttempts.userId, userId))
    .groupBy(quizAttempts.date);
  return Object.fromEntries(rows.map((r) => [r.date, { attempts: r.attempts, best: r.best, first: r.first }]));
}

export async function loadProgressInput(ctx: AppContext, userId: string): Promise<ProgressUserInput> {
  const [dayRows, quizzes, subRows] = await Promise.all([
    ctx.db.select().from(dayProgress).where(eq(dayProgress.userId, userId)),
    quizStatsByDate(ctx, userId),
    ctx.db.select().from(submissions).where(eq(submissions.userId, userId)),
  ]);
  return {
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
  const done = isWorkshopDone(day.taskCount, row?.tasks, stats?.best, day.questionCount, passScore);

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

  return rows
    .map((d): DeliverableView => {
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
        state: progress.deliverables[d.id] ?? { status: "pending", submission: null },
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
