/* Совместная работа: Hocuspocus поверх Yjs.

   Документ = доска (имя документа = id доски). Права проверяются при
   подключении по куке сессии; зритель получает соединение только для чтения
   (сервер сам отбрасывает его правки). Состояние хранится в SQLite целиком
   (Y.encodeStateAsUpdate) с небольшой задержкой после правок. */
import { Hocuspocus, type Connection } from "@hocuspocus/server";
import * as Y from "yjs";
import { docTitle, nodesOf } from "../shared/doc.ts";
import type { Role, UserRef } from "../shared/types.ts";
import { toRef, userFromCookieHeader } from "./auth.ts";
import { boardSettings, getBoard, loadState, permsOf, roleOn, saveState, touchOpened } from "./boards.ts";
import { finalSnapshot, maybeSnapshot, noteChange } from "./history.ts";
import { join, leave } from "./presence.ts";

export interface CollabContext {
  user?: UserRef;
  role?: Role;
}

class Denied extends Error {
  reason: string;
  constructor(reason: string) {
    super(reason);
    this.reason = reason;
  }
}

function persist(name: string, doc: Y.Doc): void {
  if (!getBoard(name)) return; // доску удалили, пока она была открыта
  saveState(name, Y.encodeStateAsUpdate(doc), docTitle(doc), nodesOf(doc).size);
  maybeSnapshot(name, doc);
}

export const hocuspocus = new Hocuspocus<CollabContext>({
  name: "space",
  quiet: true,
  debounce: 1500,
  maxDebounce: 8000,
  timeout: 30_000,
  unloadImmediately: true,

  async onConnect({ documentName, requestHeaders, connectionConfig }) {
    const user = userFromCookieHeader(requestHeaders.get("cookie"));
    if (!user) throw new Denied("unauthorized");
    const board = getBoard(documentName);
    if (!board) throw new Denied("not-found");
    let role: Role | null = null;
    try {
      role = roleOn(board, user, true);
    } catch {
      throw new Denied("full");
    }
    if (!role) throw new Denied("forbidden");
    // зритель, комментатор и все, кроме хостов, на замороженной доске — только чтение
    connectionConfig.readOnly = !permsOf(role, boardSettings(board)).edit;
    touchOpened(board.id, user.id);
    return { user: toRef(user), role } satisfies CollabContext;
  },

  async connected({ documentName, socketId, context }) {
    if (context.user) join(documentName, socketId, context.user);
  },

  async onDisconnect({ documentName, socketId }) {
    leave(documentName, socketId);
  },

  async onLoadDocument({ document, documentName }) {
    const state = loadState(documentName);
    if (state) Y.applyUpdate(document, state);
    return document;
  },

  async onChange({ documentName, context }) {
    noteChange(documentName, context?.user);
  },

  async onStoreDocument({ document, documentName }) {
    persist(documentName, document);
  },

  async beforeUnloadDocument({ document, documentName }) {
    if (getBoard(documentName)) finalSnapshot(documentName, document);
  },
});

/** Живой документ, если доска сейчас открыта. */
export function liveDoc(boardId: string): Y.Doc | null {
  return hocuspocus.documents.get(boardId) ?? null;
}

/** Текущее состояние доски — из памяти, если открыта, иначе из базы. */
export function currentDoc(boardId: string): Y.Doc {
  const live = liveDoc(boardId);
  if (live) return live;
  const doc = new Y.Doc();
  const state = loadState(boardId);
  if (state) Y.applyUpdate(doc, state);
  return doc;
}

/** Правка документа с сервера: дойдёт до всех подключённых и сохранится. */
export async function editDoc(boardId: string, user: UserRef, fn: (doc: Y.Doc) => void): Promise<void> {
  const conn = await hocuspocus.openDirectConnection(boardId, { user });
  try {
    await conn.transact((doc) => fn(doc));
  } finally {
    await conn.disconnect();
  }
}

/** Разорвать соединение целиком. Одно закрытие документа (closeConnections)
    оставляет сокет открытым: клиент считает себя на связи, но правки больше
    не ходят ни туда, ни обратно. С закрытым сокетом клиент сам
    переподключается и заново проходит проверку прав. */
function drop(conn: Connection): void {
  conn.close();
  const ws = (conn as unknown as { webSocket?: { close(code?: number, reason?: string): void } }).webSocket;
  try {
    ws?.close(4205, "Reset Connection");
  } catch {
    /* сокет уже закрыт */
  }
}

export function kickAll(boardId: string): void {
  hocuspocus.documents.get(boardId)?.getConnections().forEach(drop);
}

/** Отключить человека от всех досок (заблокирован или сменился ранг). */
export function kickUser(userId: string): void {
  for (const doc of hocuspocus.documents.values()) {
    doc.getConnections().forEach((conn) => {
      if ((conn.context as CollabContext | undefined)?.user?.id === userId) drop(conn);
    });
  }
}
