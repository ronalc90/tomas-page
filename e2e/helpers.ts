import { expect, type APIRequestContext, type Page } from "@playwright/test";

export const ADMIN = { username: "admin", password: "admin-e2e-password" };
export const STUDENT = { username: "tomas", password: "1234" };

export async function login(page: Page, user: { username: string; password: string }) {
  await page.goto("/login");
  await page.getByLabel("Usuario").fill(user.username);
  await page.getByLabel("Contraseña", { exact: true }).fill(user.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

/** Respuestas correctas de un taller, leídas con la cuenta de administrador. */
export async function correctAnswers(request: APIRequestContext, date: string): Promise<number[]> {
  const res = await request.post("/api/auth/login", { data: ADMIN });
  expect(res.ok()).toBeTruthy();
  const day = await (await request.get(`/api/admin/days/${date}`)).json();
  await request.post("/api/auth/logout");
  return day.questions.map((q: { correctIndex: number }) => q.correctIndex);
}
