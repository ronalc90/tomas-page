import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

const plan = JSON.parse(readFileSync(new URL("../packages/shared/src/data/plan.json", import.meta.url), "utf8")) as {
  weeks: { days: { date: string; questions?: { correctIndex: number }[] }[] }[];
};
const answersFor = (date: string) =>
  plan.weeks.flatMap((w) => w.days).find((d) => d.date === date)!.questions!.map((q) => q.correctIndex);

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
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("and, or, not");
  const tasks = page.locator(".checklist input[type=checkbox]");
  for (let i = 0; i < (await tasks.count()); i++) await tasks.nth(i).check();
  for (const [i, a] of answersFor("2026-10-07").entries()) await page.locator(`input[name="q${i}"][value="${a}"]`).check();
  await page.getByRole("button", { name: "Calificar" }).click();
  await expect(page.locator(".result .score")).toHaveText("4 / 4");
  await expect(page.getByText("Taller completo")).toBeVisible();
});

test("el avance sigue ahí al recargar", async () => {
  await page.reload();
  await expect(page.getByText("Taller completo")).toBeVisible();
});

test("Tomás envía el entregable de la semana 1", async () => {
  await page.goto("dia/2026-10-03");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Entregable de la semana 1");
  const criteria = page.locator(".checklist input[type=checkbox]");
  await expect(criteria).toHaveCount(4);
  for (let i = 0; i < 4; i++) await criteria.nth(i).check();
  await page.getByLabel(/Enlace a tu código/).fill("https://github.com/tomas/curso-python");
  await page.getByRole("button", { name: "Enviar entregable" }).click();
  await expect(page.locator(".pill.submitted")).toBeVisible();
  await logout();
});

test("el administrador ve el avance y aprueba el entregable", async () => {
  await login("admin", "admin-tomas-2026");
  await expect(page.getByText("Esta versión funciona sin servidor")).toBeVisible();
  await expect(page.locator("tr.clickable").first()).toContainText("Tomás");
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
});
