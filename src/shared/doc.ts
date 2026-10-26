/* Схема Yjs-документа доски — общая для клиента и сервера.

   Y.Doc
   ├─ meta:  Y.Map   { title, createdAt }
   └─ nodes: Y.Map<id, Y.Map>   один узел = одна Y.Map полей.
              Поля сливаются независимо (два человека меняют цвет и позицию
              одной карточки — сохраняются обе правки). Текст — Y.Text,
              поэтому одновременный ввод в одну заметку не теряет буквы. */
import * as Y from "yjs";

export const NODES_KEY = "nodes";
export const META_KEY = "meta";

export type YNode = Y.Map<unknown>;

export function nodesOf(doc: Y.Doc): Y.Map<YNode> {
  return doc.getMap<YNode>(NODES_KEY);
}

export function metaOf(doc: Y.Doc): Y.Map<unknown> {
  return doc.getMap<unknown>(META_KEY);
}

export function docTitle(doc: Y.Doc): string | null {
  const t = metaOf(doc).get("title");
  return typeof t === "string" && t.trim() ? t.trim().slice(0, 200) : null;
}

/** Плоский текст доски — для поиска и статистики. */
export function docText(doc: Y.Doc, limit = 20000): string {
  let out = "";
  for (const node of nodesOf(doc).values()) {
    for (const key of ["text", "title", "name", "url"]) {
      const v = node.get(key);
      const s = v instanceof Y.Text ? v.toString() : typeof v === "string" ? v : "";
      if (s) out += s + "\n";
      if (out.length > limit) return out.slice(0, limit);
    }
    // ячейки таблиц, сообщения комментариев и варианты опросов
    for (const [key, v] of node) {
      if (key.startsWith("c:") && typeof v === "string" && v) out += v + "\n";
      else if (key.startsWith("m:") && typeof (v as { x?: unknown })?.x === "string") out += (v as { x: string }).x + "\n";
    }
    const opts = node.get("opts");
    if (Array.isArray(opts)) for (const o of opts as { t?: unknown }[]) if (typeof o?.t === "string" && o.t) out += o.t + "\n";
    if (out.length > limit) return out.slice(0, limit);
  }
  return out;
}

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || !a || !b) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

function cloneValue(v: unknown): unknown {
  if (v instanceof Y.Text) return new Y.Text(v.toString());
  if (v instanceof Y.Map) {
    const m = new Y.Map<unknown>();
    for (const [k, x] of v) m.set(k, cloneValue(x));
    return m;
  }
  if (v instanceof Y.Array) {
    const a = new Y.Array<unknown>();
    a.push(v.toArray().map(cloneValue));
    return a;
  }
  return v;
}

/** Переносит поля одной Y.Map в другую минимальными правками. */
function copyFields(src: YNode, dst: YNode): void {
  for (const k of [...dst.keys()]) if (!src.has(k)) dst.delete(k);
  for (const [k, v] of src) {
    const cur = dst.get(k);
    if (v instanceof Y.Text) {
      const s = v.toString();
      if (cur instanceof Y.Text) {
        if (cur.toString() !== s) {
          cur.delete(0, cur.length);
          cur.insert(0, s);
        }
      } else dst.set(k, new Y.Text(s));
    } else if (v instanceof Y.AbstractType) {
      dst.set(k, cloneValue(v));
    } else if (!sameValue(cur, v)) {
      dst.set(k, v);
    }
  }
}

/**
 * Возвращает живой документ к состоянию снимка.
 * ids не задан — вся доска; задан — только эти узлы (созданные после снимка удаляются).
 * Вызывать внутри транзакции: тогда откат приходит всем одной правкой
 * и сам попадает в историю.
 */
export function restoreInto(live: Y.Doc, snapshot: Y.Doc, ids?: ReadonlySet<string>): number {
  const dst = nodesOf(live);
  const src = nodesOf(snapshot);
  let touched = 0;
  if (!ids) {
    for (const id of [...dst.keys()]) {
      if (!src.has(id)) {
        dst.delete(id);
        touched++;
      }
    }
  }
  for (const [id, snode] of src) {
    if (ids && !ids.has(id)) continue;
    let dnode = dst.get(id);
    if (!dnode) {
      dnode = new Y.Map<unknown>();
      dst.set(id, dnode);
    }
    copyFields(snode, dnode);
    touched++;
  }
  if (ids) {
    for (const id of ids) {
      if (!src.has(id) && dst.has(id)) {
        dst.delete(id);
        touched++;
      }
    }
  }
  return touched;
}

/** Копия доски «как есть» в новый документ (дублирование, ветка из истории). */
export function cloneDoc(src: Y.Doc, title?: string): Y.Doc {
  const out = new Y.Doc();
  out.transact(() => {
    restoreInto(out, src);
    const meta = metaOf(out);
    for (const [k, v] of metaOf(src)) meta.set(k, cloneValue(v));
    if (title) meta.set("title", title);
  });
  return out;
}
