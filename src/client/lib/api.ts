/* Клиент HTTP API. Все изменяющие запросы несут x-space: 1 (защита от CSRF). */
import type { ApiErrorBody } from "../../shared/types.ts";

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function parse<T>(res: Response): Promise<T> {
  const type = res.headers.get("content-type") || "";
  if (!res.ok) {
    if (type.includes("json")) {
      const body = (await res.json().catch(() => null)) as ApiErrorBody | null;
      if (body?.error) throw new ApiError(res.status, body.error.code, body.error.message);
    }
    throw new ApiError(res.status, "http_" + res.status, res.status >= 500 ? "Сервер недоступен" : `Ошибка ${res.status}`);
  }
  if (type.includes("json")) return (await res.json()) as T;
  return (await res.arrayBuffer()) as T;
}

async function request<T>(method: string, url: string, body?: unknown, raw?: BodyInit, type?: string): Promise<T> {
  const headers: Record<string, string> = { "x-space": "1" };
  let payload: BodyInit | undefined = raw;
  if (body !== undefined) {
    headers["content-type"] = "application/json";
    payload = JSON.stringify(body);
  } else if (type) headers["content-type"] = type;
  let res: Response;
  try {
    res = await fetch(url, { method, headers, body: payload, credentials: "same-origin" });
  } catch {
    throw new ApiError(0, "offline", "Нет связи с сервером");
  }
  return parse<T>(res);
}

export const api = {
  get: <T>(url: string) => request<T>("GET", url),
  post: <T>(url: string, body: unknown = {}) => request<T>("POST", url, body),
  patch: <T>(url: string, body: unknown) => request<T>("PATCH", url, body),
  put: <T>(url: string, body: unknown) => request<T>("PUT", url, body),
  del: <T>(url: string) => request<T>("DELETE", url),
  raw: <T>(method: string, url: string, data: BodyInit, type: string) => request<T>(method, url, undefined, data, type),
  bytes: async (url: string) => new Uint8Array(await request<ArrayBuffer>("GET", url)),
};

export const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
