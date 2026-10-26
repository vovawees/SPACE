/* Ранги, лимиты и приглашения на сервер.

   Ранг — у аккаунта (гость, участник, особый, администратор, владелец
   сервера). У каждого ранга свои лимиты: сколько своих досок, размер файла,
   место под файлы, участников на доске. Настройки сервера (регистрация,
   ранг новичков, лимиты) хранятся в таблице settings одной записью JSON. */
import crypto from "node:crypto";
import type { AdminUser, Invite, Rank, RankLimits, Registration, ServerSettings, ServerStats, Usage } from "../shared/types.ts";
import { RANKS, rankRank } from "../shared/types.ts";
import { config } from "./config.ts";
import { now, q } from "./db.ts";
import { bad, forbidden, HttpError } from "./http.ts";

const UNLIMITED: RankLimits = { boards: 0, uploadMB: 0, storageMB: 0, members: 0, create: true, upload: true, invite: true };

export const DEFAULT_LIMITS: Record<Rank, RankLimits> = {
  guest: { boards: 3, uploadMB: 25, storageMB: 250, members: 10, create: true, upload: true, invite: false },
  member: { boards: 100, uploadMB: 200, storageMB: 5120, members: 50, create: true, upload: true, invite: false },
  vip: { boards: 0, uploadMB: 512, storageMB: 51200, members: 0, create: true, upload: true, invite: true },
  admin: { ...UNLIMITED },
  owner: { ...UNLIMITED },
};

const isRank = (r: unknown): r is Rank => typeof r === "string" && (RANKS as string[]).includes(r);

let cache: ServerSettings | null = null;

export function serverSettings(): ServerSettings {
  if (cache) return cache;
  const row = q("SELECT value FROM settings WHERE key = 'server'").get() as { value: string } | undefined;
  let saved: Partial<ServerSettings> = {};
  try {
    saved = row ? (JSON.parse(row.value) as Partial<ServerSettings>) : {};
  } catch {
    saved = {};
  }
  const limits = {} as Record<Rank, RankLimits>;
  for (const r of RANKS) limits[r] = { ...DEFAULT_LIMITS[r], ...(saved.limits?.[r] ?? {}) };
  // владелец сервера всегда без ограничений — иначе можно запереть самого себя
  limits.owner = { ...UNLIMITED };
  cache = {
    name: typeof saved.name === "string" && saved.name.trim() ? saved.name.trim().slice(0, 60) : "SPACE",
    registration: saved.registration === "invite" || saved.registration === "closed" || saved.registration === "open" ? saved.registration : config.inviteCode ? "invite" : "open",
    defaultRank: isRank(saved.defaultRank) && rankRank(saved.defaultRank) <= rankRank("vip") ? saved.defaultRank : "member",
    limits,
  };
  return cache;
}

export function saveServerSettings(patch: Partial<ServerSettings>): ServerSettings {
  const cur = serverSettings();
  const next: ServerSettings = {
    name: patch.name ?? cur.name,
    registration: (patch.registration ?? cur.registration) as Registration,
    defaultRank: patch.defaultRank ?? cur.defaultRank,
    limits: { ...cur.limits },
  };
  if (patch.limits) for (const r of RANKS) if (patch.limits[r]) next.limits[r] = { ...cur.limits[r], ...patch.limits[r] };
  q("INSERT INTO settings (key, value) VALUES ('server', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(JSON.stringify(next));
  cache = null;
  return serverSettings();
}

export function limitsOf(rank: Rank): RankLimits {
  return serverSettings().limits[rank] ?? DEFAULT_LIMITS.member;
}

export function rankOf(u: { rank?: string | null }): Rank {
  return isRank(u.rank) ? u.rank : "member";
}

export const isAdmin = (u: { rank?: string | null }) => rankRank(rankOf(u)) >= rankRank("admin");

export function usageOf(userId: string): Usage {
  const boards = (q("SELECT COUNT(*) AS n FROM boards WHERE owner_id = ? AND deleted_at IS NULL").get(userId) as { n: number }).n;
  const storage = (q("SELECT COALESCE(SUM(size), 0) AS n FROM files WHERE uploader = ?").get(userId) as { n: number }).n;
  return { boards, storage };
}

const MB = 1048576;

/** Можно ли завести ещё одну доску. */
export function checkCanCreateBoard(user: { id: string; rank?: string | null }): void {
  const lim = limitsOf(rankOf(user));
  if (!lim.create) throw forbidden("Вашему рангу нельзя создавать доски");
  if (lim.boards > 0 && usageOf(user.id).boards >= lim.boards) {
    throw new HttpError(403, "limit_boards", `Достигнут лимит досок: ${lim.boards}. Удалите ненужные или попросите администратора повысить ранг`);
  }
}

/** Предел размера одного файла для человека (байт). */
export function uploadCap(user: { id: string; rank?: string | null }): number {
  const lim = limitsOf(rankOf(user));
  if (!lim.upload) throw forbidden("Вашему рангу нельзя загружать файлы");
  const perFile = lim.uploadMB > 0 ? Math.min(config.maxUploadBytes, lim.uploadMB * MB) : config.maxUploadBytes;
  if (lim.storageMB <= 0) return perFile;
  const left = lim.storageMB * MB - usageOf(user.id).storage;
  if (left <= 0) throw new HttpError(413, "limit_storage", `Место под файлы закончилось (${lim.storageMB} МБ)`);
  return Math.min(perFile, left);
}

/* --------------------------- приглашения --------------------------- */

interface InviteRow {
  code: string;
  rank: Rank;
  uses: number;
  max_uses: number | null;
  expires_at: number | null;
  note: string | null;
  created_by: string | null;
  created_at: number;
  cb_name: string | null;
  cb_color: string | null;
}

const toInvite = (r: InviteRow): Invite => ({
  code: r.code,
  rank: r.rank,
  uses: r.uses,
  maxUses: r.max_uses,
  expiresAt: r.expires_at,
  note: r.note,
  createdAt: r.created_at,
  createdBy: r.created_by ? { id: r.created_by, name: r.cb_name ?? "?", color: r.cb_color ?? "#888888" } : null,
});

const INVITE_SQL = `SELECT i.*, u.name AS cb_name, u.color AS cb_color FROM invites i LEFT JOIN users u ON u.id = i.created_by`;

export function listInvites(by?: string): Invite[] {
  const rows = (by ? q(`${INVITE_SQL} WHERE i.created_by = ? ORDER BY i.created_at DESC`).all(by) : q(`${INVITE_SQL} ORDER BY i.created_at DESC`).all()) as unknown as InviteRow[];
  return rows.map(toInvite);
}

export function createInvite(by: { id: string; rank?: string | null }, opts: { rank: Rank; maxUses: number | null; days: number | null; note: string | null }): Invite {
  const mine = rankOf(by);
  if (!limitsOf(mine).invite && !isAdmin(by)) throw forbidden("Вашему рангу нельзя приглашать на сервер");
  // приглашать можно не выше своего ранга; администраторов назначает только владелец
  if (rankRank(opts.rank) > rankRank(mine) || (opts.rank === "owner") || (opts.rank === "admin" && mine !== "owner")) {
    throw forbidden("Нельзя выдать ранг выше своего");
  }
  const code = crypto.randomBytes(9).toString("base64url");
  q("INSERT INTO invites (code, rank, max_uses, expires_at, note, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
    code,
    opts.rank,
    opts.maxUses,
    opts.days ? now() + opts.days * 86400_000 : null,
    opts.note,
    by.id,
    now(),
  );
  return listInvites().find((i) => i.code === code)!;
}

export function revokeInvite(code: string, by: { id: string; rank?: string | null }): void {
  const row = q("SELECT created_by FROM invites WHERE code = ?").get(code) as { created_by: string | null } | undefined;
  if (!row) return;
  if (row.created_by !== by.id && !isAdmin(by)) throw forbidden("Это приглашение выдал другой человек");
  q("DELETE FROM invites WHERE code = ?").run(code);
}

/** Проверить код при входе. Возвращает ранг, который он даёт, или null. */
export function peekInvite(code: string | undefined | null): Rank | null {
  const c = (code ?? "").trim();
  if (!c) return null;
  if (config.inviteCode && c === config.inviteCode) return "member";
  const row = q("SELECT rank, uses, max_uses, expires_at FROM invites WHERE code = ?").get(c) as
    | { rank: Rank; uses: number; max_uses: number | null; expires_at: number | null }
    | undefined;
  if (!row) return null;
  if (row.expires_at && row.expires_at < now()) return null;
  if (row.max_uses && row.uses >= row.max_uses) return null;
  return row.rank;
}

export function useInvite(code: string): void {
  q("UPDATE invites SET uses = uses + 1 WHERE code = ?").run(code.trim());
}

/** Ранг для нового аккаунта или ошибка, если регистрация закрыта. */
export function rankForNewUser(invite: string | undefined, boardInvite?: { board: string; token: string }): Rank {
  const firstEver = !(q("SELECT 1 FROM users LIMIT 1").get() as unknown);
  if (firstEver) return "owner";
  const fromInvite = peekInvite(invite);
  const s = serverSettings();
  if (fromInvite) return fromInvite;
  if (invite?.trim()) throw new HttpError(403, "invite_invalid", "Код приглашения неверный, истёк или уже использован");
  if (s.registration === "closed") throw new HttpError(403, "registration_closed", "Регистрация на этом сервере закрыта — нужен код приглашения");
  // живое приглашение на доску пускает на сервер гостем
  if (boardInvite && s.registration === "invite") {
    const row = q("SELECT uses, max_uses, expires_at FROM board_links WHERE id = ? AND board_id = ?").get(boardInvite.token, boardInvite.board) as
      | { uses: number; max_uses: number | null; expires_at: number | null }
      | undefined;
    if (row && !(row.expires_at && row.expires_at < now()) && !(row.max_uses && row.uses >= row.max_uses)) return "guest";
  }
  if (s.registration === "invite") throw new HttpError(403, "invite_required", "Нужен код приглашения");
  return s.defaultRank;
}

/* ------------------------------ админка ------------------------------ */

export function listUsers(search = ""): AdminUser[] {
  const like = `%${search.trim().toLowerCase()}%`;
  const rows = q(
    `SELECT u.id, u.name, u.color, u.login, u.rank, u.banned_at, u.created_at, u.seen_at,
       (SELECT COUNT(*) FROM boards b WHERE b.owner_id = u.id AND b.deleted_at IS NULL) AS boards,
       (SELECT COALESCE(SUM(size), 0) FROM files f WHERE f.uploader = u.id) AS storage,
       (SELECT COUNT(*) FROM sessions s WHERE s.user_id = u.id) AS sessions
     FROM users u WHERE lower(u.name) LIKE ? OR lower(COALESCE(u.login, '')) LIKE ?
     ORDER BY (u.rank = 'owner') DESC, u.seen_at DESC LIMIT 500`,
  ).all(like, like) as unknown as {
    id: string;
    name: string;
    color: string;
    login: string | null;
    rank: Rank;
    banned_at: number | null;
    created_at: number;
    seen_at: number;
    boards: number;
    storage: number;
    sessions: number;
  }[];
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    color: r.color,
    login: r.login,
    rank: rankOf(r),
    banned: !!r.banned_at,
    createdAt: r.created_at,
    seenAt: r.seen_at,
    boards: r.boards,
    storage: r.storage,
    sessions: r.sessions,
  }));
}

/** Сменить ранг / заблокировать. Нельзя трогать себя и тех, кто не ниже тебя. */
export function adminUpdateUser(actor: { id: string; rank?: string | null }, targetId: string, patch: { rank?: Rank; banned?: boolean }): void {
  if (targetId === actor.id) throw bad("Свой ранг и блокировку менять нельзя");
  const target = q("SELECT rank FROM users WHERE id = ?").get(targetId) as { rank: Rank } | undefined;
  if (!target) throw bad("Нет такого человека");
  const a = rankOf(actor);
  if (rankRank(rankOf(target)) >= rankRank(a)) throw forbidden("Этот человек не ниже вас по рангу");
  if (patch.rank) {
    if (patch.rank === "owner" || rankRank(patch.rank) >= rankRank(a)) throw forbidden("Можно выдать только ранг ниже своего");
    q("UPDATE users SET rank = ? WHERE id = ?").run(patch.rank, targetId);
  }
  if (patch.banned !== undefined) {
    q("UPDATE users SET banned_at = ? WHERE id = ?").run(patch.banned ? now() : null, targetId);
    if (patch.banned) q("DELETE FROM sessions WHERE user_id = ?").run(targetId);
  }
}

/** Передать владение сервером (только владелец). */
export function transferServer(actorId: string, targetId: string): void {
  q("UPDATE users SET rank = 'owner', banned_at = NULL WHERE id = ?").run(targetId);
  q("UPDATE users SET rank = 'admin' WHERE id = ?").run(actorId);
}

export function serverStats(onlineCount: number): ServerStats {
  const n = (sql: string) => (q(sql).get() as { n: number }).n;
  return {
    users: n("SELECT COUNT(*) AS n FROM users"),
    boards: n("SELECT COUNT(*) AS n FROM boards WHERE deleted_at IS NULL"),
    files: n("SELECT COUNT(*) AS n FROM files"),
    storage: n("SELECT COALESCE(SUM(size), 0) AS n FROM files"),
    online: onlineCount,
  };
}
