import type { Answer, QuestionType } from "./types";

/**
 * Calificación de una pregunta. Vive en shared para que el servidor y la versión
 * sin servidor califiquen exactamente igual.
 */

export interface GradableQuestion {
  type: QuestionType;
  options: string[];
  correctIndex: number;
  accepted: string[];
}

/** Normaliza una salida escrita: ignora mayúsculas, comillas, espacios repetidos y espacios al final de línea. */
export function normalizeOutput(value: string): string {
  return value
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim().replace(/[ \t]+/g, " "))
    .filter((line) => line.length > 0)
    .join("\n")
    .replace(/["'`]/g, "")
    .toLowerCase();
}

/** Normaliza un fragmento de código para completar: ignora espacios y mayúsculas. */
export function normalizeFill(value: string): string {
  return value.replace(/\s+/g, "").toLowerCase();
}

export function isTextQuestion(type: QuestionType): boolean {
  return type === "output" || type === "fill";
}

/** Comprueba que la respuesta tenga la forma correcta para el tipo de pregunta. */
export function isValidAnswer(question: GradableQuestion, answer: Answer): boolean {
  if (isTextQuestion(question.type)) return typeof answer === "string";
  return typeof answer === "number" && Number.isInteger(answer) && answer >= 0 && answer < question.options.length;
}

export function isCorrectAnswer(question: GradableQuestion, answer: Answer): boolean {
  if (!isValidAnswer(question, answer)) return false;
  if (question.type === "output") {
    const given = normalizeOutput(answer as string);
    return given.length > 0 && question.accepted.some((a) => normalizeOutput(a) === given || normalizeOutput(a).replace(/\n/g, " ") === given.replace(/\n/g, " "));
  }
  if (question.type === "fill") {
    const given = normalizeFill(answer as string);
    return given.length > 0 && question.accepted.some((a) => normalizeFill(a) === given);
  }
  return answer === question.correctIndex;
}

/** La respuesta correcta que se muestra en la revisión. */
export function correctAnswerOf(question: GradableQuestion): Answer {
  return isTextQuestion(question.type) ? (question.accepted[0] ?? "") : question.correctIndex;
}

/** Comentario para la opción elegida (solo opción múltiple / verdadero-falso). */
export function feedbackFor(question: GradableQuestion & { optionFeedback: string[] }, answer: Answer): string {
  if (isTextQuestion(question.type) || typeof answer !== "number") return "";
  return question.optionFeedback[answer] ?? "";
}
