import { z } from "zod";

const boolFromEnv = z
  .enum(["true", "false", "1", "0"])
  .transform((v) => v === "true" || v === "1");

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default("0.0.0.0"),
  DATABASE_URL: z.string().min(1, "Falta DATABASE_URL"),
  DATABASE_SSL: boolFromEnv.optional(),
  /** Ejecuta migraciones y datos iniciales al arrancar el servidor. */
  AUTO_MIGRATE: boolFromEnv.optional(),
  COOKIE_SECURE: boolFromEnv.optional(),
  SESSION_DAYS: z.coerce.number().int().min(1).max(90).default(30),
  /** Intentos de inicio de sesión permitidos por IP y usuario cada 5 minutos. */
  LOGIN_RATE_LIMIT: z.coerce.number().int().min(1).default(10),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).optional(),
  WEB_DIST: z.string().optional(),
  MIGRATIONS_DIR: z.string().optional(),
  /** Solo para pruebas: fija la fecha de "hoy" (AAAA-MM-DD). Se ignora en producción. */
  FAKE_TODAY: z.string().optional(),
  SEED_ADMIN_USERNAME: z.string().default("admin"),
  SEED_ADMIN_NAME: z.string().default("Administrador"),
  SEED_ADMIN_PASSWORD: z.string().optional(),
  SEED_STUDENT_USERNAME: z.string().default("tomas"),
  SEED_STUDENT_NAME: z.string().default("Tomás"),
  SEED_STUDENT_PASSWORD: z.string().optional(),
  /** Si se define, crea también la cuenta "prueba" (estudiante) para probar sin tocar la de Tomás. */
  SEED_TEST_PASSWORD: z.string().optional(),
});

export type Config = ReturnType<typeof loadConfig>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Configuración inválida: ${issues}`);
  }
  const e = parsed.data;
  const production = e.NODE_ENV === "production";
  return {
    env: e.NODE_ENV,
    production,
    port: e.PORT,
    host: e.HOST,
    databaseUrl: e.DATABASE_URL,
    databaseSsl: e.DATABASE_SSL ?? false,
    autoMigrate: e.AUTO_MIGRATE ?? production,
    cookieSecure: e.COOKIE_SECURE ?? production,
    sessionDays: e.SESSION_DAYS,
    loginRateLimit: e.LOGIN_RATE_LIMIT,
    logLevel: e.LOG_LEVEL ?? (e.NODE_ENV === "test" ? "silent" : "info"),
    webDist: e.WEB_DIST,
    migrationsDir: e.MIGRATIONS_DIR,
    fakeToday: production ? undefined : e.FAKE_TODAY,
    seed: {
      admin: {
        username: e.SEED_ADMIN_USERNAME,
        displayName: e.SEED_ADMIN_NAME,
        password: e.SEED_ADMIN_PASSWORD ?? (production ? undefined : "admin-local-1234"),
      },
      student: {
        username: e.SEED_STUDENT_USERNAME,
        displayName: e.SEED_STUDENT_NAME,
        password: e.SEED_STUDENT_PASSWORD ?? (production ? undefined : "1234"),
      },
      test: {
        username: "prueba",
        displayName: "Estudiante de prueba",
        password: e.SEED_TEST_PASSWORD ?? (production ? undefined : "prueba123"),
      },
    },
  };
}
