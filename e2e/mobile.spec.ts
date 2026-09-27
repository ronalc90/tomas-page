import { expect, test } from "@playwright/test";
import { login, STUDENT } from "./helpers";

test("en el celular el menú se abre y no hay desplazamiento horizontal", async ({ page }) => {
  await login(page, STUDENT);
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(page.viewportSize()!.width);
  await page.getByRole("button", { name: "Abrir menú" }).click();
  await page.getByRole("link", { name: "Entregables" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Lo que entregas cada sábado");
});
