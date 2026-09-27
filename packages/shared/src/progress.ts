import type {
  DayKind,
  DayState,
  DeliverableState,
  ItemStatus,
  Pace,
  PendingItem,
  PhaseProgress,
  ProgressView,
  SubmissionStatus,
} from "./types";

/**
 * Reglas de avance, en un solo lugar para que el estudiante y el
 * administrador vean exactamente lo mismo.
 *
 * - Un taller está completo cuando todas sus tareas están marcadas y la mejor
 *   nota de la evaluación alcanza la nota mínima (passScore).
 * - Un entregable cuenta como entregado cuando está enviado o aprobado.
 * - Lo que tiene fecha anterior a hoy y no está completo queda atrasado.
 */

export interface ProgressPlanInput {
  phases: { id: number; name: string }[];
  weeks: { id: string; phaseId: number }[];
  days: { date: string; weekId: string; kind: DayKind; title: string; taskCount: number; questionCount: number }[];
  deliverables: { id: string; weekId: string; dueDate: string; title: string }[];
}

export interface ProgressUserInput {
  days: Record<string, { tasks: boolean[]; completedAt: string | null; hasEvidence: boolean }>;
  quizzes: Record<string, { attempts: number; best: number; first: number }>;
  submissions: Record<string, { status: SubmissionStatus; touched: boolean }>;
}

export function isWorkshopDone(
  taskCount: number,
  tasks: boolean[] | undefined,
  best: number | undefined,
  questionCount: number,
  passScore: number,
): boolean {
  const done = (tasks ?? []).slice(0, taskCount).filter(Boolean).length;
  const needed = Math.min(passScore, questionCount);
  return done >= taskCount && (questionCount === 0 || (best ?? 0) >= needed);
}

export function computeProgress(
  plan: ProgressPlanInput,
  user: ProgressUserInput,
  today: string,
  passScore: number,
): ProgressView {
  const phaseOfWeek = new Map(plan.weeks.map((w) => [w.id, w.phaseId]));
  const dates = [...plan.days.map((d) => d.date), ...plan.deliverables.map((d) => d.dueDate)].sort();
  const start = dates[0] ?? today;
  const end = dates[dates.length - 1] ?? today;

  const days: Record<string, DayState> = {};
  const pending: PendingItem[] = [];
  const phaseTotals = new Map<number, { done: number; total: number }>();
  const bump = (phaseId: number | undefined, done: boolean) => {
    if (phaseId === undefined) return;
    const t = phaseTotals.get(phaseId) ?? { done: 0, total: 0 };
    t.total += 1;
    if (done) t.done += 1;
    phaseTotals.set(phaseId, t);
  };

  let workshops = 0;
  let workshopsDone = 0;
  let quizzesTaken = 0;
  let quizzesPassed = 0;
  let scoreSum = 0;
  let firstSum = 0;
  let expectedByToday = 0;
  let overdue = 0;
  const workshopTimeline: { date: string; done: boolean }[] = [];

  for (const day of [...plan.days].sort((a, b) => a.date.localeCompare(b.date))) {
    const record = user.days[day.date];
    const quiz = user.quizzes[day.date];
    const total = day.questionCount;
    const tasksDone = (record?.tasks ?? []).slice(0, day.taskCount).filter(Boolean).length;

    if (day.kind !== "workshop") {
      days[day.date] = {
        status: "rest",
        tasksDone: 0,
        tasksTotal: 0,
        attempts: 0,
        best: 0,
        total: 0,
        completedAt: null,
      };
      continue;
    }

    workshops += 1;
    const done = isWorkshopDone(day.taskCount, record?.tasks, quiz?.best, total, passScore);
    const started = tasksDone > 0 || (quiz?.attempts ?? 0) > 0 || (record?.hasEvidence ?? false);
    let status: ItemStatus;
    if (done) status = "done";
    else if (day.date < today) status = "overdue";
    else status = started ? "in_progress" : "pending";

    if (done) workshopsDone += 1;
    if (day.date <= today) expectedByToday += 1;
    if (status === "overdue") {
      overdue += 1;
      pending.push({ type: "workshop", ref: day.date, date: day.date, title: day.title });
    }
    if (quiz && quiz.attempts > 0 && total > 0) {
      quizzesTaken += 1;
      scoreSum += quiz.best / total;
      firstSum += quiz.first / total;
      if (quiz.best >= Math.min(passScore, total)) quizzesPassed += 1;
    }
    bump(phaseOfWeek.get(day.weekId), done);
    if (day.date <= today) workshopTimeline.push({ date: day.date, done });

    days[day.date] = {
      status,
      tasksDone,
      tasksTotal: day.taskCount,
      attempts: quiz?.attempts ?? 0,
      best: quiz?.best ?? 0,
      total,
      completedAt: record?.completedAt ?? null,
    };
  }

  const deliverables: Record<string, DeliverableState> = {};
  let submitted = 0;
  let approved = 0;
  for (const d of plan.deliverables) {
    const sub = user.submissions[d.id];
    const delivered = sub?.status === "submitted" || sub?.status === "approved";
    let status: ItemStatus;
    if (delivered) status = "done";
    else if (d.dueDate < today) status = "overdue";
    else status = sub && (sub.touched || sub.status === "changes_requested") ? "in_progress" : "pending";

    if (delivered) submitted += 1;
    if (sub?.status === "approved") approved += 1;
    if (d.dueDate <= today) expectedByToday += 1;
    if (status === "overdue") {
      overdue += 1;
      pending.push({ type: "deliverable", ref: d.id, date: d.dueDate, title: d.title });
    }
    bump(phaseOfWeek.get(d.weekId), delivered);
    deliverables[d.id] = { status, submission: sub?.status ?? null };
  }

  pending.sort((a, b) => a.date.localeCompare(b.date) || a.type.localeCompare(b.type));

  let streak = 0;
  for (let i = workshopTimeline.length - 1; i >= 0; i--) {
    const item = workshopTimeline[i];
    if (item.done) streak += 1;
    else if (item.date === today) continue;
    else break;
  }

  const totalItems = workshops + plan.deliverables.length;
  const doneItems = workshopsDone + submitted;
  let pace: Pace;
  if (today < start) pace = "not_started";
  else if (doneItems === totalItems && totalItems > 0) pace = "finished";
  else pace = overdue > 0 ? "behind" : "on_track";

  const phases: PhaseProgress[] = plan.phases.map((p) => ({
    id: p.id,
    name: p.name,
    done: phaseTotals.get(p.id)?.done ?? 0,
    total: phaseTotals.get(p.id)?.total ?? 0,
  }));

  return {
    today,
    start,
    end,
    passScore,
    pace,
    totals: {
      workshops,
      workshopsDone,
      deliverables: plan.deliverables.length,
      deliverablesSubmitted: submitted,
      deliverablesApproved: approved,
      completion: totalItems ? doneItems / totalItems : 0,
      quizzesTaken,
      quizzesPassed,
      quizAverage: quizzesTaken ? scoreSum / quizzesTaken : null,
      firstTryAverage: quizzesTaken ? firstSum / quizzesTaken : null,
      streak,
      overdue,
      expectedByToday,
    },
    days,
    deliverables,
    phases,
    pending,
  };
}
