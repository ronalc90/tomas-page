import { z } from "zod";
import { isIsoDate } from "./dates";

/** Validaciones de las peticiones. Las usa la API y los formularios de la web. */

export const STUDENT_MIN_PASSWORD = 4;
export const ADMIN_MIN_PASSWORD = 10;
export const EVIDENCE_MAX = 20_000;

export const isoDateSchema = z.string().refine(isIsoDate, "Fecha inválida (usa AAAA-MM-DD)");

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "El usuario debe tener al menos 3 caracteres")
  .max(32, "El usuario puede tener hasta 32 caracteres")
  .regex(/^[a-z0-9._-]+$/, "Usa solo letras sin tildes, números, punto, guion o guion bajo");

export const loginSchema = z.object({
  username: z.string().trim().toLowerCase().min(1, "Escribe tu usuario").max(64),
  password: z.string().min(1, "Escribe tu contraseña").max(200),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Escribe tu contraseña actual").max(200),
  newPassword: z.string().min(STUDENT_MIN_PASSWORD, `Usa al menos ${STUDENT_MIN_PASSWORD} caracteres`).max(200),
});

export const dayProgressSchema = z
  .object({
    tasks: z.array(z.boolean()).max(20).optional(),
    evidence: z.string().max(EVIDENCE_MAX, "La evidencia es demasiado larga").optional(),
    challengeDone: z.boolean().optional(),
  })
  .refine((v) => v.tasks !== undefined || v.evidence !== undefined || v.challengeDone !== undefined, "No hay cambios para guardar");

export const ANSWER_MAX = 500;

export const quizAttemptSchema = z.object({
  answers: z.array(z.union([z.number().int().min(0).max(9), z.string().max(ANSWER_MAX)])).min(1).max(20),
  /** Posiciones de las preguntas en las que se destapó la pista. */
  hints: z.array(z.number().int().min(0).max(19)).max(20).default([]),
});

export const submissionDraftSchema = z
  .object({
    criteria: z.array(z.boolean()).max(20).optional(),
    evidence: z.string().max(EVIDENCE_MAX, "La evidencia es demasiado larga").optional(),
  })
  .refine((v) => v.criteria !== undefined || v.evidence !== undefined, "No hay cambios para guardar");

export const reviewSchema = z.object({
  decision: z.enum(["approved", "changes_requested"]),
  feedback: z.string().trim().max(5_000).default(""),
});

export const roleSchema = z.enum(["student", "admin"]);

export const createUserSchema = z
  .object({
    username: usernameSchema,
    displayName: z.string().trim().min(1, "Escribe el nombre").max(80),
    role: roleSchema.default("student"),
    password: z.string().max(200),
  })
  .superRefine((v, ctx) => {
    const min = v.role === "admin" ? ADMIN_MIN_PASSWORD : STUDENT_MIN_PASSWORD;
    if (v.password.length < min) {
      ctx.addIssue({ code: "custom", path: ["password"], message: `Usa al menos ${min} caracteres` });
    }
  });

export const updateUserSchema = z
  .object({
    displayName: z.string().trim().min(1).max(80).optional(),
    role: roleSchema.optional(),
    active: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "No hay cambios para guardar");

export const resetPasswordSchema = z.object({
  password: z.string().min(STUDENT_MIN_PASSWORD, `Usa al menos ${STUDENT_MIN_PASSWORD} caracteres`).max(200),
});

export const questionTypeSchema = z.enum(["choice", "boolean", "output", "fill"]);
export const languageSchema = z.enum(["python", "sql", "bash"]);

export const adminQuestionSchema = z
  .object({
    type: questionTypeSchema.default("choice"),
    prompt: z.string().trim().min(1, "La pregunta no puede estar vacía").max(1_000),
    code: z.string().max(4_000).default(""),
    options: z.array(z.string().trim().min(1, "Ninguna opción puede estar vacía").max(500)).max(6).default([]),
    correctIndex: z.number().int().min(0).default(0),
    accepted: z.array(z.string().trim().min(1, "Ninguna respuesta puede estar vacía").max(300)).max(8).default([]),
    optionFeedback: z.array(z.string().trim().max(500)).max(6).default([]),
    explanation: z.string().trim().min(1, "Escribe la explicación").max(2_000),
    hint: z.string().trim().max(400).default(""),
  })
  .superRefine((q, ctx) => {
    if (q.type === "choice" || q.type === "boolean") {
      if (q.options.length < 2) ctx.addIssue({ code: "custom", path: ["options"], message: "Escribe al menos dos opciones" });
      if (q.type === "boolean" && q.options.length !== 2) ctx.addIssue({ code: "custom", path: ["options"], message: "Verdadero/falso tiene dos opciones" });
      if (q.correctIndex >= q.options.length) ctx.addIssue({ code: "custom", path: ["correctIndex"], message: "La respuesta correcta no existe" });
      if (new Set(q.options).size !== q.options.length) ctx.addIssue({ code: "custom", path: ["options"], message: "Hay opciones repetidas" });
      if (q.optionFeedback.length > 0 && q.optionFeedback.length !== q.options.length) {
        ctx.addIssue({ code: "custom", path: ["optionFeedback"], message: "Escribe un comentario por opción (o ninguno)" });
      }
    } else {
      if (q.accepted.length === 0) ctx.addIssue({ code: "custom", path: ["accepted"], message: "Escribe al menos una respuesta aceptada" });
      if (!q.code.trim()) ctx.addIssue({ code: "custom", path: ["code"], message: "Esta pregunta necesita código" });
      if (q.type === "fill" && q.code.split("____").length !== 2) {
        ctx.addIssue({ code: "custom", path: ["code"], message: "Marca el hueco con ____ (una sola vez)" });
      }
    }
  });

export const tutorialStepSchema = z.object({
  title: z.string().trim().min(1, "El paso necesita un título").max(120),
  body: z.string().trim().min(1, "Explica el paso").max(3_000),
  code: z.string().max(6_000).default(""),
  language: languageSchema.default("python"),
});

export const commonErrorSchema = z.object({
  error: z.string().trim().min(1).max(300),
  cause: z.string().trim().min(1).max(1_000),
  fix: z.string().trim().min(1).max(1_000),
});

export const challengeSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(3_000),
  hint: z.string().trim().max(1_000).default(""),
  solution: z.string().max(8_000).default(""),
  language: languageSchema.default("python"),
});

export const adminDaySchema = z.object({
  title: z.string().trim().min(1).max(200),
  summary: z.string().trim().max(2_000).default(""),
  objectives: z.array(z.string().trim().min(1).max(300)).max(6).default([]),
  concept: z.string().trim().max(5_000).default(""),
  tip: z.string().trim().max(1_000).default(""),
  example: z.string().max(10_000).default(""),
  language: languageSchema,
  exampleOutput: z.string().max(10_000).default(""),
  steps: z.array(tutorialStepSchema).max(10).default([]),
  commonErrors: z.array(commonErrorSchema).max(8).default([]),
  tasks: z.array(z.string().trim().min(1).max(1_000)).max(10),
  taskHints: z.array(z.string().trim().max(1_000)).max(10).default([]),
  challenge: challengeSchema.nullable().default(null),
  glossary: z.array(z.object({ term: z.string().trim().min(1).max(80), definition: z.string().trim().min(1).max(800) })).max(10).default([]),
  resources: z.array(z.object({ title: z.string().trim().min(1).max(150), url: z.string().trim().url("Escribe una dirección válida").max(400) })).max(6).default([]),
  questions: z.array(adminQuestionSchema).max(10),
});

export const adminDeliverableSchema = z.object({
  path: z.string().trim().min(1).max(300),
  description: z.string().trim().min(1).max(3_000),
  criteria: z.array(z.string().trim().min(1).max(500)).min(1).max(10),
  steps: z.array(z.string().trim().min(1).max(1_000)).max(10).default([]),
  tips: z.array(z.string().trim().min(1).max(800)).max(6).default([]),
  stretch: z.string().trim().max(1_000).default(""),
  checklist: z.array(z.string().trim().min(1).max(400)).max(8).default([]),
});

export const settingsSchema = z.object({
  passScore: z.number().int().min(1).max(10),
  programName: z.string().trim().min(1).max(120),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type DayProgressInput = z.infer<typeof dayProgressSchema>;
export type QuizAttemptInput = z.infer<typeof quizAttemptSchema>;
export type SubmissionDraftInput = z.infer<typeof submissionDraftSchema>;
export type ReviewInput = z.infer<typeof reviewSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type AdminDayInput = z.infer<typeof adminDaySchema>;
export type AdminDeliverableInput = z.infer<typeof adminDeliverableSchema>;
export type SettingsInput = z.infer<typeof settingsSchema>;
