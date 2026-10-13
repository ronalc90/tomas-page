import { expect, test, type Page } from "@playwright/test";
import { exerciseCard, login, STUDENT, typeSql } from "./helpers";

async function noHorizontalScroll(page: Page) {
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(page.viewportSize()!.width);
}

test("en el celular el menú se abre y no hay desplazamiento horizontal", async ({ page }) => {
  await login(page, STUDENT);
  await noHorizontalScroll(page);
  await page.getByRole("button", { name: "Abrir menú" }).click();
  await page.getByRole("link", { name: "Entregables" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Lo que entregas cada sábado");
});

test("en el celular se resuelve un ejercicio y la página no se desborda", async ({ page }) => {
  await login(page, { username: "prueba", password: "prueba123" });
  await page.goto("/dia/2026-10-14");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Filtrar con WHERE/);
  const card = exerciseCard(page, "Productos baratos");
  await typeSql(page, card, "SELECT nombre FROM productos WHERE precio < 5000;");
  await card.getByRole("button", { name: "Ejecutar" }).click();
  await expect(card.locator(".panel-title")).toContainText("17 filas");
  await card.getByRole("button", { name: "Comprobar" }).click();
  await expect(card.locator(".verdict")).toContainText("¡Correcto!");
  await noHorizontalScroll(page);
});

test("en el celular el laboratorio pone el editor arriba y los resultados se desplazan de lado", async ({ page }) => {
  await login(page, STUDENT);
  await page.goto("/laboratorio");
  const editor = page.locator(".lab-editor");
  const side = page.locator(".lab-side");
  expect((await editor.boundingBox())!.y).toBeLessThan((await side.boundingBox())!.y);
  await typeSql(page, editor, "SELECT * FROM clientes LIMIT 5;");
  await page.getByRole("button", { name: "Ejecutar" }).click();
  await expect(page.locator(".lab-status")).toContainText("5 filas");
  const scroller = page.locator(".lab-results .result-scroll");
  const overflow = await scroller.evaluate((el) => el.scrollWidth > el.clientWidth);
  expect(overflow).toBe(true);
  await noHorizontalScroll(page);
});
