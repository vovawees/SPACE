/* Доски и доступ к ним.

   Роль человека на доске = максимум из его личной роли (участник) и роли
   «по ссылке». Открыл доску по ссылке — автоматически становится участником,
   чтобы доска появилась у него на главной. Владелец может сменить доступ
   по ссылке (выключен / просмотр / редактирование) и роли участников. */
import fs from "node:fs";
import path from "node:path";
import { customAlphabet } from "nanoid";
import * as Y from "yjs";
import { metaOf, nodesOf } from "../shared/doc.ts";
import type { BoardSummary, LinkAccess, Member, Role } from "../shared/types.ts";
import { toRef, type UserRow } from "./auth.ts";
import { config } from "./config.ts";
import { now, q, tx } from "./db.ts";
import { forbidden, notFound } from "./http.ts";
import { online } from "./presence.ts";

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
}

const RANK: Record<Role, number> = { viewer: 1, editor: 2, owner: 3 };
const BOARD_COLS = "id, title, owner_id, link_access, nodes, thumb_at, created_at, updated_at, deleted_at";

export const thumbsDir = path.join(config.storageDir, "thumbs");
fs.mkdirSync(thumbsDir, { recursive: true });

export function atLeast(role: Role | null, need: Role): boolean {
  return !!role && RANK[role] >= RANK[need];
}

export function getBoard(id: string): BoardRow | null {
  if (!/^[a-z0-9]{6,32}$/.test(id)) return null;
  const row = q(`SELECT ${BOARD_COLS} FROM boards WHERE id = ? AND deleted_at IS NULL`).get(id) as
    | BoardRow
    | undefined;
  return row ?? null;
}

function linkRole(access: LinkAccess): Role | null {
  return access === "edit" ? "editor" : access === "view" ? "viewer" : null;
}

function memberRole(boardId: string, userId: string): Role | null {
  const row = q("SELECT role FROM members WHERE board_id = ? AND user_id = ?").get(boardId, userId) as
    | { role: Role }
    | undefined;
  return row?.role ?? null;
}

/** Действующая роль. join — записать человека в участники (открыл по ссылке). */
export function roleOn(board: BoardRow, user: UserRow, join = false): Role | null {
  if (board.owner_id === user.id) return "owner";
  const mine = memberRole(board.id, user.id);
  const byLink = linkRole(board.link_access);
  const role = !mine ? byLink : !byLink ? mine : RANK[mine] >= RANK[byLink] ? mine : byLink;
  if (join && role && !mine) {
    q("INSERT OR IGNORE INTO members (board_id, user_id, role, opened_at) VALUES (?, ?, ?, ?)").run(
      board.id,
      user.id,
      byLink ?? "viewer",
      now(),
    );
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
    throw forbidden(need === "owner" ? "Это может только владелец доски" : "Недостаточно прав");
  }
  return { board, role };
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
  return {
    id: row.id,
    title: row.title,
    role,
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
  SELECT b.id, b.title, b.owner_id, b.link_access, b.nodes, b.thumb_at, b.created_at, b.updated_at, b.deleted_at,
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
    `${SUMMARY_SQL} WHERE m.user_id IS NOT NULL AND b.deleted_at IS NULL
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
     WHERE m.board_id = ? ORDER BY (m.role = 'owner') DESC, m.opened_at DESC`,
  ).all(board.id) as unknown as { id: string; name: string; color: string; role: Role; opened_at: number | null }[];
  return rows.map((r) => ({
    ...toRef(r),
    role: r.id === board.owner_id ? "owner" : r.role,
    openedAt: r.opened_at,
  }));
}

export function setMemberRole(boardId: string, userId: string, role: "editor" | "viewer"): void {
  q("UPDATE members SET role = ? WHERE board_id = ? AND user_id = ? AND role != 'owner'").run(role, boardId, userId);
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
