/* HTTP API. Все ответы — JSON, ошибки — { error: { code, message } }.
   Изменяющие запросы требуют заголовок x-space: 1 — чужой сайт не сможет
   отправить его из браузера без CORS, а CORS мы не включаем (защита от CSRF). */
import fs from "node:fs";
import path from "node:path";
import { getConnInfo } from "@hono/node-server/conninfo";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono, type Context } from "hono";
import * as Y from "yjs";
import { z } from "zod";
import { cloneDoc, metaOf, restoreInto } from "../shared/doc.ts";
import { isHexColor } from "../shared/colors.ts";
import type { ServerInfo } from "../shared/types.ts";
import { RANKS } from "../shared/types.ts";
import {
  clearSession,
  consumeLoginLink,
  createLoginLink,
  createUser,
  deleteSession,
  findByLogin,
  getUser,
  hashPassword,
  needUser,
  setSession,
  toMe,
  verifyPassword,
  withUser,
  type AppEnv,
} from "./auth.ts";
import {
  acceptLink,
  boardSummary,
  createBoard,
  createLink,
  deleteLink,
  leaveBoard,
  listBoards,
  listLinks,
  listMembers,
  requireBoard,
  saveBoardSettings,
  setLinkAccess,
  setMemberRole,
  setPinned,
  setThumb,
  setTitleColumn,
  softDelete,
  thumbsDir,
  transferBoard,
} from "./boards.ts";
import { currentDoc, editDoc, kickAll, kickUser } from "./collab.ts";
import {
  adminUpdateUser,
  checkCanCreateBoard,
  createInvite,
  isAdmin,
  listInvites,
  listUsers,
  peekInvite,
  rankForNewUser,
  rankOf,
  revokeInvite,
  saveServerSettings,
  serverSettings,
  serverStats,
  transferServer,
  useInvite,
} from "./ranks.ts";
import { onlineTotal } from "./presence.ts";
import { config } from "./config.ts";
import { q } from "./db.ts";
import { receiveUpload, serveFile } from "./files.ts";
import { labelSnapshot, listSnapshots, snapshotDoc, snapshotState, takeSnapshot } from "./history.ts";
import { bad, conflict, forbidden, HttpError, notFound, rateLimiter, tooMany, body } from "./http.ts";
import { unfurl } from "./unfurl.ts";
import { randomId, toRef } from "./auth.ts";

export const app = new Hono<AppEnv>();

const nameSchema = z.string().trim().min(1, "Пустое имя").max(40, "Слишком длинное имя");
const colorSchema = z.string().refine(isHexColor, "Цвет в формате #rrggbb");
const titleSchema = z.string().trim().min(1, "Пустое название").max(200);

const loginLimiter = rateLimiter(10, 60_000);
const guestLimiter = rateLimiter(30, 3600_000);
const unfurlLimiter = rateLimiter(90, 60_000);
const chatLimiter = rateLimiter(40, 60_000);

function clientIp(c: Context): string {
  if (config.trustProxy) {
    const fwd = c.req.header("x-forwarded-for");
    if (fwd) return fwd.split(",")[0]!.trim();
  }
  try {
    return getConnInfo(c).remote.address ?? "?";
  } catch {
    return "?";
  }
}

app.onError((err, c) => {
  if (err instanceof HttpError) return c.json({ error: { code: err.code, message: err.message } }, err.status);
  console.error("[space]", err);
  return c.json({ error: { code: "internal", message: "Внутренняя ошибка сервера" } }, 500);
});

app.use("/api/*", async (c, next) => {
  const m = c.req.method;
  if (m !== "GET" && m !== "HEAD" && m !== "OPTIONS" && c.req.header("x-space") !== "1") {
    throw forbidden("Запрос без заголовка x-space отклонён");
  }
  c.header("cache-control", "no-store");
  await next();
});
app.use("/api/*", withUser);

/* ------------------------------ сервер ------------------------------ */

app.get("/api/health", (c) => c.json({ ok: true, app: "space", version: config.version }));
app.get("/api/info", (c) => {
  const st = serverSettings();
  return c.json({
    version: config.version,
    name: st.name,
    inviteRequired: st.registration !== "open",
    registration: st.registration,
    maxUploadMB: Math.round(config.maxUploadBytes / 1048576),
  } satisfies ServerInfo);
});

/** Проверить код приглашения до входа: какой ранг он даст. */
app.get("/api/invites/:code/check", (c) => {
  const rank = peekInvite(c.req.param("code"));
  return c.json({ ok: !!rank, rank });
});

/* ------------------------------- вход ------------------------------- */

app.get("/api/me", (c) => {
  const u = c.get("user");
  return c.json(u ? toMe(u) : null);
});

app.post("/api/auth/guest", async (c) => {
  const data = await body(
    c,
    z.object({
      name: nameSchema,
      color: colorSchema,
      invite: z.string().max(200).optional(),
      boardInvite: z.object({ board: z.string().max(40), token: z.string().max(100) }).optional(),
    }),
  );
  const rank = rankForNewUser(data.invite, data.boardInvite);
  if (!guestLimiter(clientIp(c))) throw tooMany();
  const user = createUser(data.name, data.color, rank);
  if (data.invite?.trim()) useInvite(data.invite);
  setSession(c, user.id);
  return c.json(toMe(user));
});

app.post("/api/auth/login", async (c) => {
  const data = await body(c, z.object({ login: z.string().trim().min(1).max(64), password: z.string().min(1).max(200) }));
  if (!loginLimiter(`${clientIp(c)}|${data.login.toLowerCase()}`)) throw tooMany("Слишком много попыток, подождите минуту");
  const user = findByLogin(data.login);
  if (!user || !(await verifyPassword(data.password, user.pass_hash))) {
    throw new HttpError(401, "bad_credentials", "Неверный логин или пароль");
  }
  if (user.banned_at) throw new HttpError(403, "banned", "Аккаунт заблокирован администратором");
  setSession(c, user.id);
  return c.json(toMe(user));
});

app.post("/api/auth/link", async (c) => {
  const data = await body(c, z.object({ token: z.string().min(10).max(200) }));
  if (!loginLimiter(`link|${clientIp(c)}`)) throw tooMany();
  const user = consumeLoginLink(data.token);
  if (!user) throw new HttpError(410, "link_expired", "Ссылка входа устарела или уже использована");
  if (user.banned_at) throw new HttpError(403, "banned", "Аккаунт заблокирован администратором");
  setSession(c, user.id);
  return c.json(toMe(user));
});

app.post("/api/auth/logout", (c) => {
  const sid = c.get("sessionId");
  if (sid) deleteSession(sid);
  clearSession(c);
  return c.json({ ok: true });
});

app.patch("/api/me", async (c) => {
  const user = needUser(c);
  const data = await body(c, z.object({ name: nameSchema.optional(), color: colorSchema.optional() }));
  if (data.name) q("UPDATE users SET name = ? WHERE id = ?").run(data.name, user.id);
  if (data.color) q("UPDATE users SET color = ? WHERE id = ?").run(data.color, user.id);
  return c.json(toMe(getUser(user.id)!));
});

app.put("/api/me/credentials", async (c) => {
  const user = needUser(c);
  const data = await body(
    c,
    z.object({
      login: z
        .string()
        .trim()
        .regex(/^[\p{L}\p{N}._-]{3,32}$/u, "Логин: 3–32 буквы, цифры, точка, дефис или _"),
      password: z.string().min(6, "Пароль — минимум 6 символов").max(200),
      current: z.string().max(200).optional(),
    }),
  );
  if (user.pass_hash && !(await verifyPassword(data.current ?? "", user.pass_hash))) {
    throw new HttpError(401, "bad_credentials", "Текущий пароль неверный");
  }
  const taken = findByLogin(data.login);
  if (taken && taken.id !== user.id) throw conflict("Такой логин уже занят");
  q("UPDATE users SET login = ?, pass_hash = ? WHERE id = ?").run(data.login, await hashPassword(data.password), user.id);
  return c.json(toMe(getUser(user.id)!));
});

app.post("/api/me/login-link", (c) => {
  const user = needUser(c);
  return c.json(createLoginLink(user.id));
});

app.post("/api/me/logout-others", (c) => {
  const user = needUser(c);
  q("DELETE FROM sessions WHERE user_id = ? AND id != ?").run(user.id, c.get("sessionId"));
  return c.json({ ok: true });
});

/* ------------------------------- доски ------------------------------- */

app.get("/api/boards", (c) => c.json(listBoards(needUser(c))));

app.post("/api/boards", async (c) => {
  const user = needUser(c);
  const data = await body(c, z.object({ title: titleSchema.optional() }));
  checkCanCreateBoard(user);
  const board = createBoard(user, data.title || "Без названия");
  return c.json(boardSummary(board.id, user));
});

app.post("/api/boards/import", async (c) => {
  const user = needUser(c);
  checkCanCreateBoard(user);
  const buf = new Uint8Array(await c.req.arrayBuffer());
  if (!buf.length || buf.length > 200 * 1048576) throw bad("Пустой или слишком большой файл");
  const doc = new Y.Doc();
  try {
    Y.applyUpdate(doc, buf);
  } catch {
    throw bad("Это не файл доски SPACE");
  }
  const meta = metaOf(doc);
  const title = (c.req.query("title") || String(meta.get("title") || "") || "Импорт").slice(0, 200);
  const board = createBoard(user, title, doc);
  return c.json(boardSummary(board.id, user));
});

app.get("/api/boards/:id", (c) => {
  const user = needUser(c);
  const { board } = requireBoard(c.req.param("id"), user, "viewer", true);
  return c.json(boardSummary(board.id, user));
});

app.patch("/api/boards/:id", async (c) => {
  const user = needUser(c);
  const data = await body(
    c,
    z.object({
      title: titleSchema.optional(),
      linkAccess: z.enum(["none", "view", "comment", "edit"]).optional(),
      pinned: z.boolean().optional(),
      settings: z
        .object({
          lock: z.boolean(),
          chat: z.enum(["all", "editors", "off"]),
          invite: z.enum(["all", "editors", "hosts"]),
          history: z.enum(["editors", "hosts"]),
          copy: z.boolean(),
          maxMembers: z.number().int().min(0).max(100000),
        })
        .partial()
        .optional(),
    }),
  );
  const { board, perms, settings } = requireBoard(c.req.param("id"), user, "viewer", true);
  if (data.title !== undefined) {
    if (!perms.edit) throw forbidden("Переименовать может только редактор");
    const title = data.title;
    await editDoc(board.id, toRef(user), (doc) => metaOf(doc).set("title", title));
    setTitleColumn(board.id, title);
  }
  if (data.linkAccess !== undefined) {
    if (!perms.manage) throw forbidden("Доступ по ссылке меняют владелец и хосты");
    setLinkAccess(board.id, data.linkAccess);
    kickAll(board.id); // переподключатся и получат новые права
  }
  if (data.settings) {
    if (!perms.manage) throw forbidden("Настройки доски меняют владелец и хосты");
    saveBoardSettings(board.id, data.settings, settings);
    if (data.settings.lock !== undefined && data.settings.lock !== settings.lock) kickAll(board.id);
  }
  if (data.pinned !== undefined) setPinned(board.id, user.id, data.pinned);
  return c.json(boardSummary(board.id, user));
});

app.delete("/api/boards/:id", (c) => {
  const user = needUser(c);
  const { board, role } = requireBoard(c.req.param("id"), user);
  if (role === "owner") {
    softDelete(board.id);
    kickAll(board.id);
  } else leaveBoard(board.id, user.id);
  return c.json({ ok: true });
});

app.post("/api/boards/:id/duplicate", async (c) => {
  const user = needUser(c);
  const data = await body(c, z.object({ title: titleSchema.optional() }));
  const { board, perms } = requireBoard(c.req.param("id"), user);
  if (!perms.copy) throw forbidden("Копировать эту доску могут только хосты");
  checkCanCreateBoard(user);
  const copy = cloneDoc(currentDoc(board.id));
  const created = createBoard(user, data.title || `${board.title} — копия`, copy);
  return c.json(boardSummary(created.id, user));
});

app.get("/api/boards/:id/export", (c) => {
  const user = needUser(c);
  const { board, perms } = requireBoard(c.req.param("id"), user);
  if (!perms.copy) throw forbidden("Скачивать эту доску могут только хосты");
  const state = Buffer.from(Y.encodeStateAsUpdate(currentDoc(board.id)));
  const name = `${board.title.replace(/[\\/:*?"<>|]+/g, "_")}.space`;
  return new Response(state, {
    headers: {
      "content-type": "application/octet-stream",
      "content-disposition": `attachment; filename="board.space"; filename*=UTF-8''${encodeURIComponent(name)}`,
    },
  });
});

/* ---------------------------- участники ---------------------------- */

app.get("/api/boards/:id/members", (c) => {
  const user = needUser(c);
  const { board } = requireBoard(c.req.param("id"), user);
  return c.json(listMembers(board));
});

app.patch("/api/boards/:id/members/:uid", async (c) => {
  const user = needUser(c);
  const data = await body(c, z.object({ role: z.enum(["host", "editor", "commenter", "viewer", "banned"]) }));
  const { board, role } = requireBoard(c.req.param("id"), user, "host");
  if (c.req.param("uid") === user.id) throw bad("Свою роль поменять нельзя");
  setMemberRole(board, role, c.req.param("uid"), data.role);
  kickAll(board.id);
  return c.json(listMembers(board));
});

app.delete("/api/boards/:id/members/:uid", (c) => {
  const user = needUser(c);
  const { board, role } = requireBoard(c.req.param("id"), user, "host");
  const uid = c.req.param("uid");
  if (uid === board.owner_id) throw bad("Владельца удалить нельзя");
  const target = listMembers(board).find((m) => m.id === uid);
  if (target?.role === "host" && role !== "owner") throw forbidden("Хостов убирает только владелец");
  leaveBoard(board.id, uid);
  kickAll(board.id);
  return c.json(listMembers(board));
});

app.post("/api/boards/:id/transfer", async (c) => {
  const user = needUser(c);
  const data = await body(c, z.object({ userId: z.string().min(1).max(64) }));
  const { board } = requireBoard(c.req.param("id"), user, "owner");
  transferBoard(board, data.userId);
  kickAll(board.id);
  return c.json(boardSummary(board.id, user));
});

/* ------------------------- приглашения на доску ------------------------- */

app.get("/api/boards/:id/links", (c) => {
  const user = needUser(c);
  const { board, perms } = requireBoard(c.req.param("id"), user);
  if (!perms.invite) throw forbidden("Приглашать на эту доску могут другие участники");
  return c.json(listLinks(board.id));
});

app.post("/api/boards/:id/links", async (c) => {
  const user = needUser(c);
  const data = await body(
    c,
    z.object({
      role: z.enum(["host", "editor", "commenter", "viewer"]),
      label: z.string().trim().max(80).nullable().optional(),
      maxUses: z.number().int().min(1).max(100000).nullable().optional(),
      days: z.number().min(0.04).max(3650).nullable().optional(),
    }),
  );
  const { board, role, perms } = requireBoard(c.req.param("id"), user);
  if (!perms.invite) throw forbidden("Приглашать на эту доску могут другие участники");
  createLink(board, user, role, { role: data.role, label: data.label || null, maxUses: data.maxUses ?? null, days: data.days ?? null });
  return c.json(listLinks(board.id));
});

app.delete("/api/boards/:id/links/:lid", (c) => {
  const user = needUser(c);
  const { board, perms } = requireBoard(c.req.param("id"), user);
  const link = listLinks(board.id).find((l) => l.id === c.req.param("lid"));
  if (link && !perms.manage && link.createdBy?.id !== user.id) throw forbidden("Отозвать может хост или тот, кто пригласил");
  deleteLink(board.id, c.req.param("lid"));
  return c.json(listLinks(board.id));
});

app.post("/api/boards/:id/join", async (c) => {
  const user = needUser(c);
  const data = await body(c, z.object({ token: z.string().min(8).max(100) }));
  acceptLink(c.req.param("id"), data.token, user);
  return c.json(boardSummary(c.req.param("id"), user));
});

/* ---------------- чат и комментарии для тех, кто только смотрит ---------------- */

const CHAT_MAX = 400;

app.post("/api/boards/:id/chat", async (c) => {
  const user = needUser(c);
  const data = await body(c, z.object({ text: z.string().trim().min(1).max(2000), refs: z.array(z.string().max(64)).max(40).optional() }));
  const { board, perms } = requireBoard(c.req.param("id"), user);
  if (!perms.chat) throw forbidden("Чат этой доски закрыт для вас");
  if (!chatLimiter(user.id)) throw tooMany();
  const msg = { id: randomId(8), uid: user.id, name: user.name, color: user.color, text: data.text, t: Date.now(), ...(data.refs?.length ? { refs: data.refs } : {}) };
  await editDoc(board.id, toRef(user), (doc) => {
    const arr = doc.getArray<unknown>("chat");
    arr.push([msg]);
    const over = arr.length - CHAT_MAX;
    if (over > 0) arr.delete(0, over);
  });
  return c.json({ ok: true });
});

app.post("/api/boards/:id/comments", async (c) => {
  const user = needUser(c);
  const data = await body(
    c,
    z.object({ node: z.string().max(64).optional(), x: z.number().finite().optional(), y: z.number().finite().optional(), text: z.string().trim().min(1).max(4000) }),
  );
  const { board, perms } = requireBoard(c.req.param("id"), user);
  if (!perms.comment) throw forbidden("Комментировать эту доску вам нельзя");
  if (!chatLimiter(user.id)) throw tooMany();
  const t = Date.now();
  const key = `m:${t.toString(36)}${randomId(3)}`;
  const msg = { u: user.id, n: user.name, c: user.color, t, x: data.text };
  let id = data.node ?? "";
  await editDoc(board.id, toRef(user), (doc) => {
    const nodes = doc.getMap<Y.Map<unknown>>("nodes");
    let m = id ? nodes.get(id) : undefined;
    if (id && (!m || m.get("type") !== "comment")) throw notFound("Комментарий не найден");
    if (!m) {
      if (data.x === undefined || data.y === undefined) throw bad("Нужна точка для нового комментария");
      id = randomId(8);
      m = new Y.Map<unknown>();
      for (const [k, v] of Object.entries({ type: "comment", x: Math.round(data.x), y: Math.round(data.y - 36), w: 36, h: 36, z: "zz" + t.toString(36), createdBy: user.id })) m.set(k, v);
      nodes.set(id, m);
    }
    m.set(key, msg);
    if (m.has("resolved")) m.delete("resolved");
  });
  return c.json({ id });
});

/* ------------------------------ превью ------------------------------ */

app.put("/api/boards/:id/thumb", async (c) => {
  const user = needUser(c);
  const { board } = requireBoard(c.req.param("id"), user, "editor");
  const type = c.req.header("content-type") || "";
  if (!/^image\/(webp|png|jpeg)$/.test(type)) throw bad("Превью — картинка webp/png/jpeg");
  const buf = new Uint8Array(await c.req.arrayBuffer());
  if (!buf.length || buf.length > 1048576) throw bad("Превью слишком большое");
  const at = setThumb(board.id, buf);
  return c.json({ thumb: `/api/boards/${board.id}/thumb?v=${at}` });
});

app.get("/api/boards/:id/thumb", (c) => {
  const user = needUser(c);
  const { board } = requireBoard(c.req.param("id"), user);
  const file = path.join(thumbsDir, `${board.id}.webp`);
  if (!fs.existsSync(file)) throw notFound();
  const data = fs.readFileSync(file);
  return new Response(data, {
    headers: { "content-type": "image/webp", "cache-control": "private, max-age=31536000, immutable" },
  });
});

/* ------------------------------ история ------------------------------ */

app.get("/api/boards/:id/history", (c) => {
  const user = needUser(c);
  const { board } = requireBoard(c.req.param("id"), user);
  return c.json(listSnapshots(board.id));
});

app.post("/api/boards/:id/history", async (c) => {
  const user = needUser(c);
  const data = await body(c, z.object({ label: z.string().trim().min(1).max(120) }));
  const { board, perms } = requireBoard(c.req.param("id"), user);
  if (!perms.edit) throw forbidden("Сохранять версии могут редакторы");
  const id = takeSnapshot(board.id, currentDoc(board.id), data.label);
  return c.json({ id });
});

app.get("/api/boards/:id/history/:sid", (c) => {
  const user = needUser(c);
  const { board } = requireBoard(c.req.param("id"), user);
  const state = snapshotState(board.id, Number(c.req.param("sid")));
  if (!state) throw notFound("Снимок не найден");
  return new Response(Buffer.from(state), {
    headers: { "content-type": "application/octet-stream", "cache-control": "private, max-age=86400" },
  });
});

app.patch("/api/boards/:id/history/:sid", async (c) => {
  const user = needUser(c);
  const data = await body(c, z.object({ label: z.string().trim().max(120).nullable() }));
  const { board } = requireBoard(c.req.param("id"), user, "editor");
  labelSnapshot(board.id, Number(c.req.param("sid")), data.label || null);
  return c.json(listSnapshots(board.id));
});

app.post("/api/boards/:id/history/:sid/restore", async (c) => {
  const user = needUser(c);
  const data = await body(c, z.object({ ids: z.array(z.string().max(64)).max(100000).optional() }));
  const { board, perms } = requireBoard(c.req.param("id"), user);
  if (!perms.restore) throw forbidden("Восстанавливать версии на этой доске могут только хосты");
  const snap = snapshotDoc(board.id, Number(c.req.param("sid")));
  if (!snap) throw notFound("Снимок не найден");
  takeSnapshot(board.id, currentDoc(board.id), "Перед восстановлением");
  let touched = 0;
  const ids = data.ids ? new Set(data.ids) : undefined;
  await editDoc(board.id, toRef(user), (doc) => {
    touched = restoreInto(doc, snap, ids);
  });
  return c.json({ touched });
});

app.post("/api/boards/:id/history/:sid/fork", (c) => {
  const user = needUser(c);
  const { board, perms } = requireBoard(c.req.param("id"), user);
  if (!perms.copy) throw forbidden("Копировать эту доску могут только хосты");
  checkCanCreateBoard(user);
  const snap = snapshotDoc(board.id, Number(c.req.param("sid")));
  if (!snap) throw notFound("Снимок не найден");
  const created = createBoard(user, `${board.title} — из истории`, cloneDoc(snap));
  return c.json(boardSummary(created.id, user));
});

/* ------------------------------- файлы ------------------------------- */

app.post("/api/files", async (c) => c.json(await receiveUpload(c, needUser(c))));
app.on(["GET", "HEAD"], "/api/files/:hash", (c) => {
  needUser(c);
  return serveFile(c, c.req.param("hash"));
});

app.get("/api/unfurl", async (c) => {
  const user = needUser(c);
  if (!unfurlLimiter(user.id)) throw tooMany();
  return c.json(await unfurl(c.req.query("url") || ""));
});

/* ------------------------- приглашения на сервер ------------------------- */

app.get("/api/invites", (c) => {
  const user = needUser(c);
  return c.json(listInvites(isAdmin(user) ? undefined : user.id));
});

app.post("/api/invites", async (c) => {
  const user = needUser(c);
  const data = await body(
    c,
    z.object({
      rank: z.enum(RANKS as [string, ...string[]]),
      maxUses: z.number().int().min(1).max(100000).nullable().optional(),
      days: z.number().min(0.04).max(3650).nullable().optional(),
      note: z.string().trim().max(80).nullable().optional(),
    }),
  );
  const inv = createInvite(user, { rank: data.rank as never, maxUses: data.maxUses ?? null, days: data.days ?? null, note: data.note || null });
  return c.json(inv);
});

app.delete("/api/invites/:code", (c) => {
  const user = needUser(c);
  revokeInvite(c.req.param("code"), user);
  return c.json({ ok: true });
});

/* ------------------------------ админка ------------------------------ */

function needAdmin(c: Context<AppEnv>) {
  const user = needUser(c);
  if (!isAdmin(user)) throw forbidden("Это раздел администратора сервера");
  return user;
}

app.get("/api/admin", (c) => {
  needAdmin(c);
  return c.json({ settings: serverSettings(), stats: serverStats(onlineTotal()) });
});

const limitsSchema = z
  .object({
    boards: z.number().int().min(0).max(1e6),
    uploadMB: z.number().int().min(0).max(1e6),
    storageMB: z.number().int().min(0).max(1e9),
    members: z.number().int().min(0).max(1e6),
    create: z.boolean(),
    upload: z.boolean(),
    invite: z.boolean(),
  })
  .partial();

app.patch("/api/admin/settings", async (c) => {
  const user = needAdmin(c);
  const data = await body(
    c,
    z.object({
      name: z.string().trim().min(1).max(60).optional(),
      registration: z.enum(["open", "invite", "closed"]).optional(),
      defaultRank: z.enum(["guest", "member", "vip"]).optional(),
      limits: z.record(z.enum(RANKS as [string, ...string[]]), limitsSchema).optional(),
    }),
  );
  if (data.limits?.admin && rankOf(user) !== "owner") throw forbidden("Лимиты администраторов меняет владелец сервера");
  return c.json({ settings: saveServerSettings(data as never), stats: serverStats(onlineTotal()) });
});

app.get("/api/admin/users", (c) => {
  needAdmin(c);
  return c.json(listUsers(c.req.query("q") || ""));
});

app.patch("/api/admin/users/:uid", async (c) => {
  const user = needAdmin(c);
  const data = await body(c, z.object({ rank: z.enum(["guest", "member", "vip", "admin"]).optional(), banned: z.boolean().optional() }));
  adminUpdateUser(user, c.req.param("uid"), data);
  kickUser(c.req.param("uid"));
  return c.json(listUsers(""));
});

app.post("/api/admin/users/:uid/logout", (c) => {
  const user = needAdmin(c);
  adminUpdateUser(user, c.req.param("uid"), {});
  q("DELETE FROM sessions WHERE user_id = ?").run(c.req.param("uid"));
  kickUser(c.req.param("uid"));
  return c.json(listUsers(""));
});

app.post("/api/admin/transfer", async (c) => {
  const user = needAdmin(c);
  if (rankOf(user) !== "owner") throw forbidden("Передать сервер может только его владелец");
  const data = await body(c, z.object({ userId: z.string().min(1).max(64) }));
  if (data.userId === user.id || !getUser(data.userId)) throw bad("Нет такого человека");
  transferServer(user.id, data.userId);
  return c.json(listUsers(""));
});

app.all("/api/*", () => {
  throw notFound("Нет такого метода API");
});

/* --------------------------- клиент (dist) --------------------------- */

const indexFile = path.join(config.distDir, "index.html");
if (fs.existsSync(indexFile)) {
  app.use(
    "/assets/*",
    serveStatic({
      root: config.distDir,
      precompressed: true,
      onFound: (_p, c) => {
        c.header("cache-control", "public, max-age=31536000, immutable");
      },
    }),
  );
  app.use(
    "*",
    serveStatic({
      root: config.distDir,
      precompressed: true,
      onFound: (p, c) => {
        c.header("cache-control", p.endsWith(".html") ? "no-cache" : "public, max-age=3600");
      },
    }),
  );
  // во время пересборки файла на миг нет — оставляем прежнюю версию
  const html = (): string | null => {
    try {
      return fs.readFileSync(indexFile, "utf8");
    } catch {
      return null;
    }
  };
  let cached = html() ?? "";
  if (process.env.NODE_ENV !== "production") fs.watchFile(indexFile, { interval: 1000 }, () => (cached = html() ?? cached));
  app.get("*", (c) => {
    c.header("cache-control", "no-cache");
    return c.html(cached);
  });
} else {
  app.get("*", (c) =>
    c.html(
      `<!doctype html><meta charset="utf-8"><title>SPACE</title><body style="font:16px system-ui;background:#111;color:#ddd;padding:40px">
      <h2>SPACE — сервер работает</h2><p>Клиент ещё не собран. Для разработки запустите <code>npm run dev</code> и откройте
      <a style="color:#8ab4ff" href="http://localhost:5173">localhost:5173</a>, для работы — <code>npm run build</code>, затем <code>npm start</code>.</p>`,
    ),
  );
}
