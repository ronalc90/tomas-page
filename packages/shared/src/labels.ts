import type { DeliverableKind, ItemStatus, Language, Pace, Role, SubmissionStatus, QuestionType } from "./types";

/** Textos visibles, en un solo lugar. */

export const STATUS_LABEL: Record<ItemStatus, string> = {
  done: "Completo",
  in_progress: "En curso",
  pending: "Pendiente",
  overdue: "Atrasado",
  rest: "Descanso",
};

export const SUBMISSION_LABEL: Record<SubmissionStatus, string> = {
  draft: "Borrador",
  submitted: "Enviado, en revisión",
  approved: "Aprobado",
  changes_requested: "Con cambios pedidos",
};

export const PACE_LABEL: Record<Pace, string> = {
  not_started: "Aún no empieza",
  on_track: "Al día",
  behind: "Atrasado",
  finished: "Terminó el plan",
};

export const ROLE_LABEL: Record<Role, string> = {
  student: "Estudiante",
  admin: "Administrador",
};

export const LANGUAGE_LABEL: Record<Language, string> = {
  python: "Python",
  sql: "SQL",
  bash: "Terminal",
};

export const DELIVERABLE_KIND_LABEL: Record<DeliverableKind, string> = {
  weekly: "Entregable semanal",
  "mini-project": "Mini-proyecto de fase",
  final: "Entregable final",
};

export const ACTIVITY_LABEL: Record<string, string> = {
  login: "inició sesión",
  workshop_completed: "completó el taller",
  quiz_attempt: "presentó la evaluación",
  challenge_done: "hizo el reto extra",
  exercise_solved: "resolvió el ejercicio",
  solution_revealed: "vio la solución del ejercicio",
  submission_submitted: "envió el entregable",
  submission_withdrawn: "retiró el entregable",
  submission_reviewed: "revisó el entregable",
  password_changed: "cambió su contraseña",
};

export function deliverableTitle(kind: DeliverableKind, weekNumber: number): string {
  if (kind === "final") return "Entregable final";
  if (kind === "mini-project") return `Mini-proyecto (semana ${weekNumber})`;
  return `Entregable de la semana ${weekNumber}`;
}

export const QUESTION_TYPE_LABEL: Record<QuestionType, string> = {
  choice: "Opción múltiple",
  boolean: "Verdadero o falso",
  output: "¿Qué muestra?",
  fill: "Completa el código",
};

/** "45 min", "2 h", "3 h 20 min" */
export function formatMinutes(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}
