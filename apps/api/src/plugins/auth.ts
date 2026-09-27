import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, sql } from "drizzle-orm";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { SessionUser } from "@tomas/shared";
import type { AppContext } from "../context";
import { sessions, users } from "../db/schema";
import { forbidden, unauthorized } from "../lib/errors";

export const SESSION_COOKIE = "tp_session";
/** Cada cuánto se actualiza "última vez visto" y se renueva la expiración. */
const TOUCH_EVERY_MS = 10 * 60 * 1000;

declare module "fastify" {
  interface FastifyRequest {
    user: SessionUser | null;
    sessionId: string | null;
  }
}

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function createSession(ctx: AppContext, reply: FastifyReply, request: FastifyRequest, userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + ctx.config.sessionDays * 86_400_000);
  await ctx.db.insert(sessions).values({
    id: hashToken(token),
    userId,
    expiresAt: expires.toISOString(),
    userAgent: request.headers["user-agent"]?.slice(0, 300) ?? null,
    ip: request.ip,
  });
  reply.setCookie(SESSION_COOKIE, token, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: ctx.config.cookieSecure,
    expires,
  });
}

export function clearSessionCookie(ctx: AppContext, reply: FastifyReply) {
  reply.clearCookie(SESSION_COOKIE, { path: "/", httpOnly: true, sameSite: "lax", secure: ctx.config.cookieSecure });
}

/** Lee la cookie de sesión y carga el usuario (si la sesión es válida y la cuenta está activa). */
export async function loadSession(ctx: AppContext, request: FastifyRequest): Promise<void> {
  request.user = null;
  request.sessionId = null;
  const token = request.cookies[SESSION_COOKIE];
  if (!token || token.length > 200) return;

  const id = hashToken(token);
  const [row] = await ctx.db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      role: users.role,
      lastSeenAt: sessions.lastSeenAt,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, id), gt(sessions.expiresAt, sql`now()`), eq(users.active, true)));
  if (!row) return;

  request.user = { id: row.id, username: row.username, displayName: row.displayName, role: row.role };
  request.sessionId = id;

  if (Date.now() - new Date(row.lastSeenAt).getTime() > TOUCH_EVERY_MS) {
    const expires = new Date(Date.now() + ctx.config.sessionDays * 86_400_000).toISOString();
    await ctx.db
      .update(sessions)
      .set({ lastSeenAt: sql`now()`, expiresAt: expires })
      .where(eq(sessions.id, id));
  }
}

export function requireUser(request: FastifyRequest): SessionUser {
  if (!request.user) throw unauthorized();
  return request.user;
}

export function requireAdmin(request: FastifyRequest): SessionUser {
  const user = requireUser(request);
  if (user.role !== "admin") throw forbidden("Esta sección es solo para administradores.");
  return user;
}

export async function revokeUserSessions(ctx: AppContext, userId: string, exceptSessionId?: string | null) {
  await ctx.db
    .delete(sessions)
    .where(
      exceptSessionId
        ? and(eq(sessions.userId, userId), sql`${sessions.id} <> ${exceptSessionId}`)
        : eq(sessions.userId, userId),
    );
}
