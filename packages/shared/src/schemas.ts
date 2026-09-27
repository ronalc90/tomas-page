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
  })
  .refine((v) => v.tasks !== undefined || v.evidence !== undefined, "No hay cambios para guardar");

export const quizAttemptSchema = z.object({
  answers: z.array(z.number().int().min(0).max(9)).min(1).max(20),
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

export const adminQuestionSchema = z
  .object({
    prompt: z.string().trim().min(1, "La pregunta no puede estar vacía").max(1_000),
    code: z.string().max(4_000).default(""),
    options: z.array(z.string().trim().min(1, "Ninguna opción puede estar vacía").max(500)).min(2).max(6),
    correctIndex: z.number().int().min(0),
    explanation: z.string().trim().min(1, "Escribe la explicación").max(2_000),
  })
  .refine((q) => q.correctIndex < q.options.length, { message: "La respuesta correcta no existe", path: ["correctIndex"] })
  .refine((q) => new Set(q.options).size === q.options.length, { message: "Hay opciones repetidas", path: ["options"] });

export const adminDaySchema = z.object({
  title: z.string().trim().min(1).max(200),
  summary: z.string().trim().max(2_000).default(""),
  concept: z.string().trim().max(5_000).default(""),
  example: z.string().max(10_000).default(""),
  language: z.enum(["python", "sql", "bash"]),
  exampleOutput: z.string().max(10_000).default(""),
  tasks: z.array(z.string().trim().min(1).max(1_000)).max(10),
  questions: z.array(adminQuestionSchema).max(10),
});

export const adminDeliverableSchema = z.object({
  path: z.string().trim().min(1).max(300),
  description: z.string().trim().min(1).max(3_000),
  criteria: z.array(z.string().trim().min(1).max(500)).min(1).max(10),
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
