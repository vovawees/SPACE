/* Ошибки API в одном формате: { error: { code, message } }. */
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { ZodType } from "zod";

export class HttpError extends Error {
  status: ContentfulStatusCode;
  code: string;
  constructor(status: ContentfulStatusCode, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const bad = (message: string, code = "bad_request") => new HttpError(400, code, message);
export const unauthorized = (message = "Нужно войти") => new HttpError(401, "unauthorized", message);
export const forbidden = (message = "Нет доступа") => new HttpError(403, "forbidden", message);
export const notFound = (message = "Не найдено") => new HttpError(404, "not_found", message);
export const conflict = (message: string) => new HttpError(409, "conflict", message);
export const tooMany = (message = "Слишком часто, попробуйте позже") => new HttpError(429, "rate_limited", message);

export async function body<T>(c: Context, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw bad("Ожидался JSON");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw bad(first ? `${first.path.join(".") || "тело"}: ${first.message}` : "Неверные данные");
  }
  return parsed.data;
}

/** Простой ограничитель частоты в памяти: окно + счётчик на ключ. */
export function rateLimiter(max: number, windowMs: number) {
  const hits = new Map<string, { n: number; until: number }>();
  return (key: string): boolean => {
    const t = Date.now();
    const h = hits.get(key);
    if (!h || h.until < t) {
      hits.set(key, { n: 1, until: t + windowMs });
      if (hits.size > 5000) for (const [k, v] of hits) if (v.until < t) hits.delete(k);
      return true;
    }
    h.n++;
    return h.n <= max;
  };
}
