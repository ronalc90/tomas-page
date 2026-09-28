import { expect, test } from "@playwright/test";
import { ADMIN, answerQuiz, correctAnswers, login, STUDENT } from "./helpers";

test.describe.configure({ mode: "serial" });

test("un visitante sin sesión llega al inicio de sesión", async ({ page }) => {
  await page.goto("/entregables");
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("heading", { name: "Inicia sesión" })).toBeVisible();
});

test("una contraseña incorrecta muestra un error claro", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Usuario").fill("tomas");
  await page.getByLabel("Contraseña", { exact: true }).fill("mala");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("alert")).toHaveText("Usuario o contraseña incorrectos.");
});

test("Tomás completa el taller del día: tareas y evaluación", async ({ page, request }) => {
  const answers = await correctAnswers(request, "2026-10-07");
  await login(page, STUDENT);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Hola, Tomás");

  await page.getByRole("link", { name: "Empezar" }).click();
  await expect(page).toHaveURL(/\/dia\/2026-10-07/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Bucles anidados y patrones");
  await expect(page.getByRole("heading", { name: "Tema 1: for dentro de for" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Tema 2: Menús con while" })).toBeVisible();
  await expect(page.getByLabel("Agenda del día")).toContainText("4 h");
  await expect(page.getByRole("complementary", { name: "Consejo del tema 1" })).toContainText("imprime los valores");
  // Los términos del glosario muestran su definición al recibir el foco.
  await page.locator(".term").first().focus();
  await expect(page.locator(".term").first().locator(".tooltip")).toBeVisible();

  const tasks = page.locator(".checklist input[type=checkbox]");
  await expect(tasks).toHaveCount(5);
  for (let i = 0; i < 5; i++) await tasks.nth(i).check();

  // La lección completa está en pantalla: guía paso a paso, pistas, reto y glosario.
  await expect(page.getByRole("heading", { name: "Guía paso a paso" }).first()).toBeVisible();
  await page.getByRole("button", { name: "Abrir todos" }).first().click();
  await expect(page.locator(".step-list").first().locator(".step-body")).toHaveCount(await page.locator(".step-list").first().locator("li").count());
  await page.getByRole("button", { name: "Ver pista" }).first().click();
  await expect(page.locator(".hint-text").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Reto extra" })).toBeVisible();
  await page.getByRole("button", { name: "Ver una solución" }).click();
  await expect(page.locator(".challenge .code-block")).toBeVisible();
  await page.getByLabel("Hice el reto").check();
  await expect(page.getByLabel("Hice el reto")).toBeChecked();

  // Primer intento con cuatro respuestas malas: no aprueba (5 de 8 es suficiente, 4 no).
  const wrong = answers.map((a, i) => (i < 4 ? ((a as number) + 1) % 2 : a));
  await answerQuiz(page, wrong);
  await page.getByRole("button", { name: "Calificar" }).click();
  await expect(page.locator(".result .score")).toHaveText("4 / 8");
  await expect(page.getByText("Incorrecto.").first()).toBeVisible();
  await expect(page.getByText(/Qué repasar/)).toBeVisible();

  await page.getByRole("button", { name: "Intentar de nuevo" }).click();
  await answerQuiz(page, answers);
  await page.getByRole("button", { name: "Calificar" }).click();
  await expect(page.locator(".result .score")).toHaveText("8 / 8");
  await expect(page.getByText("Taller completo")).toBeVisible();

  await page.goto("/");
  const workshops = page.locator(".stat").filter({ has: page.locator("dt", { hasText: /^Talleres/ }) });
  await expect(workshops.locator("dd").first()).toContainText("1 / 64");
});

test("la evidencia del taller se guarda sola", async ({ page }) => {
  await login(page, STUDENT);
  await page.goto("/dia/2026-10-07");
  await page.getByLabel("Evidencia (opcional)").fill("print(True and False)");
  await expect(page.getByText("Guardado", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Evidencia (opcional)")).toHaveValue("print(True and False)");
});

test("la evidencia no se pierde aunque se recargue enseguida", async ({ page }) => {
  await login(page, STUDENT);
  await page.goto("/dia/2026-10-06");
  const evidence = page.getByLabel("Evidencia (opcional)");
  await evidence.fill("print(10 > 3)");
  await page.reload();
  await expect(evidence).toHaveValue("print(10 > 3)");
});

test("Tomás envía el entregable de la semana 1", async ({ page }) => {
  await login(page, STUDENT);
  await page.goto("/dia/2026-10-03");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Entregable de la semana 1");
  const send = page.getByRole("button", { name: "Enviar entregable" });
  await expect(send).toBeDisabled();
  const criteria = page.locator(".checklist input[type=checkbox]");
  await expect(criteria).toHaveCount(5);
  for (let i = 0; i < 5; i++) await criteria.nth(i).check();
  await expect(page.getByRole("heading", { name: "Cómo abordarlo" })).toBeVisible();
  await page.getByLabel(/Enlace a tu código/).fill("https://github.com/tomas/curso-python/tree/main/semana-01");
  await expect(send).toBeEnabled();
  await send.click();
  await expect(page.locator(".pill.submitted")).toBeVisible();
  await expect(page.getByRole("button", { name: "Retirar para editar" })).toBeVisible();
});

test("el administrador revisa y aprueba el entregable", async ({ page }) => {
  await login(page, ADMIN);
  await expect(page).toHaveURL(/\/admin$/);
  await page.getByRole("link", { name: /Revisar 1 entregable/ }).click();
  await page.locator(".deliverable-list a").first().click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Tomás · Entregable de la semana 1");
  await expect(page.getByRole("link", { name: /github.com\/tomas/ })).toBeVisible();
  await page.getByLabel("Comentario para el estudiante").fill("Muy bien. Agrega un caso con 7 personas.");
  await page.getByRole("button", { name: "Aprobar" }).click();
  await expect(page).toHaveURL(/\/admin\/revisiones$/);
  await expect(page.getByText("No hay nada por revisar")).toBeVisible();
});

test("Tomás ve la aprobación y el comentario", async ({ page }) => {
  await login(page, STUDENT);
  await page.goto("/entregables");
  await expect(page.locator(".pill.approved").first()).toBeVisible();
  await page.goto("/dia/2026-10-03");
  await expect(page.getByText("Muy bien. Agrega un caso con 7 personas.")).toBeVisible();
});

test("un estudiante no puede entrar al panel de administración", async ({ page }) => {
  await login(page, STUDENT);
  await page.goto("/admin/usuarios");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Hola, Tomás");
});

test("la cuenta de prueba entra con su propio avance", async ({ page }) => {
  await login(page, { username: "prueba", password: "prueba123" });
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Hola, Estudiante");
  await page.goto("/dia/2026-10-07");
  await expect(page.getByText("Taller completo")).toHaveCount(0);
});
