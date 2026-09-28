import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

const plan = JSON.parse(readFileSync(new URL("../packages/shared/src/data/plan.json", import.meta.url), "utf8")) as {
  weeks: { days: { date: string; questions?: { type: string; correctIndex: number; accepted: string[] }[] }[]; deliverable: { dueDate: string } }[];
};
const answersFor = (date: string) =>
  plan.weeks
    .flatMap((w) => w.days)
    .find((d) => d.date === date)!
    .questions!.map((q) => (q.type === "output" || q.type === "fill" ? q.accepted[0] : q.correctIndex));

test.describe.configure({ mode: "serial" });

let page: Page;

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  // Fija "hoy" para que la prueba no dependa de la fecha real.
  await page.addInitScript(() => localStorage.setItem("tp-local-today", "2026-10-07"));
});

test.afterAll(async () => page.close());

async function login(username: string, password: string) {
  await page.goto("login");
  await page.getByLabel("Usuario").fill(username);
  await page.getByLabel("Contraseña", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).not.toHaveURL(/login/);
}

async function logout() {
  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await expect(page).toHaveURL(/login/);
}

test("sin sesión lleva al inicio de sesión, también desde un enlace directo", async () => {
  await page.goto("dia/2026-10-07");
  await expect(page).toHaveURL(/\/tomas-page\/login/);
  await expect(page.getByText("Tu avance se guarda en este navegador")).toBeVisible();
});

test("Tomás completa el taller y la evaluación", async () => {
  await login("tomas", "1234");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Hola, Tomás");
  await page.getByRole("link", { name: "Empezar" }).click();
  await expect(page).toHaveURL(/dia\/2026-10-07/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Bucles anidados y patrones");
  await expect(page.getByRole("heading", { name: "Tema 2: Menús con while" })).toBeVisible();
  const tasks = page.locator(".checklist input[type=checkbox]");
  await expect(tasks).toHaveCount(5);
  for (let i = 0; i < 5; i++) await tasks.nth(i).check();
  await expect(page.getByRole("heading", { name: "Guía paso a paso" }).first()).toBeVisible();
  await page.getByLabel("Hice el reto").check();
  for (const [i, a] of answersFor("2026-10-07").entries()) {
    if (typeof a === "number") await page.locator(`input[name="q${i}"][value="${a}"]`).check();
    else await page.locator(`[name="q${i}"]`).fill(a);
  }
  await page.getByRole("button", { name: "Calificar" }).click();
  await expect(page.locator(".result .score")).toHaveText("8 / 8");
  await expect(page.getByText("Taller completo")).toBeVisible();
});

test("el avance sigue ahí al recargar", async () => {
  await page.reload();
  await expect(page.getByText("Taller completo")).toBeVisible();
  await expect(page.getByLabel("Hice el reto")).toBeChecked();
});

test("el temario muestra todo el plan y abre cualquier día", async () => {
  await page.goto("temario");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Temario");
  await expect(page.locator(".syllabus-day.workshop")).toHaveCount(64);
  await expect(page.locator(".syllabus-day.holiday")).toHaveCount(3);
  await page.locator(".syllabus-link", { hasText: "Herencia" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Herencia");
  await expect(page.getByRole("heading", { name: /Tema 1: Clases que heredan/ })).toBeVisible();
});

test("las guías se pueden leer y navegar", async () => {
  await page.goto("guias");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Guías");
  await page.getByRole("link", { name: /Leer un error/ }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Leer un error");
  await expect(page.locator(".guide-section").first()).toBeVisible();
  await expect(page.locator(".guide-section .code-block").first()).toBeVisible();
});

test("Tomás envía el entregable de la semana 1", async () => {
  await page.goto("dia/2026-10-03");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Entregable de la semana 1");
  const criteria = page.locator(".checklist input[type=checkbox]");
  await expect(criteria).toHaveCount(5);
  for (let i = 0; i < 5; i++) await criteria.nth(i).check();
  await page.getByLabel(/Enlace a tu código/).fill("https://github.com/tomas/curso-python");
  await page.getByRole("button", { name: "Enviar entregable" }).click();
  await expect(page.locator(".pill.submitted")).toBeVisible();
  await logout();
});

test("el administrador ve el avance y aprueba el entregable", async () => {
  await login("admin", "admin-tomas-2026");
  await expect(page.getByText("Esta versión funciona sin servidor")).toBeVisible();
  await expect(page.locator("tr.clickable", { hasText: "Tomás" })).toBeVisible();
  await page.getByRole("link", { name: /Revisar 1 entregable/ }).click();
  await page.locator(".deliverable-list a").first().click();
  await page.getByLabel("Comentario para el estudiante").fill("Muy bien.");
  await page.getByRole("button", { name: "Aprobar" }).click();
  await expect(page.getByText("No hay nada por revisar")).toBeVisible();
});

test("descarga una copia de seguridad", async () => {
  await page.goto("cuenta");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Descargar copia" }).click()]);
  expect(download.suggestedFilename()).toMatch(/^plan-tomas-\d{4}-\d{2}-\d{2}\.json$/);
  await logout();
});

test("la cuenta de prueba entra y no puede abrir el panel de administración", async () => {
  await login("prueba", "prueba123");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Hola, Estudiante");
  await page.goto("admin/usuarios");
  await expect(page).toHaveURL(/\/tomas-page\/?$/);
});

test("la evidencia no se pierde aunque se recargue enseguida", async () => {
  await page.goto("dia/2026-09-29");
  const evidence = page.getByLabel("Evidencia (opcional)");
  await evidence.fill("print(2 ** 10)");
  await page.reload();
  await expect(evidence).toHaveValue("print(2 ** 10)");
});

test("todas las fechas del plan abren", async () => {
  test.setTimeout(120_000);
  const dates = [...new Set(plan.weeks.flatMap((w) => [...w.days.map((d) => d.date), w.deliverable.dueDate]))];
  expect(dates.length).toBeGreaterThan(80);
  for (const date of dates) {
    await page.goto(`dia/${date}`);
    await expect(page.getByRole("heading", { level: 1 }), date).toBeVisible();
    await expect(page.getByText("No pudimos cargar esta sección")).toHaveCount(0);
  }
});
