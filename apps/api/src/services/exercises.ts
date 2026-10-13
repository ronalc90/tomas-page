import { and, eq, inArray } from "drizzle-orm";
import {
  compareResults,
  formatSqlError,
  previewResult,
  REVEAL_AFTER_ATTEMPTS,
  SQL_TIMEOUT_MESSAGE,
  type ExerciseCheckResult,
  type ExerciseState,
  type ExerciseView,
  type SqlExercise,
  type SqlResult,
} from "@tomas/shared";
import type { Database } from "../db/client";
import { exerciseProgress } from "../db/schema";
import { HttpError } from "../lib/errors";
import type { RawResult, SqlRunner } from "./sqlRunner";

/** Resultado de la solución de un ejercicio (o por qué falló). */
type Expected = { ok: true; result: RawResult } | { ok: false; error: string };

const EMPTY_STATE: ExerciseState = { attempts: 0, solved: false, solvedAt: null, revealed: false, lastSql: null };

/** Filas del resultado del estudiante que se devuelven para mostrar. */
const RESULT_PREVIEW_ROWS = 200;

function cacheKey(e: SqlExercise): string {
  return `${e.setup}\u0000${e.solution}\u0000${e.check}`;
}

export function toResult(raw: RawResult): SqlResult {
  return { columns: raw.columns, rows: raw.rows };
}

/**
 * Ejercicios SQL: resultado esperado (en caché), calificación y la vista del estudiante.
 * La caché se guarda por ejercicio y por contenido (setup + solución + check), así una
 * edición del administrador la invalida sola; además se limpia al guardar contenido.
 */
export class ExerciseService {
  private expected = new Map<string, { key: string; value: Promise<Expected> }>();

  constructor(
    private readonly db: Database,
    private readonly runner: SqlRunner,
  ) {}

  invalidate(): void {
    this.expected.clear();
  }

  /** Resultado de la solución, calculado una vez. */
  expectedFor(e: SqlExercise): Promise<Expected> {
    const key = cacheKey(e);
    const hit = this.expected.get(e.id);
    if (hit && hit.key === key) return hit.value;
    const value = this.runner.run({ setup: e.setup, sql: e.solution, check: e.check }).then(
      (out): Expected => {
        if (out.ok && out.result) return { ok: true, result: out.result };
        if (out.ok) return { ok: false, error: "la solución no devuelve filas (falta un SELECT o el check)" };
        if (out.timeout) return { ok: false, error: "la solución tardó demasiado" };
        return { ok: false, error: `${out.phase === "setup" ? "el setup" : out.phase === "check" ? "el check" : "la solución"} falla: ${out.error}` };
      },
      (err: Error): Expected => ({ ok: false, error: err.message }),
    );
    this.expected.set(e.id, { key, value });
    // Un error transitorio (p. ej. el servidor cerrándose) no debe quedar en caché.
    void value.then((v) => {
      if (!v.ok && /cerr/.test(v.error)) this.expected.delete(e.id);
    });
    return value;
  }

  /** Comprueba que un ejercicio se puede calificar (para el editor del administrador). */
  async validate(e: SqlExercise): Promise<string | null> {
    const out = await this.runner.run({ setup: e.setup, sql: e.solution, check: e.check });
    if (out.ok && out.result && out.result.rows.length > 0) return null;
    if (out.ok && out.result) return "la solución devuelve 0 filas: el ejercicio no se podría comprobar";
    if (out.ok) return "la solución no devuelve filas: si modifica datos, escribe un check con un SELECT que muestre el efecto";
    if (out.timeout) return "la solución tarda demasiado";
    return `${out.phase === "setup" ? "el setup" : out.phase === "check" ? "el check" : "la solución"} falla: ${out.error}`;
  }

  /** Avance del usuario en estos ejercicios. */
  async states(userId: string, ids: string[]): Promise<Map<string, ExerciseState>> {
    if (ids.length === 0) return new Map();
    const rows = await this.db
      .select()
      .from(exerciseProgress)
      .where(and(eq(exerciseProgress.userId, userId), inArray(exerciseProgress.exerciseId, ids)));
    return new Map(
      rows.map((r) => [
        r.exerciseId,
        { attempts: r.attempts, solved: r.solved, solvedAt: r.solvedAt, revealed: r.revealed, lastSql: r.lastSql },
      ]),
    );
  }

  async views(userId: string, exercises: SqlExercise[]): Promise<ExerciseView[]> {
    if (exercises.length === 0) return [];
    const [states, expected] = await Promise.all([
      this.states(
        userId,
        exercises.map((e) => e.id),
      ),
      Promise.all(exercises.map((e) => this.expectedFor(e))),
    ]);
    return exercises.map((e, i) => {
      const state = states.get(e.id) ?? EMPTY_STATE;
      const exp = expected[i];
      return {
        id: e.id,
        title: e.title,
        prompt: e.prompt,
        hint: e.hint,
        starter: e.starter,
        setup: e.setup,
        orderMatters: e.orderMatters,
        expected: exp.ok ? previewResult(toResult(exp.result)) : null,
        expectedRowCount: exp.ok ? exp.result.rows.length : 0,
        state,
        solution: state.solved || state.revealed ? e.solution : null,
      };
    });
  }

  /** Califica el SQL del estudiante. No guarda nada: eso lo hace la ruta. */
  async grade(e: SqlExercise, sql: string): Promise<Omit<ExerciseCheckResult, "state" | "solution">> {
    const expected = await this.expectedFor(e);
    if (!expected.ok) {
      throw new HttpError(500, "exercise_broken", `Este ejercicio tiene un problema en su contenido (${expected.error}). Avísale al administrador.`);
    }
    const out = await this.runner.run({ setup: e.setup, sql, check: e.check });
    if (!out.ok && out.timeout) {
      return { correct: false, message: SQL_TIMEOUT_MESSAGE, result: null, resultRowCount: 0, error: SQL_TIMEOUT_MESSAGE };
    }
    if (!out.ok) {
      const error = formatSqlError(out.error);
      const message =
        out.phase === "check"
          ? "Tu SQL corrió, pero después la comprobación falló (¿borraste o cambiaste la tabla?)."
          : "Tu SQL tiene un error. Lee la explicación, corrígelo y vuelve a comprobar.";
      return { correct: false, message, result: null, resultRowCount: 0, error };
    }
    const actual = out.result ? toResult(out.result) : null;
    const verdict = compareResults(toResult(expected.result), actual, e.orderMatters);
    return {
      correct: verdict.correct,
      message: verdict.message,
      result: actual ? previewResult(actual, RESULT_PREVIEW_ROWS) : null,
      resultRowCount: actual?.rows.length ?? 0,
      error: null,
    };
  }

  canReveal(state: ExerciseState): boolean {
    return state.solved || state.attempts >= REVEAL_AFTER_ATTEMPTS;
  }
}
