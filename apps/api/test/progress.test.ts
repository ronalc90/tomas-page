import { describe, expect, it } from "vitest";
import { addDays, computeProgress, isIsoDate, mondayOf, todayIn, type ProgressPlanInput } from "@tomas/shared";

const plan: ProgressPlanInput = {
  phases: [{ id: 1, name: "Fundamentos" }],
  weeks: [{ id: "s01", phaseId: 1 }],
  days: [
    { date: "2026-10-05", weekId: "s01", kind: "workshop", title: "Lunes", taskCount: 3, questionCount: 4 },
    { date: "2026-10-06", weekId: "s01", kind: "workshop", title: "Martes", taskCount: 3, questionCount: 4 },
    { date: "2026-10-07", weekId: "s01", kind: "holiday", title: "Festivo", taskCount: 0, questionCount: 0 },
    { date: "2026-10-08", weekId: "s01", kind: "workshop", title: "Jueves", taskCount: 3, questionCount: 4 },
  ],
  deliverables: [{ id: "s01", weekId: "s01", dueDate: "2026-10-10", title: "Entregable" }],
};

const done = { tasks: [true, true, true], completedAt: "x", hasEvidence: false };

describe("computeProgress", () => {
  it("calcula estados, atrasos y racha", () => {
    const p = computeProgress(
      plan,
      {
        days: { "2026-10-05": done, "2026-10-06": done, "2026-10-08": { tasks: [true], completedAt: null, hasEvidence: false } },
        quizzes: { "2026-10-05": { attempts: 2, best: 4, first: 2 }, "2026-10-06": { attempts: 1, best: 3, first: 3 } },
        submissions: {},
      },
      "2026-10-08",
      3,
    );
    expect(p.days["2026-10-05"].status).toBe("done");
    expect(p.days["2026-10-07"].status).toBe("rest");
    expect(p.days["2026-10-08"].status).toBe("in_progress");
    expect(p.totals.streak).toBe(2);
    expect(p.totals.workshopsDone).toBe(2);
    expect(p.totals.quizAverage).toBeCloseTo((1 + 0.75) / 2);
    expect(p.totals.firstTryAverage).toBeCloseTo((0.5 + 0.75) / 2);
    expect(p.pace).toBe("on_track");
    expect(p.phases[0]).toEqual({ id: 1, name: "Fundamentos", done: 2, total: 4 });
  });

  it("no completa un taller si la nota no alcanza el mínimo", () => {
    const p = computeProgress(
      plan,
      { days: { "2026-10-05": done }, quizzes: { "2026-10-05": { attempts: 1, best: 2, first: 2 } }, submissions: {} },
      "2026-10-06",
      3,
    );
    expect(p.days["2026-10-05"].status).toBe("overdue");
    expect(p.pace).toBe("behind");
    expect(p.pending.map((x) => x.ref)).toEqual(["2026-10-05"]);
  });

  it("cuenta entregables enviados y aprobados", () => {
    const p = computeProgress(plan, { days: {}, quizzes: {}, submissions: { s01: { status: "approved", touched: true } } }, "2026-10-12", 3);
    expect(p.deliverables.s01.status).toBe("done");
    expect(p.totals.deliverablesApproved).toBe(1);
    const changes = computeProgress(plan, { days: {}, quizzes: {}, submissions: { s01: { status: "changes_requested", touched: true } } }, "2026-10-09", 3);
    expect(changes.deliverables.s01.status).toBe("in_progress");
  });

  it("reconoce cuándo el plan no ha empezado y cuándo terminó", () => {
    const empty = { days: {}, quizzes: {}, submissions: {} };
    expect(computeProgress(plan, empty, "2026-09-01", 3).pace).toBe("not_started");
    const all = computeProgress(
      plan,
      {
        days: { "2026-10-05": done, "2026-10-06": done, "2026-10-08": done },
        quizzes: {
          "2026-10-05": { attempts: 1, best: 4, first: 4 },
          "2026-10-06": { attempts: 1, best: 4, first: 4 },
          "2026-10-08": { attempts: 1, best: 4, first: 4 },
        },
        submissions: { s01: { status: "submitted", touched: true } },
      },
      "2026-12-31",
      3,
    );
    expect(all.pace).toBe("finished");
    expect(all.totals.completion).toBe(1);
  });
});

describe("fechas", () => {
  it("usa la zona horaria de Costa Rica para decidir qué día es hoy", () => {
    // 2026-10-01 05:00 UTC es todavía 30 de septiembre en Costa Rica (UTC-6).
    expect(todayIn("America/Costa_Rica", new Date("2026-10-01T05:00:00Z"))).toBe("2026-09-30");
    expect(todayIn("America/Costa_Rica", new Date("2026-10-01T07:00:00Z"))).toBe("2026-10-01");
  });

  it("suma días, calcula lunes y valida fechas", () => {
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
    expect(mondayOf("2026-10-04")).toBe("2026-09-28");
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("2026-12-31")).toBe(true);
  });
});
