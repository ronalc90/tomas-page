import { beforeAll, describe, expect, it } from "vitest";
import type { AdminDay, AdminOverview, ReviewQueueItem, StudentDetail, UserRow } from "@tomas/shared";
import { sql } from "drizzle-orm";
import { CONTENT_VERSION, loadPlan, syncContentVersion } from "../src/db/seed";
import { FIXTURE_PLAN } from "./fixture";
import { ADMIN, client, login, solutionOf, STUDENT, useTestApp } from "./helpers";

const env = useTestApp("2026-10-20");
let admin: ReturnType<typeof client>;
let student: ReturnType<typeof client>;
let studentId: string;

beforeAll(async () => {
  admin = client(env.app, await login(env.app, ADMIN.username, ADMIN.password));
  student = client(env.app, await login(env.app, STUDENT.username, STUDENT.password));
  studentId = (await student.get("/api/auth/me")).json().user.id;
  // Algo de avance: un ejercicio con dos intentos, otro con la solución vista, minutos de estudio y un entregable enviado.
  await student.post("/api/exercises/2026-10-13-1/check", { sql: "SELECT nombre FROM productos" });
  await student.post("/api/exercises/2026-10-13-1/check", { sql: await solutionOf(env, "2026-10-13-1") });
  for (let i = 0; i < 3; i++) await student.post("/api/exercises/2026-10-13-2/check", { sql: "SELECT 1, 2" });
  await student.post("/api/exercises/2026-10-13-2/reveal");
  await student.post("/api/activity/ping");
  await student.put("/api/deliverables/s02", { criteria: [true, true, true], evidence: "reporte.py listo" });
  await student.post("/api/deliverables/s02/submit");
  // Postgres guarda solved_at con now() (la hora real), pero la app corre con FAKE_TODAY = 2026-10-20 y el
  // resumen semanal solo llega hasta esa semana. Se fija dentro de ese día para que la prueba no dependa
  // de la fecha en que se ejecuta (desde el 26-10-2026 el ejercicio caía fuera de la ventana).
  await env.handle.db.execute(sql`UPDATE exercise_progress SET solved_at = '2026-10-20T12:00:00Z' WHERE solved_at IS NOT NULL`);
});

describe("resumen y estudiantes", () => {
  it("muestra el resumen con estudiantes, revisiones pendientes, actividad, ejercicios y minutos", async () => {
    const res = await admin.get("/api/admin/overview");
    expect(res.statusCode).toBe(200);
    const overview: AdminOverview = res.json();
    expect(overview.students.map((s) => s.username)).toEqual(["prueba", "tomas"]);
    const tomas = overview.students.find((s) => s.username === "tomas")!;
    expect(tomas).toMatchObject({ pace: "behind", weekMinutes: 1, displayName: "Tomás Sandí" });
    expect(tomas.totals).toMatchObject({ exercisesSolved: 1, exercisesTotal: 9, studyMinutes: 1 });
    expect(overview.pendingReviews).toBe(1);
    expect(overview.activity.some((a) => a.type === "submission_submitted")).toBe(true);
    expect(overview.activity.some((a) => a.type === "exercise_solved")).toBe(true);
    expect(overview.weeklyActivity.map((w) => w.week)).toEqual(["2026-10-12", "2026-10-19"]);
    const total = overview.weeklyActivity.reduce((a, w) => ({ exercises: a.exercises + w.exercises, minutes: a.minutes + w.minutes }), { exercises: 0, minutes: 0 });
    expect(total).toEqual({ exercises: 1, minutes: 1 });
  });

  it("muestra el detalle de un estudiante con sus ejercicios", async () => {
    const detail: StudentDetail = (await admin.get(`/api/admin/students/${studentId}`)).json();
    expect(detail.student.username).toBe("tomas");
    expect(detail.days).toHaveLength(5);
    const day = detail.days.find((d) => d.date === "2026-10-13")!;
    expect(day).toMatchObject({ exerciseAttempts: 5, solutionsRevealed: 1, state: { exercisesDone: 1, exercisesTotal: 3 } });
    expect(detail.days.find((d) => d.date === "2026-10-20")?.studyMinutes).toBe(1);
    expect(detail.exercises.map((e) => e.id)).toEqual(["2026-10-13-1", "2026-10-13-2"]);
    expect(detail.exercises[0]).toMatchObject({ title: "Catálogo básico", date: "2026-10-13", state: { attempts: 2, solved: true } });
    expect(detail.exercises[0].state.lastSql).toBe("SELECT nombre, precio FROM productos;");
    expect(detail.exercises[1].state).toMatchObject({ revealed: true, solved: false, lastSql: "SELECT 1, 2" });
    expect(detail.deliverables).toHaveLength(2);
    expect((await admin.get("/api/admin/students/no-existe")).statusCode).toBe(404);
  });
});

describe("revisión de entregables", () => {
  it("lista lo que está pendiente de revisar", async () => {
    const queue: ReviewQueueItem[] = (await admin.get("/api/admin/reviews")).json();
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({ deliverableId: "s02", userName: "Tomás Sandí", status: "submitted" });
  });

  it("exige comentarios al pedir cambios", async () => {
    const res = await admin.post(`/api/admin/reviews/${studentId}/s02`, { decision: "changes_requested", feedback: "" });
    expect(res.statusCode).toBe(400);
  });

  it("pide cambios, el estudiante corrige y reenvía, y luego se aprueba", async () => {
    const changes = await admin.post(`/api/admin/reviews/${studentId}/s02`, {
      decision: "changes_requested",
      feedback: "Agrega el total al final.",
    });
    expect(changes.statusCode).toBe(200);
    expect(changes.json().submission).toMatchObject({ status: "changes_requested", feedback: "Agrega el total al final." });

    const mine = (await student.get("/api/deliverables")).json().find((d: { id: string }) => d.id === "s02");
    expect(mine.submission.reviewerName).toBe("Administrador");
    expect((await student.put("/api/deliverables/s02", { evidence: "reporte.py con total" })).statusCode).toBe(200);
    expect((await student.post("/api/deliverables/s02/submit")).statusCode).toBe(200);

    const approved = await admin.post(`/api/admin/reviews/${studentId}/s02`, { decision: "approved", feedback: "Muy bien." });
    expect(approved.json().submission.status).toBe("approved");
    expect((await student.post("/api/deliverables/s02/withdraw")).statusCode).toBe(409);

    const progress = (await student.get("/api/progress")).json();
    expect(progress.totals.deliverablesApproved).toBe(1);
  });

  it("el detalle de la revisión trae los ejercicios del entregable con el último SQL del estudiante", async () => {
    await student.post("/api/exercises/s01-1/check", { sql: "SELECT count(*) FROM provincias" });
    const review = (await admin.get(`/api/admin/reviews/${studentId}/s01`)).json();
    expect(review.deliverable.exercises[0].state).toMatchObject({ solved: true, lastSql: "SELECT count(*) FROM provincias" });
  });
});

describe("versiones del contenido", () => {
  it("actualiza el contenido de una versión anterior sin borrar el avance y quita lo que ya no existe", async () => {
    const db = env.handle.db;
    await db.execute(sql`UPDATE settings SET value = '3'::jsonb WHERE key = 'contentVersion'`);
    await db.execute(sql`INSERT INTO settings (key, value) VALUES ('programName', '"Plan de Tomás · Python y SQL"'::jsonb) ON CONFLICT (key) DO UPDATE SET value = excluded.value`);
    await db.execute(sql`UPDATE days SET title = 'Título viejo', exercises = '[]'::jsonb WHERE date = '2026-10-14'`);
    // Una semana vieja que ya no está en el plan, con su entregable y un día.
    await db.execute(sql`INSERT INTO weeks (id, number, phase_id, title, range_label) VALUES ('s00', 0, 1, 'Vieja', '27 sep')`);
    await db.execute(sql`INSERT INTO days (date, week_id, kind, title) VALUES ('2026-09-28', 's00', 'workshop', 'Día viejo')`);
    await db.execute(sql`INSERT INTO deliverables (id, week_id, due_date, path, description) VALUES ('s00', 's00', '2026-09-27', 'x', 'y')`);
    const saved = await student.put("/api/days/2026-10-14/progress", { tasks: [true, false], evidence: "avance previo" });
    expect(saved.statusCode).toBe(200);

    const plan = loadPlan(FIXTURE_PLAN);
    expect(await syncContentVersion(db, plan, env.ctx.config.seed)).toBe(true);
    expect(await syncContentVersion(db, plan, env.ctx.config.seed)).toBe(false);
    env.ctx.plan.invalidate();
    await env.ctx.settings.update({});

    const day = (await student.get("/api/days/2026-10-14")).json();
    expect(day.day.title).toBe("Filtrar con WHERE");
    expect(day.exercises).toHaveLength(2);
    expect(day.progress.evidence).toBe("avance previo");
    expect(day.progress.tasks).toEqual([true, false]);
    const weeks = (await admin.get("/api/admin/content")).json() as { id: string }[];
    expect(weeks.map((w) => w.id)).toEqual(["s01", "s02"]);
    expect((await student.get("/api/days/2026-09-28")).statusCode).toBe(404);
    const me = (await student.get("/api/auth/me")).json();
    expect(me.settings.programName).toBe("Plan de Tomás Sandí · SQL y Python");
    const [{ value }] = (await db.execute<{ value: number }>(sql`SELECT value FROM settings WHERE key = 'contentVersion'`)).rows;
    expect(value).toBe(CONTENT_VERSION);
  });
});

describe("contenido", () => {
  const DATE = "2026-10-14";

  it("devuelve el taller con las respuestas correctas y los ejercicios completos para editar", async () => {
    const day: AdminDay = (await admin.get(`/api/admin/days/${DATE}`)).json();
    expect(day.questions).toHaveLength(4);
    expect(typeof day.questions[0].correctIndex).toBe("number");
    expect(day.questions[2].accepted.length).toBeGreaterThan(0);
    expect(day.exercises).toHaveLength(2);
    expect(day.exercises[0]).toMatchObject({ id: "2026-10-14-1", orderMatters: false, check: "", setup: "" });
    expect(day.exercises[0].solution).toContain("SELECT");
  });

  it("valida las preguntas antes de guardar", async () => {
    const day: AdminDay = (await admin.get(`/api/admin/days/${DATE}`)).json();
    expect((await admin.put(`/api/admin/days/${DATE}`, { ...day, questions: [{ ...day.questions[0], correctIndex: 7 }] })).statusCode).toBe(400);
    expect((await admin.put(`/api/admin/days/${DATE}`, { ...day, questions: [{ ...day.questions[2], accepted: [] }] })).statusCode).toBe(400);
  });

  it("valida los ejercicios: solución que corre, que devuelve filas e ids únicos en el plan", async () => {
    const day: AdminDay = (await admin.get(`/api/admin/days/${DATE}`)).json();
    const broken = await admin.put(`/api/admin/days/${DATE}`, { ...day, exercises: [{ ...day.exercises[0], solution: "SELECT nombres FROM productos" }] });
    expect(broken.statusCode).toBe(400);
    expect(broken.json().message).toContain("no such column");
    const noRows = await admin.put(`/api/admin/days/${DATE}`, { ...day, exercises: [{ ...day.exercises[0], solution: "SELECT nombre FROM productos WHERE 0" }] });
    expect(noRows.json().message).toContain("0 filas");
    const taken = await admin.put(`/api/admin/days/${DATE}`, { ...day, exercises: [{ ...day.exercises[0], id: "2026-10-13-1" }] });
    expect(taken.statusCode).toBe(400);
    expect(taken.json().message).toContain("ya lo usa otro ejercicio");
    const repeated = await admin.put(`/api/admin/days/${DATE}`, { ...day, exercises: [day.exercises[0], day.exercises[0]] });
    expect(repeated.statusCode).toBe(400);
  });

  it("edita un ejercicio y el estudiante ve el nuevo resultado esperado", async () => {
    const day: AdminDay = (await admin.get(`/api/admin/days/${DATE}`)).json();
    const res = await admin.put(`/api/admin/days/${DATE}`, {
      ...day,
      exercises: [
        { ...day.exercises[0], title: "Clientes de Cartago", prompt: "Muestra el nombre y el apellido de los clientes de Cartago (provincia 3).", solution: "SELECT nombre, apellido FROM clientes WHERE provincia_id = 3;" },
        day.exercises[1],
        { id: "2026-10-14-3", title: "Provincias", prompt: "Muestra el nombre de las provincias.", hint: "", solution: "SELECT nombre FROM provincias", check: "", setup: "", starter: "", orderMatters: false },
      ],
    });
    expect(res.statusCode, res.body).toBe(200);
    const seen = (await student.get(`/api/days/${DATE}`)).json();
    expect(seen.exercises).toHaveLength(3);
    expect(seen.exercises[0].title).toBe("Clientes de Cartago");
    expect(seen.exercises[2].expectedRowCount).toBe(7);
    const graded = (await student.post("/api/exercises/2026-10-14-1/check", { sql: "SELECT nombre, apellido FROM clientes WHERE provincia_id = 3" })).json();
    expect(graded.correct).toBe(true);
    const plan = (await student.get("/api/plan")).json();
    expect(plan.weeks[0].days[1].exerciseCount).toBe(3);
  });

  it("edita la lección completa y el estudiante la ve", async () => {
    const day: AdminDay = (await admin.get(`/api/admin/days/${DATE}`)).json();
    const res = await admin.put(`/api/admin/days/${DATE}`, {
      ...day,
      title: "WHERE (editado)",
      topics: [{ ...day.topics[0], tip: "Consejo editado por el administrador." }, day.topics[1]],
      tasks: [...day.tasks, "Tarea extra de práctica."],
      taskHints: [...day.taskHints, ""],
      challenge: { title: "Reto editado", description: "Haz algo.", hint: "Piensa.", solution: "SELECT 1;", language: "sql" },
    });
    expect(res.statusCode).toBe(200);
    const seen = (await student.get(`/api/days/${DATE}`)).json();
    expect(seen.day.title).toBe("WHERE (editado)");
    expect(seen.day.topics[0].tip).toBe("Consejo editado por el administrador.");
    expect(seen.day.tasks).toHaveLength(day.tasks.length + 1);
    expect(seen.day.challenge.title).toBe("Reto editado");
  });

  it("un taller necesita al menos una tarea o un ejercicio", async () => {
    const day: AdminDay = (await admin.get(`/api/admin/days/${DATE}`)).json();
    const res = await admin.put(`/api/admin/days/${DATE}`, { ...day, tasks: [], taskHints: [], exercises: [] });
    expect(res.statusCode).toBe(400);
  });

  it("edita los criterios y los ejercicios de un entregable", async () => {
    const weeks = (await admin.get("/api/admin/content")).json();
    const d = weeks[1].deliverable;
    const res = await admin.put("/api/admin/deliverables/s02", {
      path: "semana-02/reporte.py",
      description: "Calcula el total de ventas.",
      criteria: ["Suma bien", "Tiene pruebas"],
      exercises: [{ id: "s02-1", title: "Repaso", prompt: "Cuenta los productos.", hint: "", solution: "SELECT COUNT(*) FROM productos", check: "", setup: "", starter: "", orderMatters: false }],
    });
    expect(res.statusCode, res.body).toBe(200);
    expect(d.exercises).toEqual([]);
    const view = (await student.get("/api/deliverables")).json().find((x: { id: string }) => x.id === "s02");
    expect(view.criteria).toEqual(["Suma bien", "Tiene pruebas"]);
    expect(view.exercises[0]).toMatchObject({ id: "s02-1", expectedRowCount: 1 });
    // Sin `exercises`, los ejercicios no cambian.
    await admin.put("/api/admin/deliverables/s02", { path: "semana-02/reporte.py", description: "Otra descripción.", criteria: ["Suma bien"] });
    const again = (await student.get("/api/deliverables")).json().find((x: { id: string }) => x.id === "s02");
    expect(again.exercises).toHaveLength(1);
  });

  it("lista el contenido por semanas", async () => {
    const weeks = (await admin.get("/api/admin/content")).json();
    expect(weeks).toHaveLength(2);
    expect(weeks[0].days[0]).toMatchObject({ date: "2026-10-13", exerciseCount: 3, questionCount: 4 });
    expect(weeks[0].deliverable.exercises).toHaveLength(2);
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
    await admin.put("/api/admin/settings", { passScore: 5, programName: "Plan de Tomás Sandí · SQL y Python" });
    expect((await admin.put("/api/admin/settings", { passScore: 0, programName: "x" })).statusCode).toBe(400);
  });
});
