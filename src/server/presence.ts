/* Кто сейчас на какой доске: для списка досок на главной. Живёт в памяти
   процесса и наполняется хуками совместной работы (connected / onDisconnect). */
import type { UserRef } from "../shared/types.ts";

const boards = new Map<string, Map<string, UserRef>>();

export function join(boardId: string, socketId: string, user: UserRef): void {
  let m = boards.get(boardId);
  if (!m) boards.set(boardId, (m = new Map()));
  m.set(socketId, user);
}

export function leave(boardId: string, socketId: string): void {
  const m = boards.get(boardId);
  if (!m) return;
  m.delete(socketId);
  if (!m.size) boards.delete(boardId);
}

/** Уникальные люди на доске (одно лицо с двух вкладок — один раз). */
export function online(boardId: string): UserRef[] {
  const m = boards.get(boardId);
  if (!m) return [];
  const seen = new Map<string, UserRef>();
  for (const u of m.values()) seen.set(u.id, u);
  return [...seen.values()];
}

/** Сколько людей сейчас на досках (без повторов). */
export function onlineTotal(): number {
  const ids = new Set<string>();
  for (const b of boards.values()) for (const u of b.values()) ids.add(u.id);
  return ids.size;
}
