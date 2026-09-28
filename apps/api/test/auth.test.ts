import { describe, expect, it } from "vitest";
import { ADMIN, client, login, STUDENT, useTestApp } from "./helpers";

const env = useTestApp();

describe("autenticación", () => {
  it("responde el estado de salud con la base conectada", async () => {
    const res = await env.app.inject({ method: "GET", url: "/api/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: "ok", database: "ok" });
  });

  it("rechaza una contraseña incorrecta sin revelar si el usuario existe", async () => {
    const wrong = await client(env.app).post("/api/auth/login", { username: STUDENT.username, password: "x" });
    const unknown = await client(env.app).post("/api/auth/login", { username: "nadie", password: "x" });
    expect(wrong.statusCode).toBe(401);
    expect(unknown.statusCode).toBe(401);
    expect(wrong.json().message).toBe(unknown.json().message);
  });

  it("inicia sesión sin importar mayúsculas y pone una cookie httpOnly", async () => {
    const res = await client(env.app).post("/api/auth/login", { username: "Tomas", password: STUDENT.password });
    expect(res.statusCode).toBe(200);
    expect(res.json().user).toMatchObject({ username: "tomas", role: "student", displayName: "Tomás" });
    const cookie = res.cookies.find((c) => c.name === "tp_session");
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe("Lax");
  });

  it("devuelve el usuario, la fecha y los ajustes en /me", async () => {
    const cookie = await login(env.app, STUDENT.username, STUDENT.password);
    const res = await client(env.app, cookie).get("/api/auth/me");
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ user: { username: "tomas" }, today: "2026-10-01", settings: { passScore: 4 } });
  });

  it("responde 204 en /me cuando no hay sesión", async () => {
    const res = await client(env.app).get("/api/auth/me");
    expect(res.statusCode).toBe(204);
  });

  it("exige sesión en las rutas privadas", async () => {
    expect((await client(env.app).get("/api/progress")).statusCode).toBe(401);
    expect((await client(env.app).get("/api/admin/overview")).statusCode).toBe(401);
  });

  it("no deja entrar a un estudiante al panel de administración", async () => {
    const cookie = await login(env.app, STUDENT.username, STUDENT.password);
    const res = await client(env.app, cookie).get("/api/admin/users");
    expect(res.statusCode).toBe(403);
  });

  it("cierra la sesión y la invalida en el servidor", async () => {
    const cookie = await login(env.app, STUDENT.username, STUDENT.password);
    const api = client(env.app, cookie);
    expect((await api.post("/api/auth/logout")).statusCode).toBe(200);
    expect((await api.get("/api/auth/me")).statusCode).toBe(204);
    expect((await api.get("/api/progress")).statusCode).toBe(401);
  });

  it("cambia la contraseña y cierra las demás sesiones", async () => {
    const other = await login(env.app, ADMIN.username, ADMIN.password);
    const current = await login(env.app, ADMIN.username, ADMIN.password);
    const bad = await client(env.app, current).post("/api/auth/password", {
      currentPassword: "equivocada",
      newPassword: "nueva-clave-segura",
    });
    expect(bad.statusCode).toBe(400);
    const short = await client(env.app, current).post("/api/auth/password", {
      currentPassword: ADMIN.password,
      newPassword: "corta",
    });
    expect(short.statusCode).toBe(400);

    const ok = await client(env.app, current).post("/api/auth/password", {
      currentPassword: ADMIN.password,
      newPassword: "nueva-clave-segura",
    });
    expect(ok.statusCode).toBe(200);
    expect((await client(env.app, current).get("/api/auth/me")).statusCode).toBe(200);
    expect((await client(env.app, other).get("/api/auth/me")).statusCode).toBe(204);
    await login(env.app, ADMIN.username, "nueva-clave-segura");
  });

  it("valida el cuerpo de la petición con mensajes por campo", async () => {
    const res = await client(env.app).post("/api/auth/login", { username: "", password: "" });
    expect(res.statusCode).toBe(400);
    expect(res.json().details.fields).toHaveProperty("username");
  });
});

describe("límite de intentos", () => {
  it("bloquea tras muchos intentos fallidos del mismo usuario, sin afectar a otros", async () => {
    let last = 0;
    for (let i = 0; i < 11; i++) {
      last = (await client(env.app).post("/api/auth/login", { username: "bloqueado", password: "x" })).statusCode;
    }
    expect(last).toBe(429);
    const other = await client(env.app).post("/api/auth/login", { username: STUDENT.username, password: STUDENT.password });
    expect(other.statusCode).toBe(200);
  });
});
