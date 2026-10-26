/* Люди и сессии. Вход без регистрации: имя + цвет → аккаунт и долгая
   httpOnly-кука. Логин и пароль можно задать потом, чтобы войти с другого
   устройства; или открыть одноразовую ссылку входа (QR) на телефоне. */
import crypto from "node:crypto";
import { promisify } from "node:util";
import type { Context, MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { parse as parseCookie } from "hono/utils/cookie";
import type { Me, UserRef } from "../shared/types.ts";
import { config } from "./config.ts";
import { now, q } from "./db.ts";
import { unauthorized } from "./http.ts";

const scrypt = promisify(crypto.scrypt) as (
  pw: string | Buffer,
  salt: Buffer,
  len: number,
  opts: crypto.ScryptOptions,
) => Promise<Buffer>;

export const SESSION_COOKIE = "space_sid";
const SESSION_MAX_AGE = 400 * 24 * 3600; // предел браузеров для кук
const TOUCH_EVERY = 3600_000;

export interface UserRow {
  id: string;
  name: string;
  color: string;
  login: string | null;
  pass_hash: string | null;
  created_at: number;
  seen_at: number;
}

export type AppEnv = { Variables: { user: UserRow | null; sessionId: string | null } };

export const randomId = (bytes = 12) => crypto.randomBytes(bytes).toString("base64url");
const sha = (s: string) => crypto.createHash("sha256").update(s).digest("base64url");

/* ------------------------------ пароли ------------------------------ */

const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password.normalize("NFKC"), salt, 32, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  if (!stored) return false;
  const [kind, N, r, p, salt, hash] = stored.split("$");
  if (kind !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64url");
  const actual = await scrypt(password.normalize("NFKC"), Buffer.from(salt, "base64url"), expected.length, {
    N: Number(N),
    r: Number(r),
    p: Number(p),
    maxmem: SCRYPT.maxmem,
  });
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

/* ------------------------------- люди ------------------------------- */

export function toRef(u: Pick<UserRow, "id" | "name" | "color">): UserRef {
  return { id: u.id, name: u.name, color: u.color };
}

export function toMe(u: UserRow): Me {
  return { ...toRef(u), login: u.login, hasPassword: !!u.pass_hash, createdAt: u.created_at };
}

export function createUser(name: string, color: string): UserRow {
  const t = now();
  const id = randomId(9);
  q("INSERT INTO users (id, name, color, created_at, seen_at) VALUES (?, ?, ?, ?, ?)").run(id, name, color, t, t);
  return getUser(id)!;
}

export function getUser(id: string): UserRow | null {
  return (q("SELECT * FROM users WHERE id = ?").get(id) as UserRow | undefined) ?? null;
}

export function findByLogin(login: string): UserRow | null {
  return (q("SELECT * FROM users WHERE login = ?").get(login) as UserRow | undefined) ?? null;
}

/* ------------------------------ сессии ------------------------------ */

export function createSession(userId: string, agent: string | undefined): string {
  const token = randomId(32);
  const t = now();
  q("INSERT INTO sessions (id, user_id, agent, created_at, seen_at) VALUES (?, ?, ?, ?, ?)").run(
    sha(token),
    userId,
    (agent ?? "").slice(0, 200),
    t,
    t,
  );
  return token;
}

export function userBySessionToken(token: string | undefined | null): { user: UserRow; sessionId: string } | null {
  if (!token || token.length > 200) return null;
  const id = sha(token);
  const row = q(
    "SELECT u.*, s.seen_at AS s_seen FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ?",
  ).get(id) as (UserRow & { s_seen: number }) | undefined;
  if (!row) return null;
  const t = now();
  if (t - row.s_seen > TOUCH_EVERY) {
    q("UPDATE sessions SET seen_at = ? WHERE id = ?").run(t, id);
    q("UPDATE users SET seen_at = ? WHERE id = ?").run(t, row.id);
  }
  const { s_seen: _ignored, ...user } = row;
  return { user, sessionId: id };
}

export function userFromCookieHeader(header: string | null | undefined): UserRow | null {
  if (!header) return null;
  const cookies = parseCookie(header);
  return userBySessionToken(cookies[SESSION_COOKIE])?.user ?? null;
}

export function deleteSession(sessionId: string): void {
  q("DELETE FROM sessions WHERE id = ?").run(sessionId);
}

function isHttps(c: Context): boolean {
  if (new URL(c.req.url).protocol === "https:") return true;
  return config.trustProxy && c.req.header("x-forwarded-proto") === "https";
}

export function setSession(c: Context, userId: string): void {
  const token = createSession(userId, c.req.header("user-agent"));
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
    secure: isHttps(c),
  });
}

export function clearSession(c: Context): void {
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
}

/* ------------------------ одноразовые ссылки входа ------------------------ */

const LINK_TTL = 10 * 60_000;

export function createLoginLink(userId: string): { token: string; expiresAt: number } {
  const token = randomId(24);
  const expiresAt = now() + LINK_TTL;
  q("DELETE FROM login_links WHERE expires_at < ?").run(now());
  q("INSERT INTO login_links (id, user_id, expires_at) VALUES (?, ?, ?)").run(sha(token), userId, expiresAt);
  return { token, expiresAt };
}

export function consumeLoginLink(token: string): UserRow | null {
  const id = sha(token);
  const row = q("SELECT user_id, expires_at FROM login_links WHERE id = ?").get(id) as
    | { user_id: string; expires_at: number }
    | undefined;
  q("DELETE FROM login_links WHERE id = ?").run(id);
  if (!row || row.expires_at < now()) return null;
  return getUser(row.user_id);
}

/* ---------------------------- middleware ---------------------------- */

export const withUser: MiddlewareHandler<AppEnv> = async (c, next) => {
  const found = userBySessionToken(getCookie(c, SESSION_COOKIE));
  c.set("user", found?.user ?? null);
  c.set("sessionId", found?.sessionId ?? null);
  await next();
};

export function needUser(c: Context<AppEnv>): UserRow {
  const u = c.get("user");
  if (!u) throw unauthorized();
  return u;
}
