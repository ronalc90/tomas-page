import { beforeAll, describe, expect, it } from "vitest";
import type { AdminDay, AdminOverview, ReviewQueueItem, StudentDetail, UserRow } from "@tomas/shared";
import { ADMIN, client, login, STUDENT, useTestApp } from "./helpers";

const env = useTestApp("2026-10-05");
let admin: ReturnType<typeof client>;
let student: ReturnType<typeof client>;
let studentId: string;

beforeAll(async () => {
  admin = client(env.app, await login(env.app, ADMIN.username, ADMIN.password));
  student = client(env.app, await login(env.app, STUDENT.username, STUDENT.password));
  studentId = (await student.get("/api/auth/me")).json().user.id;
  await student.put("/api/deliverables/s00", { criteria: [true, true, true], evidence: "hola.py listo" });
  await student.post("/api/deliverables/s00/submit");
});

describe("resumen y estudiantes", () => {
  it("muestra el resumen con estudiantes, revisiones pendientes y actividad", async () => {
    const res = await admin.get("/api/admin/overview");
    expect(res.statusCode).toBe(200);
    const overview: AdminOverview = res.json();
    expect(overview.students).toHaveLength(1);
    expect(overview.students[0]).toMatchObject({ username: "tomas", pace: "behind" });
    expect(overview.pendingReviews).toBe(1);
    expect(overview.activity.some((a) => a.type === "submission_submitted")).toBe(true);
    expect(overview.weeklyActivity.length).toBeGreaterThan(0);
  });

  it("muestra el detalle de un estudiante", async () => {
    const detail: StudentDetail = (await admin.get(`/api/admin/students/${studentId}`)).json();
    expect(detail.student.username).toBe("tomas");
    expect(detail.days).toHaveLength(62);
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

describe("contenido", () => {
  const DATE = "2026-10-05";

  it("devuelve el taller con las respuestas correctas para editar", async () => {
    const day: AdminDay = (await admin.get(`/api/admin/days/${DATE}`)).json();
    expect(day.questions).toHaveLength(4);
    expect(typeof day.questions[0].correctIndex).toBe("number");
  });

  it("valida las preguntas antes de guardar", async () => {
    const day: AdminDay = (await admin.get(`/api/admin/days/${DATE}`)).json();
    const res = await admin.put(`/api/admin/days/${DATE}`, {
      ...day,
      questions: [{ ...day.questions[0], correctIndex: 7 }],
    });
    expect(res.statusCode).toBe(400);
  });

  it("guarda los cambios y el estudiante los ve", async () => {
    const day: AdminDay = (await admin.get(`/api/admin/days/${DATE}`)).json();
    const res = await admin.put(`/api/admin/days/${DATE}`, {
      ...day,
      title: "if, else y comparaciones (editado)",
      tasks: [...day.tasks, "Tarea extra de práctica."],
    });
    expect(res.statusCode).toBe(200);
    const seen = (await student.get(`/api/days/${DATE}`)).json();
    expect(seen.day.title).toBe("if, else y comparaciones (editado)");
    expect(seen.day.tasks).toHaveLength(4);
    const plan = (await student.get("/api/plan")).json();
    const planDay = plan.weeks.flatMap((w: { days: { date: string; title: string }[] }) => w.days).find((d: { date: string }) => d.date === DATE);
    expect(planDay.title).toBe("if, else y comparaciones (editado)");
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
