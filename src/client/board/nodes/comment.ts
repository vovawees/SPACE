/* Комментарии: булавка на доске и обсуждение рядом с ней.
   Каждое сообщение — отдельное поле m:<id> узла, поэтому одновременные
   ответы разных людей не затирают друг друга. */
import { api } from "../../lib/api.ts";
import { toasts } from "../../lib/toast.svelte.ts";
import type { Board } from "../board.svelte.ts";
import type { Pt } from "../geometry.ts";
import type { NodeData, NodeProps } from "../model.ts";

export interface CommentMsg {
  /** id автора, имя, цвет */
  u: string;
  n: string;
  c: string;
  t: number;
  x: string;
}

export const PIN = 36;
/** Во сколько раз булавка крупнее мира: на экране она почти не меняется. */
export const pinScale = (z: number) => Math.min(3, Math.max(0.5, 1 / z));

export function threadOf(p: NodeProps): (CommentMsg & { key: string })[] {
  const out: (CommentMsg & { key: string })[] = [];
  for (const [k, x] of Object.entries(p as Record<string, unknown>)) {
    if (!k.startsWith("m:")) continue;
    const m = x as CommentMsg;
    if (m && typeof m.x === "string" && typeof m.t === "number") out.push({ ...m, key: k });
  }
  return out.sort((a, b) => a.t - b.t || (a.key < b.key ? -1 : 1));
}

export function addComment(b: Board, at: Pt, parent?: string): string {
  const data: NodeData = { type: "comment", x: Math.round(at.x), y: Math.round(at.y - PIN), w: PIN, h: PIN };
  if (parent) data.parent = parent;
  const id = b.store.create(data);
  if (!parent) b.store.reparent([id]);
  b.store.selection.set([id]);
  return id;
}

export function postComment(b: Board, id: string, text: string): boolean {
  const x = text.trim().slice(0, 4000);
  if (!x) return false;
  if (b.readonly) {
    // комментатор: сообщение добавляет сервер
    if (!b.perms.comment || b.preview) return false;
    api.post(`/api/boards/${b.id}/comments`, { node: id, text: x }).catch((e) => toasts.error(e));
    return true;
  }
  const me = b.me;
  const t = Date.now();
  const key = `m:${t.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  b.store.update(id, { [key]: { u: me.id, n: me.name, c: me.color, t, x } satisfies CommentMsg, resolved: undefined } as Partial<NodeData>);
  return true;
}

export function dropComment(b: Board, id: string, key: string) {
  b.store.update(id, { [key]: undefined } as Partial<NodeData>);
}

/** Комментатор ставит новую булавку через сервер (документ у него только для чтения). */
export function addCommentRemote(b: Board, at: Pt, text: string): void {
  const x = text.trim().slice(0, 4000);
  if (!x) return;
  api.post(`/api/boards/${b.id}/comments`, { x: Math.round(at.x), y: Math.round(at.y), text: x }).catch((e) => toasts.error(e));
}
