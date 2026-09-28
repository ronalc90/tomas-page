import { sql } from "drizzle-orm";
import {
  boolean,
  customType,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("role", ["student", "admin"]);
export const dayKindEnum = pgEnum("day_kind", ["workshop", "holiday", "free"]);
export const submissionStatusEnum = pgEnum("submission_status", ["draft", "submitted", "approved", "changes_requested"]);

/** timestamptz que se lee siempre como texto ISO 8601 ("2026-09-28T14:03:00.000Z"). */
const isoTimestamp = customType<{ data: string; driverData: string | Date }>({
  dataType: () => "timestamp with time zone",
  fromDriver: (value) => new Date(value).toISOString(),
  toDriver: (value) => value,
});

const createdAt = () => isoTimestamp("created_at").notNull().default(sql`now()`);
const updatedAt = () => isoTimestamp("updated_at").notNull().default(sql`now()`);

// ---------- Personas y sesiones ----------

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    username: text("username").notNull(),
    displayName: text("display_name").notNull(),
    role: roleEnum("role").notNull().default("student"),
    passwordHash: text("password_hash").notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
    lastLoginAt: isoTimestamp("last_login_at"),
  },
  (t) => [uniqueIndex("users_username_lower_idx").on(sql`lower(${t.username})`)],
);

export const sessions = pgTable(
  "sessions",
  {
    /** SHA-256 del token; el token en claro solo vive en la cookie. */
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
    lastSeenAt: isoTimestamp("last_seen_at").notNull().default(sql`now()`),
    expiresAt: isoTimestamp("expires_at").notNull(),
    userAgent: text("user_agent"),
    ip: text("ip"),
  },
  (t) => [index("sessions_user_idx").on(t.userId), index("sessions_expires_idx").on(t.expiresAt)],
);

// ---------- Contenido del plan ----------

export const phases = pgTable("phases", {
  id: integer("id").primaryKey(),
  name: text("name").notNull(),
  rangeLabel: text("range_label").notNull(),
  goal: text("goal").notNull(),
});

export const weeks = pgTable("weeks", {
  id: text("id").primaryKey(),
  number: integer("number").notNull(),
  phaseId: integer("phase_id")
    .notNull()
    .references(() => phases.id),
  title: text("title").notNull(),
  rangeLabel: text("range_label").notNull(),
});

export const days = pgTable(
  "days",
  {
    date: date("date", { mode: "string" }).primaryKey(),
    weekId: text("week_id")
      .notNull()
      .references(() => weeks.id),
    kind: dayKindEnum("kind").notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull().default(""),
    concept: text("concept").notNull().default(""),
    tip: text("tip").notNull().default(""),
    example: text("example").notNull().default(""),
    language: text("language").notNull().default("python"),
    exampleOutput: text("example_output").notNull().default(""),
    tasks: jsonb("tasks").$type<string[]>().notNull().default([]),
    updatedAt: updatedAt(),
  },
  (t) => [index("days_week_idx").on(t.weekId)],
);

export const questions = pgTable(
  "questions",
  {
    id: serial("id").primaryKey(),
    date: date("date", { mode: "string" })
      .notNull()
      .references(() => days.date, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    prompt: text("prompt").notNull(),
    code: text("code").notNull().default(""),
    options: jsonb("options").$type<string[]>().notNull(),
    correctIndex: integer("correct_index").notNull(),
    explanation: text("explanation").notNull(),
  },
  (t) => [uniqueIndex("questions_date_position_idx").on(t.date, t.position)],
);

export const deliverables = pgTable("deliverables", {
  id: text("id").primaryKey(),
  weekId: text("week_id")
    .notNull()
    .unique()
    .references(() => weeks.id),
  dueDate: date("due_date", { mode: "string" }).notNull(),
  kind: text("kind").notNull().default("weekly"),
  path: text("path").notNull(),
  description: text("description").notNull(),
  criteria: jsonb("criteria").$type<string[]>().notNull().default([]),
});

// ---------- Avance de cada estudiante ----------

export const dayProgress = pgTable(
  "day_progress",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: date("date", { mode: "string" })
      .notNull()
      .references(() => days.date, { onDelete: "cascade" }),
    tasks: jsonb("tasks").$type<boolean[]>().notNull().default([]),
    evidence: text("evidence").notNull().default(""),
    completedAt: isoTimestamp("completed_at"),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.date] })],
);

export const quizAttempts = pgTable(
  "quiz_attempts",
  {
    id: serial("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: date("date", { mode: "string" })
      .notNull()
      .references(() => days.date, { onDelete: "cascade" }),
    answers: jsonb("answers").$type<number[]>().notNull(),
    score: integer("score").notNull(),
    total: integer("total").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("quiz_attempts_user_date_idx").on(t.userId, t.date)],
);

export const submissions = pgTable(
  "submissions",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    deliverableId: text("deliverable_id")
      .notNull()
      .references(() => deliverables.id, { onDelete: "cascade" }),
    criteria: jsonb("criteria").$type<boolean[]>().notNull().default([]),
    evidence: text("evidence").notNull().default(""),
    status: submissionStatusEnum("status").notNull().default("draft"),
    submittedAt: isoTimestamp("submitted_at"),
    reviewedAt: isoTimestamp("reviewed_at"),
    reviewerId: uuid("reviewer_id").references(() => users.id, { onDelete: "set null" }),
    feedback: text("feedback").notNull().default(""),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.deliverableId] }), index("submissions_status_idx").on(t.status)],
);

// ---------- Registro y ajustes ----------

export const activity = pgTable(
  "activity",
  {
    id: serial("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    ref: text("ref"),
    detail: jsonb("detail").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index("activity_created_idx").on(t.createdAt), index("activity_user_idx").on(t.userId)],
);

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
});
