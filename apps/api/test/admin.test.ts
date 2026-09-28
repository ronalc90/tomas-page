import { beforeAll, describe, expect, it } from "vitest";
import type { AdminDay, AdminOverview, ReviewQueueItem, StudentDetail, UserRow } from "@tomas/shared";
import { sql } from "drizzle-orm";
import { syncContentVersion } from "../src/db/seed";
import { ADMIN, client, login, STUDENT, useTestApp } from "./helpers";

const env = useTestApp("2026-10-05");
let admin: ReturnType<typeof client>;
let student: ReturnType<typeof client>;
let studentId: string;

beforeAll(async () => {
  admin = client(env.app, await login(env.app, ADMIN.username, ADMIN.password));
  student = client(env.app, await login(env.app, STUDENT.username, STUDENT.password));
  studentId = (await student.get("/api/auth/me")).json().user.id;
  await student.put("/api/deliverables/s00", { criteria: [true, true, true, true], evidence: "hola.py listo" });
  await student.post("/api/deliverables/s00/submit");
});

describe("resumen y estudiantes", () => {
  it("muestra el resumen con estudiantes, revisiones pendientes y actividad", async () => {
    const res = await admin.get("/api/admin/overview");
    expect(res.statusCode).toBe(200);
    const overview: AdminOverview = res.json();
    expect(overview.students.map((s) => s.username)).toEqual(["prueba", "tomas"]);
    expect(overview.students.find((s) => s.username === "tomas")).toMatchObject({ pace: "behind" });
    expect(overview.pendingReviews).toBe(1);
    expect(overview.activity.some((a) => a.type === "submission_submitted")).toBe(true);
    expect(overview.weeklyActivity.length).toBeGreaterThan(0);
  });

  it("muestra el detalle de un estudiante", async () => {
    const detail: StudentDetail = (await admin.get(`/api/admin/students/${studentId}`)).json();
    expect(detail.student.username).toBe("tomas");
    expect(detail.days).toHaveLength(64);
    expect(detail.deliverables).toHaveLength(15);
    expect((await admin.get("/api/admin/students/no-existe")).statusCode).toBe(404);
  });
});

describe("revisión de entregables", () => {
  it("lista lo que está pendiente de revisar", async () => {
    const queue: ReviewQueueItem[] = (await admin.get("/api/admin/reviews")).json();
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({ deliverableId: "s00", userName: "Tomás", status: "submitted" });
  });

  it("exige comentarios al pedir cambios", async () => {
    const res = await admin.post(`/api/admin/reviews/${studentId}/s00`, { decision: "changes_requested", feedback: "" });
    expect(res.statusCode).toBe(400);
  });

  it("pide cambios, el estudiante corrige y reenvía, y luego se aprueba", async () => {
    const changes = await admin.post(`/api/admin/reviews/${studentId}/s00`, {
      decision: "changes_requested",
      feedback: "Agrega tu edad al programa.",
    });
    expect(changes.statusCode).toBe(200);
    expect(changes.json().submission).toMatchObject({ status: "changes_requested", feedback: "Agrega tu edad al programa." });

    const mine = (await student.get("/api/deliverables")).json().find((d: { id: string }) => d.id === "s00");
    expect(mine.submission.reviewerName).toBe("Administrador");
    expect((await student.put("/api/deliverables/s00", { evidence: "hola.py con edad" })).statusCode).toBe(200);
    expect((await student.post("/api/deliverables/s00/submit")).statusCode).toBe(200);

    const approved = await admin.post(`/api/admin/reviews/${studentId}/s00`, { decision: "approved", feedback: "Muy bien." });
    expect(approved.json().submission.status).toBe("approved");
    expect((await student.post("/api/deliverables/s00/withdraw")).statusCode).toBe(409);

    const progress = (await student.get("/api/progress")).json();
    expect(progress.totals.deliverablesApproved).toBe(1);
  });
});

describe("lecciones completas", () => {
  it("todos los talleres traen dos temas, agenda de unas 4 horas, pistas, reto y 8 preguntas", async () => {
    const weeks = (await admin.get("/api/admin/content")).json() as { days: { date: string; kind: string }[] }[];
    const workshops = weeks.flatMap((w) => w.days).filter((d) => d.kind === "workshop");
    expect(workshops).toHaveLength(64);
    for (const d of workshops) {
      const day: AdminDay = (await admin.get(`/api/admin/days/${d.date}`)).json();
      expect(day.topics.length, d.date).toBe(2);
      const minutes = day.schedule.reduce((a, b) => a + b.minutes, 0);
      expect(minutes, d.date).toBeGreaterThanOrEqual(220);
      expect(minutes, d.date).toBeLessThanOrEqual(260);
      expect(day.topics.every((t) => t.concept.length > 100 && t.steps.length >= 3 && t.commonErrors.length >= 2), d.date).toBe(true);
      expect(day.taskHints.length, d.date).toBe(day.tasks.length);
      expect(day.challenge?.solution.length, d.date).toBeGreaterThan(0);
      expect(day.questions.map((q) => q.type), d.date).toEqual(["choice", "choice", "choice", "boolean", "output", "output", "fill", "fill"]);
    }
  });

  it("actualiza el contenido de una versión anterior sin borrar el avance", async () => {
    // Simula una base con contenido viejo: marca la versión como anterior y cambia un título.
    await env.handle.db.execute(sql`UPDATE settings SET value = '2'::jsonb WHERE key = 'contentVersion'`);
    await env.handle.db.execute(sql`UPDATE settings SET value = '4'::jsonb WHERE key = 'passScore'`);
    await env.handle.db.execute(sql`UPDATE days SET title = 'Título viejo' WHERE date = '2026-10-06'`);
    const saved = await student.put("/api/days/2026-10-06/progress", { tasks: [true, true, false, false, false], evidence: "avance previo" });
    expect(saved.statusCode).toBe(200);
    expect(await syncContentVersion(env.handle.db)).toBe(true);
    expect(await syncContentVersion(env.handle.db)).toBe(false);
    const day = (await student.get("/api/days/2026-10-06")).json();
    expect(day.day.title).toBe("for y range");
    expect(day.progress.evidence).toBe("avance previo");
    expect(day.progress.tasks).toEqual([true, true, false, false, false]);
    await env.ctx.settings.update({});
    expect((await student.get("/api/auth/me")).json().settings.passScore).toBe(5);
    await env.ctx.settings.update({ passScore: 5 });
  });
});

describe("contenido", () => {
  const DATE = "2026-10-05";

  it("devuelve el taller con las respuestas correctas para editar", async () => {
    const day: AdminDay = (await admin.get(`/api/admin/days/${DATE}`)).json();
    expect(day.questions).toHaveLength(8);
    expect(typeof day.questions[0].correctIndex).toBe("number");
    expect(day.questions[4].accepted.length).toBeGreaterThan(0);
    expect(day.questions[0].optionFeedback).toHaveLength(day.questions[0].options.length);
  });

  it("valida las preguntas antes de guardar", async () => {
    const day: AdminDay = (await admin.get(`/api/admin/days/${DATE}`)).json();
    const res = await admin.put(`/api/admin/days/${DATE}`, {
      ...day,
      questions: [{ ...day.questions[0], correctIndex: 7 }],
    });
    expect(res.statusCode).toBe(400);
    const noAnswer = await admin.put(`/api/admin/days/${DATE}`, { ...day, questions: [{ ...day.questions[4], accepted: [] }] });
    expect(noAnswer.statusCode).toBe(400);
    const noBlank = await admin.put(`/api/admin/days/${DATE}`, { ...day, questions: [{ ...day.questions[7], code: "sin hueco" }] });
    expect(noBlank.statusCode).toBe(400);
  });

  it("edita la lección completa: pasos, errores, pistas, reto y una pregunta de texto", async () => {
    const day: AdminDay = (await admin.get(`/api/admin/days/${DATE}`)).json();
    const res = await admin.put(`/api/admin/days/${DATE}`, {
      ...day,
      topics: [
        {
          ...day.topics[0],
          tip: "Consejo editado por el administrador.",
          steps: [{ title: "Paso editado", body: "Cuerpo del paso.", code: "print(1)", language: "python" }],
          commonErrors: [{ error: "NameError", cause: "Variable sin definir.", fix: "Defínela antes." }],
        },
        day.topics[1],
      ],
      schedule: [{ label: "Tema 1", minutes: 120 }, { label: "Tema 2", minutes: 120 }],
      taskHints: day.tasks.map((_, i) => `Pista ${i + 1}`),
      challenge: { title: "Reto editado", description: "Haz algo.", hint: "Piensa.", solution: "print(2)", language: "python" },
      questions: [
        ...day.questions.slice(0, 7),
        { type: "fill", prompt: "Completa", code: "x = ____(3.7)", options: [], correctIndex: 0, accepted: ["int", "round"], optionFeedback: [], explanation: "int o round.", hint: "" },
      ],
    });
    expect(res.statusCode).toBe(200);
    const seen = (await student.get(`/api/days/${DATE}`)).json();
    expect(seen.day.topics[0].steps).toHaveLength(1);
    expect(seen.day.topics[0].tip).toBe("Consejo editado por el administrador.");
    expect(seen.day.topics[1].steps.length).toBeGreaterThanOrEqual(3);
    expect(seen.day.schedule).toHaveLength(2);
    expect(seen.day.challenge.title).toBe("Reto editado");
    expect(seen.day.taskHints[0]).toBe("Pista 1");
    expect(seen.questions[7]).toMatchObject({ type: "fill", prompt: "Completa" });
    // Las preguntas de texto aceptan cualquiera de las respuestas.
    const answers = seen.questions.map((q: { type: string }, i: number) => (i === 7 ? "ROUND" : q.type === "output" || q.type === "fill" ? "" : 0));
    const graded = (await student.post(`/api/days/${DATE}/quiz`, { answers })).json();
    expect(graded.review[7].isCorrect).toBe(true);
  });

  it("guarda los cambios y el estudiante los ve", async () => {
    const day: AdminDay = (await admin.get(`/api/admin/days/${DATE}`)).json();
    const res = await admin.put(`/api/admin/days/${DATE}`, {
      ...day,
      title: "while (editado)",
      tasks: [...day.tasks, "Tarea extra de práctica."],
      taskHints: [...day.taskHints, ""],
    });
    expect(res.statusCode).toBe(200);
    const seen = (await student.get(`/api/days/${DATE}`)).json();
    expect(seen.day.title).toBe("while (editado)");
    expect(seen.day.tasks).toHaveLength(day.tasks.length + 1);
    const plan = (await student.get("/api/plan")).json();
    const planDay = plan.weeks.flatMap((w: { days: { date: string; title: string }[] }) => w.days).find((d: { date: string }) => d.date === DATE);
    expect(planDay.title).toBe("while (editado)");
  });

  it("edita los criterios de un entregable", async () => {
    const res = await admin.put("/api/admin/deliverables/s02", {
      path: "semana-02/parqueadero.py",
      description: "Calcula cuánto se paga en un parqueadero.",
      criteria: ["Cobra bien", "Tiene pruebas"],
    });
    expect(res.statusCode).toBe(200);
    const view = (await student.get("/api/deliverables")).json().find((d: { id: string }) => d.id === "s02");
    expect(view.criteria).toEqual(["Cobra bien", "Tiene pruebas"]);
  });

  it("lista el contenido por semanas", async () => {
    const weeks = (await admin.get("/api/admin/content")).json();
    expect(weeks).toHaveLength(15);
    expect(weeks[1].deliverable.criteria.length).toBeGreaterThan(0);
  });
});

describe("cuentas iniciales", () => {
  it("crea la cuenta de prueba cuando hay contraseña para ella", async () => {
    await login(env.app, "prueba", "prueba123");
  });
});

describe("usuarios y ajustes", () => {
  let newId: string;

  it("crea un estudiante y valida el nombre de usuario", async () => {
    expect((await admin.post("/api/admin/users", { username: "a b", displayName: "X", role: "student", password: "1234" })).statusCode).toBe(400);
    const res = await admin.post("/api/admin/users", {
      username: "Sofia",
      displayName: "Sofía",
      role: "student",
      password: "clave",
    });
    expect(res.statusCode).toBe(201);
    newId = res.json().id;
    expect(res.json().username).toBe("sofia");
    expect((await admin.post("/api/admin/users", { username: "sofia", displayName: "Otra", password: "1234" })).statusCode).toBe(409);
    await login(env.app, "sofia", "clave");
  });

  it("exige contraseñas largas para administradores", async () => {
    const res = await admin.post("/api/admin/users", { username: "jefe", displayName: "Jefe", role: "admin", password: "123456" });
    expect(res.statusCode).toBe(400);
  });

  it("restablece la contraseña y cierra las sesiones del usuario", async () => {
    const cookie = await login(env.app, "sofia", "clave");
    expect((await admin.post(`/api/admin/users/${newId}/password`, { password: "nueva" })).statusCode).toBe(200);
    expect((await client(env.app, cookie).get("/api/auth/me")).statusCode).toBe(204);
    await login(env.app, "sofia", "nueva");
  });

  it("desactiva un usuario y ya no puede entrar", async () => {
    const res = await admin.patch(`/api/admin/users/${newId}`, { active: false });
    expect(res.json().active).toBe(false);
    const attempt = await client(env.app).post("/api/auth/login", { username: "sofia", password: "nueva" });
    expect(attempt.statusCode).toBe(401);
  });

  it("no deja que el administrador se desactive a sí mismo", async () => {
    const users: UserRow[] = (await admin.get("/api/admin/users")).json();
    const me = users.find((u) => u.username === "admin")!;
    expect((await admin.patch(`/api/admin/users/${me.id}`, { active: false })).statusCode).toBe(409);
    expect((await admin.patch(`/api/admin/users/${me.id}`, { role: "student" })).statusCode).toBe(409);
  });

  it("cambia la nota mínima para aprobar y se refleja en el avance", async () => {
    const res = await admin.put("/api/admin/settings", { passScore: 4, programName: "Plan de Tomás" });
    expect(res.json()).toMatchObject({ passScore: 4, programName: "Plan de Tomás" });
    const me = (await student.get("/api/auth/me")).json();
    expect(me.settings.passScore).toBe(4);
    expect((await admin.put("/api/admin/settings", { passScore: 0, programName: "x" })).statusCode).toBe(400);
  });
});
