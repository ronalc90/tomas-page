import { expect, test } from "@playwright/test";
import { ADMIN, login } from "./helpers";

test.describe.configure({ mode: "serial" });

test("el administrador ve el resumen y el detalle del estudiante", async ({ page }) => {
  await login(page, ADMIN);
  await expect(page.getByRole("heading", { name: "Resumen" })).toBeVisible();
  await expect(page.getByRole("img", { name: /Actividad por semana/ })).toBeVisible();
  await page.locator("tr.clickable", { hasText: "Tomás" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Tomás");
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

test("el administrador edita un taller y el cambio se ve en la vista del estudiante", async ({ page }) => {
  await login(page, ADMIN);
  await page.goto("/admin/contenido");
  await page.getByText("Variables, tipos y texto").click();
  await page.getByRole("link", { name: /Variables y print/ }).click();
  await page.getByLabel("Título del día").fill("Variables y print (actualizado)");
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(page.getByText("Cambios guardados.")).toBeVisible();
  await page.getByRole("link", { name: "Ver como estudiante" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Variables y print (actualizado)");
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
