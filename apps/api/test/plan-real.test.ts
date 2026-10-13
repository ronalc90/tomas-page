import { afterAll, describe, expect, it } from "vitest";
import { adminDaySchema, adminDeliverableSchema, compareResults, isIsoDate, normalizeExercise, type SqlExercise } from "@tomas/shared";
import { loadPlan } from "../src/db/seed";
import { SqlRunner } from "../src/services/sqlRunner";

/**
 * El plan real (packages/shared/src/data/plan.json): el resto de las pruebas usa el plan de prueba,
 * esta solo comprueba que el contenido que se publica carga bien y que sus ejercicios se pueden calificar.
 */
// PLAN_REAL_FILE permite revisar un plan provisional sin reemplazar el del paquete.
const plan = loadPlan(process.env.PLAN_REAL_FILE);
/** El plan anterior (sin ejercicios) no se revisa con las reglas del formato nuevo. */
const newFormat = plan.weeks.some((w) => w.days.some((d) => d.exercises !== undefined));
const runner = new SqlRunner({ timeoutMs: 10_000 });
afterAll(() => runner.close());

const exercises: { where: string; exercise: SqlExercise }[] = plan.weeks.flatMap((w) => [
  ...w.days.flatMap((d) => (d.exercises ?? []).map((e) => ({ where: d.date, exercise: normalizeExercise(e) }))),
  ...(w.deliverable?.exercises ?? []).map((e) => ({ where: `${w.id} (entregable)`, exercise: normalizeExercise(e) })),
]);

describe("plan.json real", () => {
  it("tiene fases, semanas con fechas válidas y entregables", () => {
    expect(plan.phases.length).toBeGreaterThan(0);
    expect(plan.weeks.length).toBeGreaterThan(0);
    const phaseIds = new Set(plan.phases.map((p) => p.id));
    const dates = new Set<string>();
    for (const w of plan.weeks) {
      expect(phaseIds.has(w.phaseId), w.id).toBe(true);
      for (const d of w.days) {
        expect(isIsoDate(d.date), d.date).toBe(true);
        expect(dates.has(d.date), `fecha repetida ${d.date}`).toBe(false);
        dates.add(d.date);
      }
      if (w.deliverable) expect(isIsoDate(w.deliverable.dueDate), w.id).toBe(true);
    }
  });

  it.skipIf(!newFormat)("el administrador puede editar cada día y cada entregable sin que la validación lo rechace", () => {
    for (const w of plan.weeks) {
      for (const d of w.days.filter((x) => x.kind === "workshop")) {
        const parsed = adminDaySchema.safeParse({ ...d, exercises: (d.exercises ?? []).map(normalizeExercise) });
        expect(parsed.success, `${d.date}: ${parsed.error?.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`).toBe(true);
      }
      if (w.deliverable) {
        const parsed = adminDeliverableSchema.safeParse({ ...w.deliverable, exercises: (w.deliverable.exercises ?? []).map(normalizeExercise) });
        expect(parsed.success, `${w.id}: ${parsed.error?.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`).toBe(true);
      }
    }
  });

  it("los ids de los ejercicios son únicos en todo el plan", () => {
    const ids = exercises.map((e) => e.exercise.id);
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
  });

  it.skipIf(!newFormat)(
    "la solución de cada ejercicio corre en sql.js, devuelve filas y se califica como correcta",
    async () => {
      const problems: string[] = [];
      for (const { where, exercise: e } of exercises) {
        const out = await runner.run({ setup: e.setup, sql: e.solution, check: e.check });
        if (!out.ok) {
          problems.push(`${where} ${e.id}: ${out.timeout ? "tarda demasiado" : out.error}`);
          continue;
        }
        if (!out.result || out.result.rows.length === 0) {
          problems.push(`${where} ${e.id}: no devuelve filas`);
          continue;
        }
        const again = await runner.run({ setup: e.setup, sql: e.solution, check: e.check });
        const verdict = compareResults(out.result, again.ok ? again.result : null, e.orderMatters);
        if (!verdict.correct) problems.push(`${where} ${e.id}: ${verdict.message}`);
      }
      expect(problems).toEqual([]);
    },
    120_000,
  );
});
