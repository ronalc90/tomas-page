import { expect, test } from "@playwright/test";
import { ADMIN, login } from "./helpers";

test.describe.configure({ mode: "serial" });

test("el administrador ve el resumen con las gráficas y el detalle del estudiante", async ({ page }) => {
  await login(page, ADMIN);
  await expect(page.getByRole("heading", { name: "Resumen" })).toBeVisible();
  await expect(page.getByRole("img", { name: /Actividad por semana/ })).toBeVisible();
  await expect(page.getByRole("img", { name: /Tiempo de estudio por semana/ })).toBeVisible();
  await page.locator("tr.clickable", { hasText: "Tomás" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Tomás Sandí");
  await expect(page.getByRole("group", { name: "Calendario del plan" })).toBeVisible();
});

test("el administrador crea un estudiante que luego puede entrar", async ({ page, browser }) => {
  await login(page, ADMIN);
  await page.goto("/admin/usuarios");
  await page.getByRole("button", { name: "Nuevo usuario" }).click();
  await page.getByLabel("Nombre", { exact: true }).fill("Sofía Pérez");
  await page.getByLabel("Usuario", { exact: true }).fill("sofia");
  await page.getByLabel("Contraseña inicial").fill("clave1");
  await page.getByRole("button", { name: "Crear usuario" }).click();
  await expect(page.getByText("Usuario @sofia creado.")).toBeVisible();
  await expect(page.getByRole("cell", { name: /Sofía Pérez/ })).toBeVisible();

  const other = await browser.newPage();
  await login(other, { username: "sofia", password: "clave1" });
  await expect(other.getByRole("heading", { level: 1 })).toContainText("Hola, Sofía");
  await other.close();
});

test("el administrador edita un taller y un ejercicio, y el cambio se ve en la vista del estudiante", async ({ page }) => {
  await login(page, ADMIN);
  await page.goto("/admin/contenido");
  await page.getByRole("link", { name: /Filtrar con WHERE/ }).click();
  await page.getByLabel("Título del día").fill("Filtrar con WHERE (actualizado)");
  await expect(page.getByRole("heading", { name: "Ejercicios SQL (2)" })).toBeVisible();
  await page.getByLabel("Título del ejercicio 1").fill("Clientes de Cartago");
  await page.locator("#ex0-prompt").fill("Muestra el `nombre` y el `apellido` de los clientes de Cartago (provincia 3).");
  await page.locator("#ex0-solution").fill("SELECT nombre, apellido FROM clientes WHERE provincia_id = 3;");
  await page.getByRole("button", { name: "Probar la solución" }).first().click();
  await expect(page.locator(".exercise-edit").first().locator(".result-table")).toBeVisible();
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(page.getByText("Cambios guardados.")).toBeVisible();
  await page.getByRole("link", { name: "Ver como estudiante" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Filtrar con WHERE (actualizado)");
  await expect(page.getByRole("heading", { name: /Clientes de Cartago/ })).toBeVisible();
});

test("una solución que falla no se guarda", async ({ page }) => {
  await login(page, ADMIN);
  await page.goto("/admin/contenido/2026-10-14");
  await page.locator("#ex1-solution").fill("SELECT nombres FROM productos;");
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(page.getByRole("alert").first()).toContainText("no such column");
});

test("el administrador cambia la nota mínima", async ({ page }) => {
  await login(page, ADMIN);
  await page.goto("/admin/ajustes");
  await page.getByLabel(/Respuestas correctas para aprobar/).fill("4");
  await page.getByRole("button", { name: "Guardar ajustes" }).click();
  await expect(page.getByText("Ajustes guardados.")).toBeVisible();
  await page.getByLabel(/Respuestas correctas para aprobar/).fill("3");
  await page.getByRole("button", { name: "Guardar ajustes" }).click();
});
