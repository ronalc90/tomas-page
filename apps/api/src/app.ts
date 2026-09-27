import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import { sql } from "drizzle-orm";
import Fastify, { type FastifyInstance } from "fastify";
import type { ApiErrorBody } from "@tomas/shared";
import type { Config } from "./config";
import { createContext, type AppContext } from "./context";
import type { Database } from "./db/client";
import { HttpError } from "./lib/errors";
import { loadSession } from "./plugins/auth";
import { adminRoutes } from "./routes/admin";
import { authRoutes } from "./routes/auth";
import { studentRoutes } from "./routes/student";

function readVersion(): string {
  if (process.env.APP_VERSION) return process.env.APP_VERSION;
  for (const file of [path.resolve(process.cwd(), "VERSION"), path.resolve(process.cwd(), "../../VERSION")]) {
    try {
      const value = readFileSync(file, "utf8").trim();
      if (value) return value;
    } catch {
      /* sin archivo VERSION */
    }
  }
  return process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev";
}

/** Versión desplegada (el commit). CI la escribe en el archivo VERSION antes de desplegar. */
export const VERSION = readVersion();

function resolveWebDist(explicit?: string): string | null {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    explicit,
    path.resolve(process.cwd(), "apps/web/dist"),
    path.resolve(process.cwd(), "../web/dist"),
    path.resolve(here, "../../web/dist"),
    path.resolve(here, "../../../apps/web/dist"),
  ].filter((p): p is string => Boolean(p));
  return candidates.find((p) => existsSync(path.join(p, "index.html"))) ?? null;
}

export async function buildApp(config: Config, db: Database): Promise<{ app: FastifyInstance; ctx: AppContext }> {
  const ctx = createContext(config, db);
  const app = Fastify({
    logger: {
      level: config.logLevel,
      redact: ["req.headers.cookie", "req.headers.authorization", 'res.headers["set-cookie"]'],
    },
    trustProxy: true,
    bodyLimit: 256 * 1024,
  });

  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:"],
        fontSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        upgradeInsecureRequests: config.production ? [] : null,
      },
    },
    hsts: config.production,
  });
  await app.register(cookie);
  await app.register(rateLimit, {
    global: false,
    errorResponseBuilder: (_req, context) => ({
      statusCode: 429,
      error: "too_many_requests",
      message: `Demasiados intentos. Espera ${Math.ceil(context.ttl / 1000)} segundos e inténtalo de nuevo.`,
    }),
  });

  app.decorateRequest("user", null);
  app.decorateRequest("sessionId", null);
  app.addHook("preHandler", async (request) => {
    if (request.url.startsWith("/api/") && request.url !== "/api/health") await loadSession(ctx, request);
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof HttpError) {
      const body: ApiErrorBody = { error: error.code, message: error.message, details: error.details };
      return reply.status(error.statusCode).send(body);
    }
    const status = (error as { statusCode?: number }).statusCode;
    if (status === 429) return reply.status(429).send(error);
    if (status && status >= 400 && status < 500) {
      return reply.status(status).send({ error: "bad_request", message: "La petición no es válida." });
    }
    request.log.error({ err: error }, "Error no controlado");
    return reply.status(500).send({ error: "internal", message: "Algo falló de nuestro lado. Inténtalo de nuevo." });
  });

  app.get("/api/health", async (_request, reply) => {
    try {
      await db.execute(sql`select 1`);
      return { status: "ok", database: "ok", version: VERSION };
    } catch {
      return reply.status(503).send({ status: "error", database: "unreachable", version: VERSION });
    }
  });

  await authRoutes(app, ctx);
  await studentRoutes(app, ctx);
  await adminRoutes(app, ctx);

  const webDist = resolveWebDist(config.webDist);
  if (webDist) {
    await app.register(fastifyStatic, {
      root: webDist,
      wildcard: false,
      setHeaders: (res, filePath) => {
        const immutable = filePath.includes(`${path.sep}assets${path.sep}`);
        res.setHeader("Cache-Control", immutable ? "public, max-age=31536000, immutable" : "no-cache");
      },
    });
    app.get("/*", (request, reply) => {
      const file = (request.params as { "*": string })["*"];
      if (file && existsSync(path.join(webDist, file)) && !file.includes("..")) return reply.sendFile(file);
      return reply.header("Cache-Control", "no-cache").sendFile("index.html");
    });
  }

  app.setNotFoundHandler((request, reply) => {
    reply.status(404).send({ error: "not_found", message: `No existe la ruta ${request.method} ${request.url}.` });
  });

  return { app, ctx };
}
