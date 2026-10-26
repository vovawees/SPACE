/* Доски и доступ к ним.

   Роль человека на доске = максимум из его личной роли (участник) и роли
   «по ссылке». Открыл доску по ссылке или по приглашению — становится
   участником, и доска появляется у него на главной. Роли: владелец, хост
   (со-владелец), редактор, комментатор, зритель; «banned» в members —
   человек удалён с доски и не вернётся даже по общей ссылке. */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { customAlphabet } from "nanoid";
import * as Y from "yjs";
import { metaOf, nodesOf } from "../shared/doc.ts";
import type { BoardLink, BoardPerms, BoardSettings, BoardSummary, LinkAccess, Member, Role } from "../shared/types.ts";
import { atLeastRole, roleRank } from "../shared/types.ts";
import { toRef, type UserRow } from "./auth.ts";
import { config } from "./config.ts";
import { now, q, tx } from "./db.ts";
import { bad, forbidden, HttpError, notFound } from "./http.ts";
import { online } from "./presence.ts";
import { limitsOf, rankOf } from "./ranks.ts";

export const newBoardId = customAlphabet("23456789abcdefghjkmnpqrstuvwxyz", 12);

export interface BoardRow {
  id: string;
  title: string;
  owner_id: string;
  link_access: LinkAccess;
  nodes: number;
  thumb_at: number | null;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
  settings: string | null;
}

const BOARD_COLS = "id, title, owner_id, link_access, nodes, thumb_at, created_at, updated_at, deleted_at, settings";

export const DEFAULT_BOARD_SETTINGS: BoardSettings = { lock: false, chat: "all", invite: "editors", history: "editors", copy: true, maxMembers: 0 };

export function boardSettings(row: Pick<BoardRow, "settings">): BoardSettings {
  try {
    const raw = row.settings ? (JSON.parse(row.settings) as Partial<BoardSettings>) : {};
    return { ...DEFAULT_BOARD_SETTINGS, ...raw };
  } catch {
    return { ...DEFAULT_BOARD_SETTINGS };
  }
}

export function saveBoardSettings(boardId: string, patch: Partial<BoardSettings>, cur: BoardSettings): BoardSettings {
  const next = { ...cur, ...patch };
  q("UPDATE boards SET settings = ? WHERE id = ?").run(JSON.stringify(next), boardId);
  return next;
}

/** Права человека с ролью role при таких настройках доски. */
export function permsOf(role: Role | null, st: BoardSettings): BoardPerms {
  const edit = atLeastRole(role, st.lock ? "host" : "editor");
  const comment = atLeastRole(role, "commenter");
  return {
    edit,
    comment,
    chat: st.chat === "off" ? false : st.chat === "editors" ? edit : comment,
    invite: st.invite === "all" ? !!role : st.invite === "editors" ? atLeastRole(role, "editor") : atLeastRole(role, "host"),
    manage: atLeastRole(role, "host"),
    restore: st.history === "hosts" ? atLeastRole(role, "host") : edit,
    copy: st.copy ? !!role : atLeastRole(role, "host"),
  };
}

export const thumbsDir = path.join(config.storageDir, "thumbs");
fs.mkdirSync(thumbsDir, { recursive: true });

export function atLeast(role: Role | null, need: Role): boolean {
  return atLeastRole(role, need);
}

export function getBoard(id: string): BoardRow | null {
  if (!/^[a-z0-9]{6,32}$/.test(id)) return null;
  const row = q(`SELECT ${BOARD_COLS} FROM boards WHERE id = ? AND deleted_at IS NULL`).get(id) as
    | BoardRow
    | undefined;
  return row ?? null;
}

function linkRole(access: LinkAccess): Role | null {
  return access === "edit" ? "editor" : access === "comment" ? "commenter" : access === "view" ? "viewer" : null;
}

function memberRole(boardId: string, userId: string): Role | "banned" | null {
  const row = q("SELECT role FROM members WHERE board_id = ? AND user_id = ?").get(boardId, userId) as
    | { role: Role | "banned" }
    | undefined;
  return row?.role ?? null;
}

const maxRole = (a: Role | null, b: Role | null): Role | null => (roleRank(a) >= roleRank(b) ? a : b);

/** Сколько людей уже на доске и сколько можно. */
function memberCap(board: BoardRow): { count: number; cap: number } {
  const count = (q("SELECT COUNT(*) AS n FROM members WHERE board_id = ? AND role != 'banned'").get(board.id) as { n: number }).n;
  const owner = q("SELECT rank FROM users WHERE id = ?").get(board.owner_id) as { rank: string } | undefined;
  const byRank = limitsOf(rankOf(owner ?? {})).members;
  const bySettings = boardSettings(board).maxMembers;
  const caps = [byRank, bySettings].filter((n) => n > 0);
  return { count, cap: caps.length ? Math.min(...caps) : 0 };
}

function addMember(board: BoardRow, userId: string, role: Role) {
  const { count, cap } = memberCap(board);
  if (cap > 0 && count >= cap) throw new HttpError(403, "board_full", `На доске уже ${count} из ${cap} участников`);
  q("INSERT OR IGNORE INTO members (board_id, user_id, role, opened_at) VALUES (?, ?, ?, ?)").run(board.id, userId, role, now());
}

/** Действующая роль. join — записать человека в участники (открыл по ссылке). */
export function roleOn(board: BoardRow, user: UserRow, join = false): Role | null {
  if (board.owner_id === user.id) return "owner";
  const mine = memberRole(board.id, user.id);
  if (mine === "banned") return null;
  const byLink = linkRole(board.link_access);
  const role = maxRole(mine, byLink);
  if (join && role && !mine) {
    try {
      addMember(board, user.id, byLink ?? "viewer");
    } catch (err) {
      if (join) throw err;
    }
  }
  return role;
}

/** Доска + роль или исключение 404/403. */
export function requireBoard(id: string, user: UserRow, need: Role = "viewer", join = false) {
  const board = getBoard(id);
  if (!board) throw notFound("Доска не найдена");
  const role = roleOn(board, user, join);
  if (!role) throw forbidden("Доступ к этой доске закрыт");
  if (!atLeast(role, need)) {
    throw forbidden(need === "owner" ? "Это может только владелец доски" : need === "host" ? "Это могут только хосты доски" : "Недостаточно прав");
  }
  return { board, role, settings: boardSettings(board), perms: permsOf(role, boardSettings(board)) };
}

/* ------------------------ приглашения на доску ------------------------ */

interface LinkRow {
  id: string;
  board_id: string;
  role: Exclude<Role, "owner">;
  label: string | null;
  uses: number;
  max_uses: number | null;
  expires_at: number | null;
  created_by: string | null;
  created_at: number;
  cb_name: string | null;
  cb_color: string | null;
}

const LINK_SQL = "SELECT l.*, u.name AS cb_name, u.color AS cb_color FROM board_links l LEFT JOIN users u ON u.id = l.created_by";

const toLink = (r: LinkRow): BoardLink => ({
  id: r.id,
  role: r.role,
  label: r.label,
  uses: r.uses,
  maxUses: r.max_uses,
  expiresAt: r.expires_at,
  createdAt: r.created_at,
  createdBy: r.created_by ? { id: r.created_by, name: r.cb_name ?? "?", color: r.cb_color ?? "#888888" } : null,
});

export function listLinks(boardId: string): BoardLink[] {
  return (q(`${LINK_SQL} WHERE l.board_id = ? ORDER BY l.created_at DESC`).all(boardId) as unknown as LinkRow[]).map(toLink);
}

export function createLink(board: BoardRow, by: UserRow, myRole: Role, opts: { role: Exclude<Role, "owner">; label: string | null; maxUses: number | null; days: number | null }): BoardLink {
  // выдать можно не больше своей роли; хоста назначает только владелец
  if (roleRank(opts.role) > roleRank(myRole) || (opts.role === "host" && myRole !== "owner")) throw forbidden("Нельзя пригласить с ролью выше своей");
  const id = crypto.randomBytes(12).toString("base64url");
  q("INSERT INTO board_links (id, board_id, role, label, max_uses, expires_at, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(
    id,
    board.id,
    opts.role,
    opts.label,
    opts.maxUses,
    opts.days ? now() + opts.days * 86400_000 : null,
    by.id,
    now(),
  );
  return listLinks(board.id).find((l) => l.id === id)!;
}

export function deleteLink(boardId: string, linkId: string): void {
  q("DELETE FROM board_links WHERE board_id = ? AND id = ?").run(boardId, linkId);
}

/** Войти на доску по приглашению: роль из ссылки (если выше нынешней). */
export function acceptLink(boardId: string, token: string, user: UserRow): Role {
  const board = getBoard(boardId);
  if (!board) throw notFound("Доска не найдена");
  const row = q("SELECT * FROM board_links WHERE id = ? AND board_id = ?").get(token, boardId) as LinkRow | undefined;
  if (!row) throw new HttpError(410, "link_invalid", "Приглашение отозвано или неверно");
  if (row.expires_at && row.expires_at < now()) throw new HttpError(410, "link_expired", "Срок приглашения истёк");
  if (row.max_uses && row.uses >= row.max_uses) throw new HttpError(410, "link_used", "Приглашение уже использовали максимальное число раз");
  if (board.owner_id === user.id) return "owner";
  const mine = memberRole(board.id, user.id);
  if (mine === "banned") throw forbidden("Вас удалили с этой доски");
  if (!mine) addMember(board, user.id, row.role);
  else if (roleRank(row.role) > roleRank(mine)) q("UPDATE members SET role = ? WHERE board_id = ? AND user_id = ?").run(row.role, board.id, user.id);
  else return mine;
  q("UPDATE board_links SET uses = uses + 1 WHERE id = ?").run(token);
  return roleOn(board, user) ?? row.role;
}

export function loadState(id: string): Uint8Array | null {
  const row = q("SELECT state FROM boards WHERE id = ?").get(id) as { state: Uint8Array | null } | undefined;
  return row?.state ?? null;
}

export function saveState(id: string, state: Uint8Array, title: string | null, nodes: number): void {
  if (title) {
    q("UPDATE boards SET state = ?, title = ?, nodes = ?, updated_at = ? WHERE id = ?").run(state, title, nodes, now(), id);
  } else {
    q("UPDATE boards SET state = ?, nodes = ?, updated_at = ? WHERE id = ?").run(state, nodes, now(), id);
  }
}

export function freshDoc(title: string): Y.Doc {
  const doc = new Y.Doc();
  doc.transact(() => {
    const meta = metaOf(doc);
    meta.set("title", title);
    meta.set("createdAt", now());
    nodesOf(doc);
  });
  return doc;
}

export function createBoard(owner: UserRow, title: string, doc?: Y.Doc): BoardRow {
  const id = newBoardId();
  const t = now();
  const d = doc ?? freshDoc(title);
  metaOf(d).set("title", title);
  const state = Y.encodeStateAsUpdate(d);
  tx(() => {
    q(
      "INSERT INTO boards (id, title, owner_id, link_access, state, nodes, created_at, updated_at) VALUES (?, ?, ?, 'edit', ?, ?, ?, ?)",
    ).run(id, title, owner.id, state, nodesOf(d).size, t, t);
    q("INSERT INTO members (board_id, user_id, role, opened_at) VALUES (?, ?, 'owner', ?)").run(id, owner.id, t);
  });
  return getBoard(id)!;
}

export function touchOpened(boardId: string, userId: string): void {
  q("UPDATE members SET opened_at = ? WHERE board_id = ? AND user_id = ?").run(now(), boardId, userId);
}

interface SummaryRow extends BoardRow {
  owner_name: string;
  owner_color: string;
  pinned: number | null;
  opened_at: number | null;
}

function toSummary(row: SummaryRow, role: Role): BoardSummary {
  const settings = boardSettings(row);
  return {
    id: row.id,
    title: row.title,
    role,
    perms: permsOf(role, settings),
    settings,
    owner: { id: row.owner_id, name: row.owner_name, color: row.owner_color },
    linkAccess: row.link_access,
    pinned: !!row.pinned,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    openedAt: row.opened_at,
    thumb: row.thumb_at ? `/api/boards/${row.id}/thumb?v=${row.thumb_at}` : null,
    nodes: row.nodes,
    online: online(row.id),
  };
}

const SUMMARY_SQL = `
  SELECT b.id, b.title, b.owner_id, b.link_access, b.nodes, b.thumb_at, b.created_at, b.updated_at, b.deleted_at, b.settings,
         u.name AS owner_name, u.color AS owner_color, m.pinned AS pinned, m.opened_at AS opened_at, m.role AS m_role
  FROM boards b
  JOIN users u ON u.id = b.owner_id
  LEFT JOIN members m ON m.board_id = b.id AND m.user_id = ?`;

export function boardSummary(boardId: string, user: UserRow): BoardSummary {
  const row = q(`${SUMMARY_SQL} WHERE b.id = ? AND b.deleted_at IS NULL`).get(user.id, boardId) as
    | SummaryRow
    | undefined;
  if (!row) throw notFound("Доска не найдена");
  const role = roleOn(row, user);
  if (!role) throw forbidden("Доступ к этой доске закрыт");
  return toSummary(row, role);
}

export function listBoards(user: UserRow): BoardSummary[] {
  const rows = q(
    `${SUMMARY_SQL} WHERE m.user_id IS NOT NULL AND m.role != 'banned' AND b.deleted_at IS NULL
     ORDER BY m.pinned DESC, COALESCE(m.opened_at, b.updated_at) DESC LIMIT 500`,
  ).all(user.id) as unknown as SummaryRow[];
  const out: BoardSummary[] = [];
  for (const row of rows) {
    const role = roleOn(row, user);
    if (role) out.push(toSummary(row, role));
  }
  return out;
}

export function setPinned(boardId: string, userId: string, pinned: boolean): void {
  q("UPDATE members SET pinned = ? WHERE board_id = ? AND user_id = ?").run(pinned ? 1 : 0, boardId, userId);
}

export function setLinkAccess(boardId: string, access: LinkAccess): void {
  q("UPDATE boards SET link_access = ? WHERE id = ?").run(access, boardId);
}

export function setTitleColumn(boardId: string, title: string): void {
  q("UPDATE boards SET title = ? WHERE id = ?").run(title, boardId);
}

export function softDelete(boardId: string): void {
  q("UPDATE boards SET deleted_at = ? WHERE id = ?").run(now(), boardId);
  fs.rmSync(path.join(thumbsDir, `${boardId}.webp`), { force: true });
}

export function leaveBoard(boardId: string, userId: string): void {
  q("DELETE FROM members WHERE board_id = ? AND user_id = ? AND role != 'owner'").run(boardId, userId);
}

export function listMembers(board: BoardRow): Member[] {
  const rows = q(
    `SELECT u.id, u.name, u.color, m.role, m.opened_at FROM members m JOIN users u ON u.id = m.user_id
     WHERE m.board_id = ? ORDER BY (m.role = 'owner') DESC, (m.role = 'host') DESC, (m.role = 'banned') ASC, m.opened_at DESC`,
  ).all(board.id) as unknown as { id: string; name: string; color: string; role: Role | "banned"; opened_at: number | null }[];
  return rows.map((r) => ({
    ...toRef(r),
    role: r.id === board.owner_id ? "owner" : r.role === "banned" ? "viewer" : r.role,
    banned: r.role === "banned" || undefined,
    openedAt: r.opened_at,
  }));
}

/** Сменить роль участника. Хост меняет только тех, кто ниже хоста, и не выше редактора. */
export function setMemberRole(board: BoardRow, actorRole: Role, userId: string, role: Exclude<Role, "owner"> | "banned"): void {
  if (userId === board.owner_id) throw bad("Роль владельца не меняется");
  const cur = memberRole(board.id, userId);
  if (!cur) throw notFound("Такого участника нет");
  if (actorRole !== "owner") {
    if (cur === "host" || role === "host") throw forbidden("Хостов назначает только владелец");
  }
  q("UPDATE members SET role = ? WHERE board_id = ? AND user_id = ?").run(role, board.id, userId);
}

/** Передать доску другому участнику: прежний владелец становится хостом. */
export function transferBoard(board: BoardRow, toUserId: string): void {
  const cur = memberRole(board.id, toUserId);
  if (!cur || cur === "banned") throw bad("Передать можно только участнику доски");
  tx(() => {
    q("UPDATE boards SET owner_id = ? WHERE id = ?").run(toUserId, board.id);
    q("UPDATE members SET role = 'owner' WHERE board_id = ? AND user_id = ?").run(board.id, toUserId);
    q("UPDATE members SET role = 'host' WHERE board_id = ? AND user_id = ?").run(board.id, board.owner_id);
  });
}

export function setThumb(boardId: string, data: Uint8Array): number {
  fs.writeFileSync(path.join(thumbsDir, `${boardId}.webp`), data);
  const t = now();
  q("UPDATE boards SET thumb_at = ? WHERE id = ?").run(t, boardId);
  return t;
}

/** Окончательно стирает доски, удалённые больше 30 дней назад. */
export function purgeDeleted(): void {
  q("DELETE FROM boards WHERE deleted_at IS NOT NULL AND deleted_at < ?").run(now() - 30 * 86400_000);
}
