// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import type { DayResponse, DeliverableView, MeResponse, ProgressView, QuizResult, StudentRow } from "@tomas/shared";
import { handleLocal } from "../local/server";
import { exportBackup, importBackup, resetCache, TODAY_KEY, useStore } from "../local/store";

function memoryStore() {
  const map = new Map<string, string>();
  return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v), removeItem: (k: string) => void map.delete(k) };
}

const call = <T>(method: string, path: string, body?: unknown) => handleLocal<T>(method, path, body);
const login = (username: string, password: string) => call<{ user: { id: string } }>("POST", "/api/auth/login", { username, password });

async function correct(date: string): Promise<number[]> {
  await login("admin", "admin-tomas-2026");
  const day = await call<{ questions: { correctIndex: number }[] }>("GET", `/api/admin/days/${date}`);
  await call("POST", "/api/auth/logout");
  return day.questions.map((q) => q.correctIndex);
}

beforeEach(() => {
  const store = memoryStore();
  store.setItem(TODAY_KEY, "2026-10-07");
  useStore(store);
  resetCache();
});

describe("modo sin servidor", () => {
  it("crea las cuentas iniciales y pide sesión", async () => {
    expect(await call<MeResponse | null>("GET", "/api/auth/me")).toBeNull();
    await expect(call("GET", "/api/progress")).rejects.toMatchObject({ status: 401 });
    await expect(login("tomas", "mala")).rejects.toMatchObject({ status: 401 });
    await login("Tomas", "1234");
    const me = await call<MeResponse>("GET", "/api/auth/me");
    expect(me.user).toMatchObject({ username: "tomas", role: "student" });
    expect(me.today).toBe("2026-10-07");
    await expect(call("GET", "/api/admin/users")).rejects.toMatchObject({ status: 403 });
  });

  it("califica la evaluación sin revelar respuestas antes y completa el taller", async () => {
    const answers = await correct("2026-10-07");
    await login("tomas", "1234");
    const before = await call<DayResponse>("GET", "/api/days/2026-10-07");
    expect(JSON.stringify(before.questions)).not.toContain("correctIndex");
    await call("PUT", "/api/days/2026-10-07/progress", { tasks: [true, true, true] });
    const wrong = await call<QuizResult>("POST", "/api/days/2026-10-07/quiz", { answers: answers.map((a) => (a + 1) % 4) });
    expect(wrong).toMatchObject({ score: 0, passed: false });
    const right = await call<QuizResult>("POST", "/api/days/2026-10-07/quiz", { answers });
    expect(right).toMatchObject({ score: 4, passed: true, attempts: 2, best: 4 });
    const progress = await call<ProgressView>("GET", "/api/progress");
    expect(progress.days["2026-10-07"].status).toBe("done");
    expect(progress.totals.workshopsDone).toBe(1);
    expect(progress.totals.firstTryAverage).toBe(0);
  });

  it("envía un entregable, el administrador pide cambios y luego lo aprueba", async () => {
    const { user } = await login("tomas", "1234");
    await expect(call("POST", "/api/deliverables/s01/submit")).rejects.toMatchObject({ status: 400 });
    await call("PUT", "/api/deliverables/s01", { criteria: [true, true, true, true], evidence: "https://github.com/tomas/x" });
    const sent = await call<DeliverableView>("POST", "/api/deliverables/s01/submit");
    expect(sent.submission?.status).toBe("submitted");
    await call("POST", "/api/auth/logout");

    await login("admin", "admin-tomas-2026");
    const students = await call<StudentRow[]>("GET", "/api/admin/students");
    expect(students.map((s) => s.username)).toEqual(["tomas"]);
    await expect(call("POST", `/api/admin/reviews/${user.id}/s01`, { decision: "changes_requested", feedback: "" })).rejects.toMatchObject({ status: 400 });
    await call("POST", `/api/admin/reviews/${user.id}/s01`, { decision: "changes_requested", feedback: "Agrega un caso." });
    await call("POST", "/api/auth/logout");

    await login("tomas", "1234");
    await call("PUT", "/api/deliverables/s01", { evidence: "https://github.com/tomas/x (corregido)" });
    await call("POST", "/api/deliverables/s01/submit");
    await call("POST", "/api/auth/logout");

    await login("admin", "admin-tomas-2026");
    const approved = await call<DeliverableView>("POST", `/api/admin/reviews/${user.id}/s01`, { decision: "approved", feedback: "Bien." });
    expect(approved.submission).toMatchObject({ status: "approved", reviewerName: "Administrador" });
  });

  it("el administrador edita contenido, crea usuarios y cambia ajustes", async () => {
    await login("admin", "admin-tomas-2026");
    const day = await call<Record<string, unknown>>("GET", "/api/admin/days/2026-10-05");
    await call("PUT", "/api/admin/days/2026-10-05", { ...day, title: "if, else (editado)" });
    const plan = await call<{ weeks: { days: { date: string; title: string }[] }[] }>("GET", "/api/plan");
    expect(plan.weeks.flatMap((w) => w.days).find((d) => d.date === "2026-10-05")?.title).toBe("if, else (editado)");

    await call("POST", "/api/admin/users", { username: "sofia", displayName: "Sofía", role: "student", password: "clave" });
    await expect(call("POST", "/api/admin/users", { username: "sofia", displayName: "Otra", role: "student", password: "clave" })).rejects.toMatchObject({ status: 409 });
    await call("PUT", "/api/admin/settings", { passScore: 4, programName: "Plan" });
    await call("POST", "/api/auth/logout");
    await login("sofia", "clave");
    expect((await call<MeResponse>("GET", "/api/auth/me")).settings.passScore).toBe(4);
  });

  it("exporta e importa una copia de seguridad", async () => {
    await login("tomas", "1234");
    await call("PUT", "/api/days/2026-10-05/progress", { tasks: [true, false, false] });
    const backup = await exportBackup();

    useStore(memoryStore());
    resetCache();
    await login("tomas", "1234");
    expect((await call<DayResponse>("GET", "/api/days/2026-10-05")).progress.tasks).toEqual([false, false, false]);

    importBackup(JSON.stringify(backup));
    expect((await call<DayResponse>("GET", "/api/days/2026-10-05")).progress.tasks).toEqual([true, false, false]);
    expect(() => importBackup("{}")).toThrow("no es una copia");
  });
});
