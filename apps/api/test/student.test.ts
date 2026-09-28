import { beforeAll, describe, expect, it } from "vitest";
import type { DayResponse, DeliverableView, ProgressView, QuizResult } from "@tomas/shared";
import { client, correctAnswers, login, STUDENT, useTestApp } from "./helpers";

const env = useTestApp("2026-10-01");
let api: ReturnType<typeof client>;

beforeAll(async () => {
  api = client(env.app, await login(env.app, STUDENT.username, STUDENT.password));
});

describe("plan y avance", () => {
  it("entrega el plan completo: 15 semanas, 62 talleres y 15 entregables", async () => {
    const plan = (await api.get("/api/plan")).json();
    expect(plan.weeks).toHaveLength(15);
    const workshops = plan.weeks.flatMap((w: { days: { kind: string }[] }) => w.days).filter((d: { kind: string }) => d.kind === "workshop");
    expect(workshops).toHaveLength(62);
    expect(plan.weeks.filter((w: { deliverable: unknown }) => w.deliverable)).toHaveLength(15);
    expect(plan.start).toBe("2026-09-27");
    expect(plan.end).toBe("2026-12-30");
  });

  it("marca como atrasado lo que ya pasó y no está hecho", async () => {
    const progress: ProgressView = (await api.get("/api/progress")).json();
    expect(progress.today).toBe("2026-10-01");
    expect(progress.days["2026-09-28"].status).toBe("overdue");
    expect(progress.days["2026-10-01"].status).toBe("pending");
    expect(progress.days["2026-10-12"].status).toBe("rest");
    expect(progress.deliverables["s00"].status).toBe("overdue");
    expect(progress.pace).toBe("behind");
  });
});

describe("taller del día", () => {
  const DATE = "2026-09-29";

  it("no envía las respuestas correctas antes de presentar la evaluación", async () => {
    const res = await api.get(`/api/days/${DATE}`);
    expect(res.statusCode).toBe(200);
    const day: DayResponse = res.json();
    expect(day.day?.title).toBe("Números y operadores");
    expect(day.day?.tip).toContain("`//` da la parte entera");
    expect(day.questions).toHaveLength(4);
    expect(res.body).not.toContain("correctIndex");
    expect(res.body).not.toContain("explanation");
    expect(day.quiz.last).toBeNull();
    expect(day.nav).toEqual({ prev: "2026-09-28", next: "2026-09-30" });
  });

  it("valida la cantidad de tareas", async () => {
    const res = await api.put(`/api/days/${DATE}/progress`, { tasks: [true] });
    expect(res.statusCode).toBe(400);
  });

  it("no da el taller por completo solo con las tareas", async () => {
    const res = await api.put(`/api/days/${DATE}/progress`, { tasks: [true, true, true], evidence: "print(2 ** 10)" });
    expect(res.statusCode).toBe(200);
    expect(res.json().state).toMatchObject({ tasksDone: 3, status: "overdue" });
  });

  it("califica en el servidor, guarda la mejor nota y explica cada respuesta", async () => {
    const correct = await correctAnswers(env, DATE);
    const wrong = correct.map((c) => (c + 1) % 4);

    const first: QuizResult = (await api.post(`/api/days/${DATE}/quiz`, { answers: wrong })).json();
    expect(first).toMatchObject({ score: 0, total: 4, passed: false, attempts: 1, best: 0 });
    expect(first.review.every((r) => !r.isCorrect && r.explanation.length > 0)).toBe(true);

    const second: QuizResult = (await api.post(`/api/days/${DATE}/quiz`, { answers: correct })).json();
    expect(second).toMatchObject({ score: 4, passed: true, attempts: 2, best: 4 });

    const third: QuizResult = (await api.post(`/api/days/${DATE}/quiz`, { answers: wrong })).json();
    expect(third).toMatchObject({ score: 0, passed: false, attempts: 3, best: 4 });
  });

  it("rechaza respuestas incompletas o fuera de rango", async () => {
    expect((await api.post(`/api/days/${DATE}/quiz`, { answers: [0, 1] })).statusCode).toBe(400);
    expect((await api.post(`/api/days/${DATE}/quiz`, { answers: [0, 1, 2, 9] })).statusCode).toBe(400);
  });

  it("da el taller por completo con tareas y evaluación aprobada", async () => {
    const day: DayResponse = (await api.get(`/api/days/${DATE}`)).json();
    expect(day.state.status).toBe("done");
    expect(day.progress.completedAt).not.toBeNull();
    expect(day.quiz.last?.review).toHaveLength(4);
    const progress: ProgressView = (await api.get("/api/progress")).json();
    expect(progress.totals.workshopsDone).toBe(1);
    expect(progress.totals.quizAverage).toBe(1);
    expect(progress.totals.firstTryAverage).toBe(0);
  });

  it("vuelve a abrir el taller si se desmarca una tarea", async () => {
    await api.put(`/api/days/${DATE}/progress`, { tasks: [true, false, true] });
    const day: DayResponse = (await api.get(`/api/days/${DATE}`)).json();
    expect(day.state.status).toBe("overdue");
    expect(day.progress.completedAt).toBeNull();
    await api.put(`/api/days/${DATE}/progress`, { tasks: [true, true, true] });
  });

  it("responde 404 para fechas fuera del plan o inválidas", async () => {
    expect((await api.get("/api/days/2030-01-01")).statusCode).toBe(404);
    expect((await api.get("/api/days/no-es-fecha")).statusCode).toBe(404);
    expect((await api.put("/api/days/2026-10-12/progress", { tasks: [] })).statusCode).toBe(404);
  });

  it("muestra el entregable en su fecha aunque no haya taller", async () => {
    const day: DayResponse = (await api.get("/api/days/2026-10-03")).json();
    expect(day.day).toBeNull();
    expect(day.deliverable?.title).toBe("Entregable de la semana 1");
  });
});

describe("entregables", () => {
  const ID = "s01";

  it("no deja enviar sin criterios ni evidencia", async () => {
    await api.put(`/api/deliverables/${ID}`, { criteria: [true, false, false, false] });
    const res = await api.post(`/api/deliverables/${ID}/submit`);
    expect(res.statusCode).toBe(400);
  });

  it("envía cuando todo está completo y bloquea la edición", async () => {
    await api.put(`/api/deliverables/${ID}`, { criteria: [true, true, true, true], evidence: "https://github.com/tomas/curso" });
    const sent = await api.post(`/api/deliverables/${ID}/submit`);
    expect(sent.statusCode).toBe(200);
    const view: DeliverableView = sent.json();
    expect(view.submission?.status).toBe("submitted");
    expect(view.state.status).toBe("done");
    expect((await api.put(`/api/deliverables/${ID}`, { evidence: "otra" })).statusCode).toBe(409);
  });

  it("permite retirarlo mientras no esté aprobado", async () => {
    const res = await api.post(`/api/deliverables/${ID}/withdraw`);
    expect(res.statusCode).toBe(200);
    expect(res.json().submission.status).toBe("draft");
    expect((await api.post(`/api/deliverables/${ID}/submit`)).statusCode).toBe(200);
  });

  it("lista todos los entregables con su estado", async () => {
    const list: DeliverableView[] = (await api.get("/api/deliverables")).json();
    expect(list).toHaveLength(15);
    expect(list.find((d) => d.id === ID)?.submission?.status).toBe("submitted");
    expect(list.at(-1)?.kind).toBe("final");
  });
});
