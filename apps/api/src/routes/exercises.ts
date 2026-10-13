import { and, eq, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import {
  exerciseCheckSchema,
  REVEAL_AFTER_ATTEMPTS,
  type ExerciseCheckResult,
  type ExerciseRevealResult,
  type ExerciseState,
} from "@tomas/shared";
import type { AppContext } from "../context";
import { exerciseProgress, studyTime } from "../db/schema";
import { conflict, notFound, parse } from "../lib/errors";
import { requireUser } from "../plugins/auth";
import { logActivity } from "../services/activity";
import { refreshWorkshopCompletion } from "../services/progress";

/** Los pings más seguidos que esto no suman minutos (el cliente envía uno cada 60 s). */
const PING_MIN_SECONDS = 50;

export async function exerciseRoutes(app: FastifyInstance, ctx: AppContext) {
  async function findExercise(id: string) {
    const found = (await ctx.plan.get()).exercises.get(id);
    if (!found) throw notFound("Ese ejercicio no existe.");
    return found;
  }

  async function stateOf(userId: string, exerciseId: string): Promise<ExerciseState> {
    return (
      (await ctx.exercises.states(userId, [exerciseId])).get(exerciseId) ?? {
        attempts: 0,
        solved: false,
        solvedAt: null,
        revealed: false,
        lastSql: null,
      }
    );
  }

  app.post<{ Params: { id: string } }>(
    "/api/exercises/:id/check",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (request): Promise<ExerciseCheckResult> => {
      const user = requireUser(request);
      const input = parse(exerciseCheckSchema, request.body);
      const { exercise, date, deliverableId } = await findExercise(request.params.id);
      const before = await stateOf(user.id, exercise.id);

      const graded = await ctx.exercises.grade(exercise, input.sql);

      await ctx.db
        .insert(exerciseProgress)
        .values({
          userId: user.id,
          exerciseId: exercise.id,
          date,
          deliverableId,
          attempts: 1,
          solved: graded.correct,
          solvedAt: graded.correct ? sql`now()` : null,
          lastSql: input.sql,
        })
        .onConflictDoUpdate({
          target: [exerciseProgress.userId, exerciseProgress.exerciseId],
          set: {
            attempts: sql`${exerciseProgress.attempts} + 1`,
            // Un ejercicio resuelto sigue resuelto aunque una comprobación posterior falle.
            solved: sql`${exerciseProgress.solved} OR excluded.solved`,
            solvedAt: sql`coalesce(${exerciseProgress.solvedAt}, excluded.solved_at)`,
            lastSql: input.sql,
            date,
            deliverableId,
            updatedAt: sql`now()`,
          },
        });

      if (graded.correct && !before.solved) {
        await logActivity(ctx, user.id, "exercise_solved", exercise.id, {
          title: exercise.title,
          attempts: before.attempts + 1,
          date,
          deliverableId,
        });
      }
      if (date) await refreshWorkshopCompletion(ctx, user.id, date);

      const state = await stateOf(user.id, exercise.id);
      return { ...graded, state, solution: state.solved || state.revealed ? exercise.solution : null };
    },
  );

  app.post<{ Params: { id: string } }>("/api/exercises/:id/reveal", async (request): Promise<ExerciseRevealResult> => {
    const user = requireUser(request);
    const { exercise, date, deliverableId } = await findExercise(request.params.id);
    const state = await stateOf(user.id, exercise.id);
    if (!ctx.exercises.canReveal(state)) {
      throw conflict(`La solución se habilita después de ${REVEAL_AFTER_ATTEMPTS} intentos. Llevas ${state.attempts}.`);
    }
    if (!state.revealed) {
      await ctx.db
        .update(exerciseProgress)
        .set({ revealed: true, updatedAt: sql`now()` })
        .where(and(eq(exerciseProgress.userId, user.id), eq(exerciseProgress.exerciseId, exercise.id)));
      await logActivity(ctx, user.id, "solution_revealed", exercise.id, { title: exercise.title, date, deliverableId });
    }
    return { solution: exercise.solution, state: await stateOf(user.id, exercise.id) };
  });

  /**
   * Tiempo de estudio: el cliente envía un ping por minuto mientras la pestaña está visible y hubo
   * actividad reciente. Cada ping suma 1 minuto a la fecha de hoy, como máximo uno cada 50 s por usuario.
   */
  app.post(
    "/api/activity/ping",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (request): Promise<{ counted: boolean; minutesToday: number }> => {
      const user = requireUser(request);
      const today = await ctx.today();
      const counted = await ctx.db.transaction(async (tx) => {
        // Un ping a la vez por usuario, para que dos pestañas no sumen dos minutos.
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`study:${user.id}`}))`);
        const rows = await tx.execute<{ minutes: number }>(sql`
          insert into ${studyTime} (user_id, date, minutes, updated_at)
          select ${user.id}, ${today}, 1, now()
          where coalesce(
            (select max(updated_at) from ${studyTime} where user_id = ${user.id}),
            '-infinity'::timestamptz
          ) < now() - make_interval(secs => ${PING_MIN_SECONDS})
          on conflict (user_id, date) do update set minutes = ${studyTime}.minutes + 1, updated_at = now()
          returning minutes`);
        return rows.rows.length > 0;
      });
      const [row] = await ctx.db
        .select({ minutes: studyTime.minutes })
        .from(studyTime)
        .where(and(eq(studyTime.userId, user.id), eq(studyTime.date, today)));
      return { counted, minutesToday: row?.minutes ?? 0 };
    },
  );
}
