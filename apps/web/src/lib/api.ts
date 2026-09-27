import type { ApiErrorBody } from "@tomas/shared";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly fields: Record<string, string> = {},
  ) {
    super(message);
  }
}

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export async function request<T>(method: Method, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      credentials: "same-origin",
      headers: body !== undefined ? { "content-type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, "network", "No hay conexión con el servidor. Revisa tu internet e inténtalo de nuevo.");
  }
  const data = (await res.json().catch(() => null)) as (T & Partial<ApiErrorBody>) | null;
  if (!res.ok) {
    const details = data?.details as { fields?: Record<string, string> } | undefined;
    throw new ApiError(
      res.status,
      data?.error ?? "error",
      data?.message ?? "Algo falló. Inténtalo de nuevo.",
      details?.fields ?? {},
    );
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body: unknown = {}) => request<T>("POST", path, body),
  put: <T>(path: string, body: unknown) => request<T>("PUT", path, body),
  patch: <T>(path: string, body: unknown) => request<T>("PATCH", path, body),
};

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Algo falló. Inténtalo de nuevo.";
}

const chains = new Map<string, Promise<unknown>>();

/**
 * Ejecuta las peticiones con la misma clave una detrás de otra.
 * Evita que dos guardados rápidos (por ejemplo, marcar dos casillas seguidas)
 * lleguen al servidor en desorden y el último en llegar pise al más reciente.
 */
export function serial<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const previous = chains.get(key) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(fn);
  chains.set(key, next);
  void next
    .catch(() => undefined)
    .finally(() => {
      if (chains.get(key) === next) chains.delete(key);
    });
  return next;
}
