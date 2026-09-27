import { eq, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { changePasswordSchema, loginSchema, type MeResponse } from "@tomas/shared";
import type { AppContext } from "../context";
import { sessions, users } from "../db/schema";
import { badRequest, parse, unauthorized } from "../lib/errors";
import { dummyHash, hashPassword, verifyPassword } from "../lib/password";
import { clearSessionCookie, createSession, requireUser, revokeUserSessions } from "../plugins/auth";
import { logActivity } from "../services/activity";

export async function authRoutes(app: FastifyInstance, ctx: AppContext) {
  app.post(
    "/api/auth/login",
    {
      config: {
        rateLimit: {
          max: ctx.config.loginRateLimit,
          timeWindow: "5 minutes",
          // Se evalúa con el cuerpo ya leído: el límite es por IP y usuario, así un
          // estudiante bloqueado no bloquea a los demás que comparten la misma red.
          hook: "preHandler",
          keyGenerator: (req) => {
            const username = (req.body as { username?: unknown } | undefined)?.username;
            return `${req.ip}:${typeof username === "string" ? username.trim().toLowerCase().slice(0, 64) : ""}`;
          },
        },
      },
    },
    async (request, reply) => {
      const input = parse(loginSchema, request.body);
      const [user] = await ctx.db
        .select()
        .from(users)
        .where(eq(sql`lower(${users.username})`, input.username));

      const valid = await verifyPassword(input.password, user?.passwordHash ?? (await dummyHash()));
      if (!user || !valid || !user.active) {
        throw unauthorized("Usuario o contraseña incorrectos.");
      }

      await createSession(ctx, reply, request, user.id);
      await ctx.db.update(users).set({ lastLoginAt: sql`now()` }).where(eq(users.id, user.id));
      await logActivity(ctx, user.id, "login");
      return { user: { id: user.id, username: user.username, displayName: user.displayName, role: user.role } };
    },
  );

  app.post("/api/auth/logout", async (request, reply) => {
    if (request.sessionId) await ctx.db.delete(sessions).where(eq(sessions.id, request.sessionId));
    clearSessionCookie(ctx, reply);
    return { ok: true };
  });

  // Sin sesión responde 204 (no es un error: la web muestra el inicio de sesión).
  app.get("/api/auth/me", async (request, reply): Promise<MeResponse | undefined> => {
    if (!request.user) {
      reply.code(204).send();
      return;
    }
    const user = request.user;
    const [settings, today] = await Promise.all([ctx.settings.get(), ctx.today()]);
    return { user, today, settings };
  });

  app.post(
    "/api/auth/password",
    { config: { rateLimit: { max: 10, timeWindow: "5 minutes" } } },
    async (request) => {
      const user = requireUser(request);
      const input = parse(changePasswordSchema, request.body);
      const [row] = await ctx.db.select().from(users).where(eq(users.id, user.id));
      if (!row || !(await verifyPassword(input.currentPassword, row.passwordHash))) {
        throw badRequest("La contraseña actual no es correcta.", { fields: { currentPassword: "No es correcta" } });
      }
      if (row.role === "admin" && input.newPassword.length < 10) {
        throw badRequest("Para administradores usa al menos 10 caracteres.", {
          fields: { newPassword: "Usa al menos 10 caracteres" },
        });
      }
      await ctx.db
        .update(users)
        .set({ passwordHash: await hashPassword(input.newPassword) })
        .where(eq(users.id, user.id));
      await revokeUserSessions(ctx, user.id, request.sessionId);
      await logActivity(ctx, user.id, "password_changed");
      return { ok: true };
    },
  );
}
