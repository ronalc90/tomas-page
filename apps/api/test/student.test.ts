import { beforeAll, describe, expect, it } from "vitest";
import type { DayResponse, DeliverableView, ExerciseCheckResult, ProgressView, QuizResult } from "@tomas/shared";
import { client, correctAnswers, login, solutionOf, STUDENT, useTestApp, wrongAnswers } from "./helpers";

const env = useTestApp("2026-10-14");
let api: ReturnType<typeof client>;

beforeAll(async () => {
  api = client(env.app, await login(env.app, STUDENT.username, STUDENT.password));
});

async function solve(id: string) {
  const res = await api.post(`/api/exercises/${id}/check`, { sql: await solutionOf(env, id) });
  expect(res.statusCode).toBe(200);
  const result: ExerciseCheckResult = res.json();
  expect(result.correct, `${id}: ${result.message} ${result.error ?? ""}`).toBe(true);
  return result;
}

describe("plan y avance", () => {
  it("entrega el plan con semanas, talleres, festivos y entregables", async () => {
    const plan = (await api.get("/api/plan")).json();
    expect(plan.weeks).toHaveLength(2);
    const allDays = plan.weeks.flatMap((w: { days: { kind: string; exerciseCount: number }[] }) => w.days);
    expect(allDays.filter((d: { kind: string }) => d.kind === "workshop")).toHaveLength(5);
    expect(allDays[0].exerciseCount).toBe(3);
    expect(plan.weeks.filter((w: { deliverable: unknown }) => w.deliverable)).toHaveLength(2);
    expect(plan.start).toBe("2026-10-13");
    expect(plan.end).toBe("2026-10-24");
  });

  it("marca como atrasado lo que ya pasó y no está hecho", async () => {
    const progress: ProgressView = (await api.get("/api/progress")).json();
    expect(progress.today).toBe("2026-10-14");
    expect(progress.days["2026-10-13"]).toMatchObject({ status: "overdue", exercisesDone: 0, exercisesTotal: 3 });
    expect(progress.days["2026-10-14"].status).toBe("pending");
    expect(progress.days["2026-10-16"].status).toBe("rest");
    expect(progress.deliverables["s01"]).toMatchObject({ status: "pending", exercisesTotal: 2 });
    expect(progress.totals).toMatchObject({ exercisesSolved: 0, exercisesTotal: 9, studyMinutes: 0 });
    expect(progress.pace).toBe("behind");
  });
});

describe("taller del día", () => {
  const DATE = "2026-10-14";

  it("no envía las respuestas ni las soluciones antes de tiempo", async () => {
    const res = await api.get(`/api/days/${DATE}`);
    expect(res.statusCode).toBe(200);
    const day: DayResponse = res.json();
    expect(day.day?.title).toBe("Filtrar con WHERE");
    expect(day.day?.topics.map((t) => t.title)).toEqual(["WHERE", "AND y OR"]);
    expect(day.questions).toHaveLength(4);
    expect(day.questions.every((q) => q.hint.length > 0)).toBe(true);
    expect(res.body).not.toContain("correctIndex");
    expect(res.body).not.toContain("accepted");
    expect(res.body).not.toContain("explanation");
    expect(res.body).not.toContain("WHERE provincia_id = 4");
    expect(day.exercises.map((e) => e.id)).toEqual(["2026-10-14-1", "2026-10-14-2"]);
    expect(day.exercises[0]).toMatchObject({ solution: null, expectedRowCount: 8, state: { attempts: 0, solved: false, lastSql: null } });
    expect(day.exercises[0].expected?.columns).toEqual(["nombre", "apellido"]);
    expect(day.day?.taskHints).toHaveLength(day.day?.tasks.length ?? 0);
    expect(day.quiz.last).toBeNull();
    expect(day.nav).toEqual({ prev: "2026-10-13", next: "2026-10-15" });
  });

  it("valida la cantidad de tareas", async () => {
    const res = await api.put(`/api/days/${DATE}/progress`, { tasks: [true] });
    expect(res.statusCode).toBe(400);
  });

  it("califica la evaluación en el servidor y guarda la mejor nota", async () => {
    const correct = await correctAnswers(env, DATE);
    const wrong = wrongAnswers(correct);
    const first: QuizResult = (await api.post(`/api/days/${DATE}/quiz`, { answers: wrong, hints: [0, 2, 2] })).json();
    expect(first).toMatchObject({ score: 0, total: 4, passed: false, attempts: 1, best: 0, hintsUsed: [0, 2] });
    expect(first.review.every((r) => !r.isCorrect && r.explanation.length > 0)).toBe(true);
    const relaxed = correct.map((c) => (typeof c === "string" ? ` ${c.toUpperCase()} ` : c));
    const second: QuizResult = (await api.post(`/api/days/${DATE}/quiz`, { answers: relaxed })).json();
    expect(second).toMatchObject({ score: 4, passed: true, attempts: 2, best: 4 });
  });

  it("rechaza respuestas incompletas o del tipo equivocado", async () => {
    expect((await api.post(`/api/days/${DATE}/quiz`, { answers: [0, 1] })).statusCode).toBe(400);
    expect((await api.post(`/api/days/${DATE}/quiz`, { answers: [0, 1, 2, 3] })).statusCode).toBe(400);
  });

  it("no da el taller por completo con tareas y evaluación si faltan ejercicios", async () => {
    const res = await api.put(`/api/days/${DATE}/progress`, { tasks: [true, true], evidence: "WHERE filtra filas" });
    expect(res.statusCode).toBe(200);
    expect(res.json().state).toMatchObject({ tasksDone: 2, exercisesDone: 0, exercisesTotal: 2, status: "in_progress" });
  });

  it("lo completa al resolver todos los ejercicios", async () => {
    await solve("2026-10-14-1");
    let day: DayResponse = (await api.get(`/api/days/${DATE}`)).json();
    expect(day.state).toMatchObject({ status: "in_progress", exercisesDone: 1 });
    await solve("2026-10-14-2");
    day = (await api.get(`/api/days/${DATE}`)).json();
    expect(day.state).toMatchObject({ status: "done", exercisesDone: 2 });
    expect(day.progress.completedAt).not.toBeNull();
    expect(day.exercises[0].state).toMatchObject({ solved: true, attempts: 1 });
    expect(day.exercises[0].solution).toContain("provincia_id = 4");
    expect(day.exercises[0].state.lastSql).toContain("provincia_id = 4");
    const progress: ProgressView = (await api.get("/api/progress")).json();
    expect(progress.totals).toMatchObject({ workshopsDone: 1, exercisesSolved: 2 });
  });

  it("vuelve a abrir el taller si se desmarca una tarea", async () => {
    await api.put(`/api/days/${DATE}/progress`, { tasks: [true, false] });
    const day: DayResponse = (await api.get(`/api/days/${DATE}`)).json();
    expect(day.state.status).toBe("in_progress");
    expect(day.progress.completedAt).toBeNull();
    await api.put(`/api/days/${DATE}/progress`, { tasks: [true, true] });
  });

  it("un taller sin tareas se completa con ejercicios y evaluación", async () => {
    const date = "2026-10-13";
    const day: DayResponse = (await api.get(`/api/days/${date}`)).json();
    expect(day.day?.tasks).toEqual([]);
    expect(day.progress.tasks).toEqual([]);
    for (const e of day.exercises) await solve(e.id);
    await api.post(`/api/days/${date}/quiz`, { answers: await correctAnswers(env, date) });
    const after: DayResponse = (await api.get(`/api/days/${date}`)).json();
    expect(after.state).toMatchObject({ status: "done", exercisesDone: 3, exercisesTotal: 3, tasksTotal: 0 });
  });

  it("responde 404 para fechas fuera del plan o inválidas", async () => {
    expect((await api.get("/api/days/2030-01-01")).statusCode).toBe(404);
    expect((await api.get("/api/days/no-es-fecha")).statusCode).toBe(404);
    expect((await api.put("/api/days/2026-10-16/progress", { tasks: [] })).statusCode).toBe(404);
  });

  it("muestra el entregable en su fecha aunque no haya taller", async () => {
    const day: DayResponse = (await api.get("/api/days/2026-10-17")).json();
    expect(day.day).toBeNull();
    expect(day.exercises).toEqual([]);
    expect(day.deliverable?.title).toBe("Entregable de la semana 1");
    expect(day.deliverable?.exercises.map((e) => e.id)).toEqual(["s01-1", "s01-2"]);
  });
});

describe("entregables", () => {
  const ID = "s01";

  it("no deja enviar sin criterios ni evidencia", async () => {
    await api.put(`/api/deliverables/${ID}`, { criteria: [true, false, false] });
    const res = await api.post(`/api/deliverables/${ID}/submit`);
    expect(res.statusCode).toBe(400);
  });

  it("no deja enviar mientras falten ejercicios por resolver", async () => {
    await api.put(`/api/deliverables/${ID}`, { criteria: [true, true, true], evidence: "Conclusión: hay 7 provincias." });
    const res = await api.post(`/api/deliverables/${ID}/submit`);
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toBe("Resuelve los ejercicios del entregable antes de enviarlo: faltan 2 de 2.");
    await solve("s01-1");
    expect((await api.post(`/api/deliverables/${ID}/submit`)).json().message).toContain("falta 1 de 2");
  });

  it("envía cuando todo está completo y bloquea la edición", async () => {
    await solve("s01-2");
    const sent = await api.post(`/api/deliverables/${ID}/submit`);
    expect(sent.statusCode).toBe(200);
    const view: DeliverableView = sent.json();
    expect(view.submission?.status).toBe("submitted");
    expect(view.state).toMatchObject({ status: "done", exercisesDone: 2, exercisesTotal: 2 });
    expect((await api.put(`/api/deliverables/${ID}`, { evidence: "otra" })).statusCode).toBe(409);
  });

  it("permite retirarlo mientras no esté aprobado", async () => {
    const res = await api.post(`/api/deliverables/${ID}/withdraw`);
    expect(res.statusCode).toBe(200);
    expect(res.json().submission.status).toBe("draft");
    expect((await api.post(`/api/deliverables/${ID}/submit`)).statusCode).toBe(200);
  });

  it("lista todos los entregables con su estado y sus ejercicios", async () => {
    const list: DeliverableView[] = (await api.get("/api/deliverables")).json();
    expect(list).toHaveLength(2);
    expect(list[0].submission?.status).toBe("submitted");
    expect(list[0].exercises[1].solution).toContain("ORDER BY nombre");
    expect(list[1].exercises).toEqual([]);
  });
});
