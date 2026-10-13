import { expect, test } from "@playwright/test";
import { ADMIN, answerQuiz, correctAnswers, exerciseCard, login, STUDENT, typeSql } from "./helpers";

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

test("Tomás resuelve los ejercicios SQL del taller y aprueba la evaluación", async ({ page, request }) => {
  const answers = await correctAnswers(request, "2026-10-13");
  await login(page, STUDENT);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Hola, Tomás");

  await page.getByRole("link", { name: "Empezar" }).click();
  await expect(page).toHaveURL(/\/dia\/2026-10-13/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Bases de datos y SELECT");
  const progress = page.getByRole("region", { name: "Tu avance de hoy" });
  await expect(progress).toContainText("0 / 3");
  // Sin tareas: la sección del taller no aparece.
  await expect(page.locator("#tareas")).toHaveCount(0);
  // El concepto viene en párrafos y con negrita.
  await expect(page.locator("#tema-1 .concept p")).toHaveCount(2);
  await expect(page.locator("#tema-1 .concept strong").first()).toHaveText("SELECT y FROM");

  // Ejercicio 1: primero con una columna de menos, luego bien.
  const first = exerciseCard(page, "Catálogo básico");
  await typeSql(page, first, "SELECT nombre FROM productos;");
  await first.getByRole("button", { name: "Ejecutar" }).click();
  await expect(first.locator(".panel-title")).toContainText("42 filas");
  await first.getByRole("button", { name: "Comprobar" }).click();
  await expect(first.locator(".verdict")).toContainText("Tu consulta devuelve 1 columna y se esperaban 2.");
  await expect(first.locator(".exercise-head .pill")).toHaveText("1 intento");
  await first.getByRole("button", { name: "Ver resultado esperado" }).click();
  await expect(first.locator(".exercise-panel").last()).toContainText("42 filas");
  await typeSql(page, first, "SELECT nombre AS producto, precio\nFROM productos;");
  await first.getByRole("button", { name: "Comprobar" }).click();
  await expect(first.locator(".verdict")).toContainText("¡Correcto!");
  await expect(first.locator(".exercise-head .pill")).toContainText("Resuelto");
  await expect(first.locator(".code-tag", { hasText: "Solución de referencia" })).toBeVisible();

  // Ejercicio 2: el orden importa.
  const second = exerciseCard(page, "Los más caros");
  await typeSql(page, second, "SELECT * FROM (SELECT nombre, precio FROM productos ORDER BY precio DESC, nombre LIMIT 5) ORDER BY precio;");
  await second.getByRole("button", { name: "Comprobar" }).click();
  await expect(second.locator(".verdict")).toContainText("Las filas son correctas pero el orden no: revisa ORDER BY.");
  await typeSql(page, second, "SELECT nombre, precio FROM productos ORDER BY precio DESC, nombre LIMIT 5;");
  await second.getByRole("button", { name: "Comprobar" }).click();
  await expect(second.locator(".verdict")).toContainText("¡Correcto!");

  // Ejercicio 3: modifica datos (setup crea la tabla y check muestra el efecto). Un error de SQLite se explica en español.
  const third = exerciseCard(page, "Anotar un pendiente");
  await typeSql(page, third, "INSERT INTO pendiente (nota) VALUES ('Revisar inventario');");
  await third.getByRole("button", { name: "Comprobar" }).click();
  await expect(third.locator(".sql-error")).toContainText("La tabla «pendiente» no existe");
  await typeSql(page, third, "INSERT INTO pendientes (nota) VALUES ('Revisar inventario');");
  await third.getByRole("button", { name: "Ejecutar" }).click();
  await expect(third.locator(".run-note")).toContainText("1 fila modificada");
  await third.getByRole("button", { name: "Comprobar" }).click();
  await expect(third.locator(".verdict")).toContainText("¡Correcto!");
  await expect(progress).toContainText("3 / 3");

  // El último SQL enviado se recupera al volver.
  await page.reload();
  await expect(exerciseCard(page, "Catálogo básico").locator(".cm-content")).toContainText("SELECT nombre AS producto, precio");

  await answerQuiz(page, answers);
  await page.getByRole("button", { name: "Calificar" }).click();
  await expect(page.locator(".result .score")).toHaveText("4 / 4");
  await expect(page.locator(".complete-banner")).toBeVisible();

  await page.goto("/");
  const workshops = page.locator(".stat").filter({ has: page.locator("dt", { hasText: /^Talleres/ }) });
  await expect(workshops.locator("dd").first()).toContainText("1 / 5");
  const exercises = page.locator(".stat").filter({ has: page.locator("dt", { hasText: /^Ejercicios SQL/ }) });
  await expect(exercises.locator("dd").first()).toContainText("3 / 9");
});

test("la solución se habilita después de 3 intentos y avisa que queda registrado", async ({ page }) => {
  await login(page, STUDENT);
  await page.goto("/dia/2026-10-14");
  const card = exerciseCard(page, "Productos baratos");
  const reveal = card.getByRole("button", { name: /Ver solución/ });
  await expect(reveal).toBeDisabled();
  for (let i = 0; i < 3; i++) {
    await typeSql(page, card, `SELECT nombre FROM productos WHERE precio < ${1000 + i};`);
    await card.getByRole("button", { name: "Comprobar" }).click();
    await expect(card.locator(".exercise-head .pill")).toHaveText(`${i + 1} ${i === 0 ? "intento" : "intentos"}`);
  }
  await card.getByRole("button", { name: "Pista" }).click();
  await expect(card.locator(".hint-text")).toBeVisible();
  await expect(reveal).toBeEnabled();
  await reveal.click();
  const dialog = page.getByRole("dialog", { name: "Ver la solución" });
  await expect(dialog).toContainText("Queda registrado");
  await dialog.getByRole("button", { name: "Ver la solución" }).click();
  await expect(card.locator(".code-block")).toContainText("WHERE precio < 5000");
});

test("Tomás usa el laboratorio SQL", async ({ page }) => {
  await login(page, STUDENT);
  await page.getByRole("link", { name: "Laboratorio SQL" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Tienda Pura Vida");

  await page.getByRole("button", { name: "Ejecutar" }).click();
  await expect(page.locator(".lab-status")).toContainText("10 filas");
  await expect(page.locator(".lab-results tbody tr")).toHaveCount(10);

  // Explorador: columnas con llaves y "ver 10 filas".
  await page.locator(".explorer summary", { hasText: "clientes" }).click();
  await expect(page.locator(".explorer details[open] .explorer-cols")).toContainText("FK → provincias.id");
  await page.getByRole("button", { name: "Ver 10 filas de provincias" }).click();
  await expect(page.locator(".lab-status")).toContainText("7 filas");

  const editor = page.locator(".lab-editor");
  await typeSql(page, editor, "SELECT nombres FROM productos;");
  await page.keyboard.press("ControlOrMeta+Enter");
  await expect(page.locator(".lab-results .sql-error")).toContainText("La columna «nombres» no existe");

  // Varias sentencias: los cambios se quedan en la base del laboratorio.
  await typeSql(page, editor, "INSERT INTO provincias (nombre) VALUES ('Isla del Coco');\nSELECT COUNT(*) AS total FROM provincias;");
  await page.getByRole("button", { name: "Ejecutar" }).click();
  await expect(page.locator(".lab-status")).toContainText("1 fila · 1 fila modificada");
  await expect(page.locator(".lab-results td.num").last()).toHaveText("8");

  // NULL se ve distinto.
  await typeSql(page, editor, "SELECT nombre, email FROM clientes WHERE email IS NULL LIMIT 3;");
  await page.getByRole("button", { name: "Ejecutar" }).click();
  await expect(page.locator(".lab-results .null").first()).toHaveText("NULL");

  // Descargar la base.
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Descargar tienda.db" }).click();
  expect((await download).suggestedFilename()).toBe("tienda.db");

  // Restaurar la base original.
  await page.getByRole("button", { name: "Restaurar la base" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Restaurar" }).click();
  await typeSql(page, editor, "SELECT COUNT(*) FROM provincias;");
  await page.getByRole("button", { name: "Ejecutar" }).click();
  await expect(page.locator(".lab-results td.num").last()).toHaveText("7");

  // Detener una consulta que no termina.
  await typeSql(page, editor, "WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM n) SELECT count(*) FROM n;");
  await page.getByRole("button", { name: "Ejecutar" }).click();
  await page.getByRole("button", { name: "Detener" }).click();
  await expect(page.getByText("Detuviste la consulta.")).toBeVisible();

  // Historial.
  await page.getByRole("tab", { name: /Historial/ }).click();
  await expect(page.locator(".lab-history li").first()).toContainText("WITH RECURSIVE");

  // Desde una lección: ejecutar el ejemplo ahí mismo y abrirlo en el laboratorio.
  await page.goto("/dia/2026-10-13");
  const example = page.locator("#tema-1 .code-block").first();
  await example.getByRole("button", { name: "Ejecutar" }).click();
  await expect(example.locator(".code-run")).toContainText("3 filas");
  await example.getByRole("link", { name: "Abrir en el laboratorio" }).click();
  await expect(page).toHaveURL(/\/laboratorio/);
  await expect(page.locator(".lab-editor .cm-content")).toContainText("FROM productos");
  await expect(page.locator(".lab-status")).toContainText("3 filas");
});

test("el entregable con ejercicios solo se envía con todos resueltos", async ({ page }) => {
  await login(page, STUDENT);
  await page.goto("/dia/2026-10-17");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Entregable de la semana 1");
  const send = page.getByRole("button", { name: "Enviar entregable" });
  await expect(send).toBeDisabled();
  const criteria = page.locator(".checklist input[type=checkbox]");
  await expect(criteria).toHaveCount(3);
  for (let i = 0; i < 3; i++) await criteria.nth(i).check();
  await page.getByLabel(/Qué descubriste en los datos/).fill("Hay 7 provincias y 8 categorías; Libros todavía no tiene productos.");
  await expect(page.getByText("Faltan 2 ejercicios por resolver.")).toBeVisible();
  await expect(send).toBeDisabled();

  const count = exerciseCard(page, "Cuántas provincias");
  await typeSql(page, count, "SELECT COUNT(*) FROM provincias;");
  await count.getByRole("button", { name: "Comprobar" }).click();
  await expect(count.locator(".verdict")).toContainText("¡Correcto!");
  const cats = exerciseCard(page, "Categorías");
  await typeSql(page, cats, "SELECT nombre FROM categorias ORDER BY nombre;");
  await cats.getByRole("button", { name: "Comprobar" }).click();
  await expect(cats.locator(".verdict")).toContainText("¡Correcto!");

  await expect(send).toBeEnabled();
  await send.click();
  await expect(page.locator(".pill.submitted")).toBeVisible();
  await expect(page.getByRole("button", { name: "Retirar para editar" })).toBeVisible();
});

test("el administrador ve el avance, el SQL enviado y aprueba el entregable", async ({ page }) => {
  await login(page, ADMIN);
  await expect(page).toHaveURL(/\/admin$/);
  const exercisesStat = page.locator(".stat").filter({ has: page.locator("dt", { hasText: /^Ejercicios SQL/ }) });
  await expect(exercisesStat).toContainText("5 resueltos");

  await page.locator("tr.clickable", { hasText: "Tomás" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Tomás Sandí");
  const row = page.locator("tbody tr", { hasText: "Bases de datos y SELECT" });
  await expect(row).toContainText("3/3");
  await page.getByRole("tab", { name: "Todo el plan" }).click();
  const wed = page.locator("tbody tr", { hasText: "Filtrar con WHERE" });
  await expect(wed.locator(".pill.overdue").first()).toHaveText("1");
  await page.getByRole("tab", { name: "SQL enviado" }).click();
  const log = page.locator(".sql-log-item", { hasText: "Productos baratos" });
  await expect(log).toContainText("Vio la solución");
  await expect(log.locator("pre")).toHaveText("SELECT nombre FROM productos WHERE precio < 1002;");

  await page.goto("/admin");
  await page.getByRole("link", { name: /Revisar 1 entregable/ }).click();
  await page.locator(".deliverable-list a").first().click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Tomás Sandí · Entregable de la semana 1");
  await expect(page.getByRole("heading", { name: "Preguntas del informe" })).toBeVisible();
  await expect(page.locator(".sql-log-item", { hasText: "Categorías" }).locator("pre")).toHaveText("SELECT nombre FROM categorias ORDER BY nombre;");
  await page.getByLabel("Comentario para el estudiante").fill("Muy bien. Agrega cuántos clientes hay por provincia.");
  await page.getByRole("button", { name: "Aprobar" }).click();
  await expect(page).toHaveURL(/\/admin\/revisiones$/);
  await expect(page.getByText("No hay nada por revisar")).toBeVisible();
});

test("Tomás ve la aprobación y el comentario", async ({ page }) => {
  await login(page, STUDENT);
  await page.goto("/entregables");
  await expect(page.locator(".pill.approved").first()).toBeVisible();
  await page.goto("/dia/2026-10-17");
  await expect(page.getByText("Muy bien. Agrega cuántos clientes hay por provincia.")).toBeVisible();
});

test("las tareas y la evidencia de un día con tareas se guardan", async ({ page }) => {
  await login(page, STUDENT);
  await page.goto("/dia/2026-10-15");
  await expect(page.locator(".exercise")).toHaveCount(0);
  const tasks = page.locator("#tareas input[type=checkbox]");
  await expect(tasks).toHaveCount(3);
  await tasks.nth(0).check();
  await page.getByLabel("Evidencia (opcional)").fill("print('hola')");
  await expect(page.getByText("Guardado", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Evidencia (opcional)")).toHaveValue("print('hola')");
  await expect(page.locator("#tareas input[type=checkbox]").nth(0)).toBeChecked();
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
  await page.goto("/dia/2026-10-13");
  await expect(page.locator(".complete-banner")).toHaveCount(0);
  await expect(exerciseCard(page, "Catálogo básico").locator(".exercise-head .pill")).toHaveText("Sin intentos");
});
