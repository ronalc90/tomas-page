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

export type Answer = number | string;

/** Respuestas correctas de un taller, leídas con la cuenta de administrador (índice o texto según el tipo). */
export async function correctAnswers(request: APIRequestContext, date: string): Promise<Answer[]> {
  const res = await request.post("/api/auth/login", { data: ADMIN });
  expect(res.ok()).toBeTruthy();
  const day = await (await request.get(`/api/admin/days/${date}`)).json();
  await request.post("/api/auth/logout");
  return day.questions.map((q: { type: string; correctIndex: number; accepted: string[] }) =>
    q.type === "output" || q.type === "fill" ? q.accepted[0] : q.correctIndex,
  );
}

/** Responde la evaluación en pantalla: marca opciones o escribe el texto según el tipo de pregunta. */
export async function answerQuiz(page: Page, answers: Answer[]) {
  for (const [i, a] of answers.entries()) {
    if (typeof a === "number") await page.locator(`input[name="q${i}"][value="${a}"]`).check();
    else await page.locator(`[name="q${i}"]`).fill(a);
  }
}
