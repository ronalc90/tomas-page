import { sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import type { ActivityItem, ExerciseCheckResult, ProgressView } from "@tomas/shared";
import { ADMIN, client, login, STUDENT, useTestApp } from "./helpers";

const env = useTestApp("2026-10-13");
let api: ReturnType<typeof client>;

beforeAll(async () => {
  api = client(env.app, await login(env.app, STUDENT.username, STUDENT.password));
});

const check = async (id: string, query: string): Promise<ExerciseCheckResult> => {
  const res = await api.post(`/api/exercises/${id}/check`, { sql: query });
  expect(res.statusCode, res.body).toBe(200);
  return res.json();
};

describe("comprobar ejercicios SQL", () => {
  const CATALOG = "2026-10-13-1";

  it("pide sesión", async () => {
    const res = await client(env.app).post(`/api/exercises/${CATALOG}/check`, { sql: "SELECT 1" });
    expect(res.statusCode).toBe(401);
  });

  it("explica cuando sobran columnas y cuenta el intento", async () => {
    const r = await check(CATALOG, "SELECT nombre, precio, stock FROM productos;");
    expect(r).toMatchObject({ correct: false, message: "Tu consulta devuelve 3 columnas y se esperaban 2.", error: null, solution: null });
    expect(r.state).toMatchObject({ attempts: 1, solved: false, lastSql: "SELECT nombre, precio, stock FROM productos;" });
    expect(r.result?.columns).toEqual(["nombre", "precio", "stock"]);
    expect(r.resultRowCount).toBe(42);
  });

  it("explica en español un error de SQLite", async () => {
    const r = await check(CATALOG, "SELECT nombres FROM productos;");
    expect(r.correct).toBe(false);
    expect(r.error).toContain("La columna «nombres» no existe");
    expect(r.error).toContain("no such column: nombres");
    expect(r.state.attempts).toBe(2);
  });

  it("acepta la respuesta correcta aunque use alias y otro orden de filas", async () => {
    const r = await check(CATALOG, "-- mi consulta\nSELECT p.nombre AS producto, p.precio AS valor\nFROM productos p\nORDER BY p.precio;");
    expect(r).toMatchObject({ correct: true, message: "¡Correcto!" });
    expect(r.state).toMatchObject({ attempts: 3, solved: true });
    expect(r.state.solvedAt).not.toBeNull();
    expect(r.solution).toBe("SELECT nombre, precio FROM productos;");
  });

  it("un ejercicio resuelto sigue resuelto aunque una comprobación posterior falle", async () => {
    const r = await check(CATALOG, "SELECT nombre FROM productos;");
    expect(r.correct).toBe(false);
    expect(r.state).toMatchObject({ attempts: 4, solved: true });
    expect(r.solution).not.toBeNull();
  });

  it("exige el orden cuando el ejercicio lo pide", async () => {
    const r = await check(
      "2026-10-13-2",
      "SELECT * FROM (SELECT nombre, precio FROM productos ORDER BY precio DESC, nombre LIMIT 5) ORDER BY precio;",
    );
    expect(r).toMatchObject({ correct: false, message: "Las filas son correctas pero el orden no: revisa ORDER BY." });
    const ok = await check("2026-10-13-2", "SELECT nombre, precio FROM productos ORDER BY precio DESC, nombre LIMIT 5;");
    expect(ok.correct).toBe(true);
  });

  it("corre setup antes y check después en los ejercicios que modifican datos", async () => {
    const ex = "2026-10-13-3";
    const wrong = await check(ex, "INSERT INTO pendientes (nota) VALUES ('Revisar caja');");
    expect(wrong).toMatchObject({ correct: false, message: "Los valores no coinciden: revisa la fila 1." });
    expect(wrong.result).toEqual({ columns: ["nota"], rows: [["Revisar caja"]] });
    const twice = await check(ex, "INSERT INTO pendientes (nota) VALUES ('Revisar inventario');\nINSERT INTO pendientes (nota) VALUES ('Revisar inventario');");
    expect(twice.message).toBe("Devuelve 2 filas y se esperaban 1.");
    const dropped = await check(ex, "DROP TABLE pendientes;");
    expect(dropped.correct).toBe(false);
    expect(dropped.message).toContain("la comprobación falló");
    expect(dropped.error).toContain("no such table: pendientes");
    const ok = await check(ex, "insert into pendientes(nota) values ('Revisar inventario')");
    expect(ok.correct).toBe(true);
  });

  it("cada comprobación usa una copia limpia de la base", async () => {
    await check("2026-10-14-2", "DELETE FROM productos; SELECT nombre FROM productos WHERE precio < 5000;");
    const r = await check("2026-10-14-2", "SELECT nombre FROM productos WHERE precio < 5000;");
    expect(r.correct).toBe(true);
  });

  it("corta las consultas que tardan demasiado y sigue funcionando", async () => {
    const start = Date.now();
    const r = await check(
      "2026-10-14-1",
      "WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM n) SELECT count(*) FROM n;",
    );
    expect(Date.now() - start).toBeLessThan(8_000);
    expect(r.correct).toBe(false);
    expect(r.message).toContain("tardó demasiado");
    expect(r.state.attempts).toBe(1);
    const after = await check("2026-10-14-1", "SELECT nombre, apellido FROM clientes WHERE provincia_id = 4;");
    expect(after.correct).toBe(true);
  });

  it("limita el resultado a 1000 filas", async () => {
    const r = await check("2026-10-19-1", "SELECT a.nombre, b.nombre FROM productos a, productos b;");
    expect(r.correct).toBe(false);
    expect(r.message).toMatch(/^Devuelve más de 1.?000 filas y se esperaban 42\.$/);
  });

  it("valida el SQL recibido", async () => {
    expect((await api.post(`/api/exercises/${CATALOG}/check`, { sql: "   " })).statusCode).toBe(400);
    expect((await api.post(`/api/exercises/${CATALOG}/check`, { sql: "x".repeat(20_001) })).statusCode).toBe(400);
    expect((await api.post("/api/exercises/no-existe/check", { sql: "SELECT 1" })).statusCode).toBe(404);
  });
});

describe("ver la solución", () => {
  const EX = "2026-10-20-1";

  it("se habilita después de 3 intentos y queda registrado", async () => {
    expect((await api.post(`/api/exercises/${EX}/reveal`)).statusCode).toBe(409);
    for (let i = 0; i < 3; i++) await check(EX, "SELECT AVG(precio) FROM productos WHERE 0;");
    const res = await api.post(`/api/exercises/${EX}/reveal`);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ solution: "SELECT ROUND(AVG(precio), 2) FROM productos;", state: { revealed: true, attempts: 3, solved: false } });
    const day = (await api.get("/api/days/2026-10-20")).json();
    expect(day.exercises[0].solution).toContain("ROUND");

    const admin = client(env.app, await login(env.app, ADMIN.username, ADMIN.password));
    const activity: ActivityItem[] = (await admin.get("/api/admin/overview")).json().activity;
    expect(activity.some((a) => a.type === "solution_revealed" && a.ref === EX)).toBe(true);
    expect(activity.some((a) => a.type === "exercise_solved" && a.ref === "2026-10-13-1")).toBe(true);
  });

  it("también se puede ver después de resolver", async () => {
    const res = await api.post("/api/exercises/2026-10-13-1/reveal");
    expect(res.statusCode).toBe(200);
  });
});

describe("tiempo de estudio", () => {
  it("suma un minuto por ping, como máximo uno cada 50 segundos", async () => {
    const first = (await api.post("/api/activity/ping")).json();
    expect(first).toEqual({ counted: true, minutesToday: 1 });
    const second = (await api.post("/api/activity/ping")).json();
    expect(second).toEqual({ counted: false, minutesToday: 1 });
    // Simula que pasó un minuto.
    await env.handle.db.execute(sql`UPDATE study_time SET updated_at = now() - interval '61 seconds'`);
    const third = (await api.post("/api/activity/ping")).json();
    expect(third).toEqual({ counted: true, minutesToday: 2 });
    const progress: ProgressView = (await api.get("/api/progress")).json();
    expect(progress.totals.studyMinutes).toBe(2);
    expect(progress.study["2026-10-13"]).toBe(2);
    expect((await client(env.app).post("/api/activity/ping")).statusCode).toBe(401);
  });
});
