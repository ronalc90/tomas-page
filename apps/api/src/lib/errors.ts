import type { ZodType } from "zod";

export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, details?: unknown) => new HttpError(400, "bad_request", message, details);
export const unauthorized = (message = "Inicia sesión para continuar.") => new HttpError(401, "unauthorized", message);
export const forbidden = (message = "No tienes permiso para hacer esto.") => new HttpError(403, "forbidden", message);
export const notFound = (message = "No encontramos lo que buscas.") => new HttpError(404, "not_found", message);
export const conflict = (message: string) => new HttpError(409, "conflict", message);

/** Valida con zod y convierte los errores en un 400 con el detalle por campo. */
export function parse<T>(schema: ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  const fields: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join(".") || "_";
    fields[key] ??= issue.message;
  }
  const first = result.error.issues[0]?.message ?? "Datos inválidos.";
  throw badRequest(first, { fields });
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Rechaza con 404 los identificadores con formato inválido antes de llegar a la base de datos. */
export function assertUuid(value: string, message = "No encontramos lo que buscas."): string {
  if (!UUID.test(value)) throw notFound(message);
  return value;
}
