import { asc, count } from "drizzle-orm";
import {
  deliverableTitle,
  type DayKind,
  type DeliverableKind,
  type PlanResponse,
  type ProgressPlanInput,
} from "@tomas/shared";
import type { Database } from "../db/client";
import { days, deliverables, phases, questions, weeks } from "../db/schema";

export interface IndexedDay {
  date: string;
  weekId: string;
  kind: DayKind;
  title: string;
  taskCount: number;
  questionCount: number;
}

export interface IndexedWeek {
  id: string;
  number: number;
  phaseId: number;
  title: string;
  rangeLabel: string;
}

export interface IndexedDeliverable {
  id: string;
  weekId: string;
  dueDate: string;
  kind: DeliverableKind;
  path: string;
  title: string;
}

export interface PlanIndex {
  response: PlanResponse;
  progressInput: ProgressPlanInput;
  days: Map<string, IndexedDay>;
  weeks: Map<string, IndexedWeek>;
  phases: Map<number, { id: number; name: string }>;
  deliverables: Map<string, IndexedDeliverable>;
  deliverableByDate: Map<string, IndexedDeliverable>;
  /** Todas las fechas con algo en el calendario (talleres, festivos y entregables), ordenadas. */
  dates: string[];
}

/** Índice del plan en memoria. Se invalida cuando el administrador edita el contenido. */
export class PlanCache {
  private index: Promise<PlanIndex> | null = null;

  constructor(private readonly db: Database) {}

  get(): Promise<PlanIndex> {
    this.index ??= this.load().catch((err) => {
      this.index = null;
      throw err;
    });
    return this.index;
  }

  invalidate(): void {
    this.index = null;
  }

  private async load(): Promise<PlanIndex> {
    const [phaseRows, weekRows, dayRows, deliverableRows, questionCounts] = await Promise.all([
      this.db.select().from(phases).orderBy(asc(phases.id)),
      this.db.select().from(weeks).orderBy(asc(weeks.number)),
      this.db
        .select({ date: days.date, weekId: days.weekId, kind: days.kind, title: days.title, tasks: days.tasks, summary: days.summary, topics: days.topics })
        .from(days)
        .orderBy(asc(days.date)),
      this.db.select().from(deliverables),
      this.db.select({ date: questions.date, n: count() }).from(questions).groupBy(questions.date),
    ]);

    const qCount = new Map(questionCounts.map((q) => [q.date, Number(q.n)]));
    const weekMap = new Map<string, IndexedWeek>(weekRows.map((w) => [w.id, w]));
    const dayMap = new Map<string, IndexedDay>(
      dayRows.map((d) => [
        d.date,
        {
          date: d.date,
          weekId: d.weekId,
          kind: d.kind,
          title: d.title,
          taskCount: d.tasks.length,
          questionCount: qCount.get(d.date) ?? 0,
        },
      ]),
    );
    const deliverableMap = new Map<string, IndexedDeliverable>();
    const byDate = new Map<string, IndexedDeliverable>();
    for (const d of deliverableRows) {
      const week = weekMap.get(d.weekId);
      const item: IndexedDeliverable = {
        id: d.id,
        weekId: d.weekId,
        dueDate: d.dueDate,
        kind: d.kind as DeliverableKind,
        path: d.path,
        title: deliverableTitle(d.kind as DeliverableKind, week?.number ?? 0),
      };
      deliverableMap.set(d.id, item);
      byDate.set(d.dueDate, item);
    }

    const dates = [...new Set([...dayMap.keys(), ...byDate.keys()])].sort();
    const response: PlanResponse = {
      start: dates[0] ?? "",
      end: dates[dates.length - 1] ?? "",
      phases: phaseRows,
      weeks: weekRows.map((w) => {
        const deliverable = deliverableRows.find((d) => d.weekId === w.id);
        return {
          ...w,
          days: dayRows
            .filter((d) => d.weekId === w.id)
            .map((d) => ({ date: d.date, kind: d.kind, title: d.title, summary: d.summary, topics: d.topics.map((t) => t.title), taskCount: d.tasks.length })),
          deliverable: deliverable ? deliverableMap.get(deliverable.id)! : null,
        };
      }),
    };

    return {
      response,
      progressInput: {
        phases: phaseRows.map((p) => ({ id: p.id, name: p.name })),
        weeks: weekRows.map((w) => ({ id: w.id, phaseId: w.phaseId })),
        days: [...dayMap.values()],
        deliverables: [...deliverableMap.values()].map((d) => ({
          id: d.id,
          weekId: d.weekId,
          dueDate: d.dueDate,
          title: d.title,
        })),
      },
      days: dayMap,
      weeks: weekMap,
      phases: new Map(phaseRows.map((p) => [p.id, { id: p.id, name: p.name }])),
      deliverables: deliverableMap,
      deliverableByDate: byDate,
      dates,
    };
  }
}
