/* Действия над узлами: создание, копирование, выравнивание, рамки,
   буфер обмена. Всё — через BoardStore, одной правкой (одна отмена). */
import { nanoid } from "nanoid";
import type { Board } from "./board.svelte.ts";
import { boundsOf, center, type Pt, type Rect, union } from "./geometry.ts";
import { defaults, type NodeData, type NodeType } from "./model.ts";
import type { BoardStore, NodeView } from "./store.svelte.ts";

export const CLIP_MIME = "application/x-space-nodes";

export interface Clip {
  v: 1;
  board: string;
  nodes: (NodeData & { id: string })[];
}

/** Создать узел с центром в точке. */
export function place(b: Board, type: NodeType, at: Pt, extra: Partial<NodeData> = {}): string {
  const d = { ...defaults(type), ...extra } as NodeData;
  const w = d.w ?? 200;
  const h = d.h ?? 120;
  const data: NodeData = {
    ...d,
    type,
    x: Math.round(at.x - w / 2),
    y: Math.round(at.y - h / 2),
    w,
    h,
  };
  if (type === "note" || type === "shape") data.color ??= b.style.color;
  if (type === "text") data.size ??= b.style.size;
  const id = b.store.create(data);
  b.store.reparent([id]);
  return id;
}

/** Узлы вместе с содержимым выделенных рамок. */
export function withChildren(b: Board, ids: Iterable<string>, s: BoardStore = b.store): string[] {
  const out = new Set<string>();
  for (const id of ids) {
    out.add(id);
    const v = s.get(id);
    if (v?.type === "frame") for (const c of s.descendants(id)) out.add(c.id);
  }
  return [...out];
}

export function serialize(b: Board, ids: Iterable<string>, s: BoardStore = b.store): Clip {
  const all = new Set(withChildren(b, ids, s));
  const nodes = s.order.filter((v) => all.has(v.id)).map((v) => ({ ...v.data(), id: v.id }));
  return { v: 1, board: b.id, nodes };
}

/** Вставить узлы из буфера; offset — сдвиг, at — центр вставки. */
export function insertClip(b: Board, clip: Clip, opts: { at?: Pt; offset?: Pt } = {}): string[] {
  if (!clip.nodes.length) return [];
  const ids = new Map(clip.nodes.map((n) => [n.id, nanoid(10)]));
  const rects = clip.nodes.map((n) => ({ x: n.x, y: n.y, w: n.w, h: n.h }));
  const box = union(rects)!;
  let dx = opts.offset?.x ?? 0;
  let dy = opts.offset?.y ?? 0;
  if (opts.at) {
    const c = center(box);
    dx = Math.round(opts.at.x - c.x);
    dy = Math.round(opts.at.y - c.y);
  }
  const list: NodeData[] = clip.nodes.map((n) => {
    const { id: _id, z: _z, createdBy: _c, ...rest } = n;
    const d: NodeData = { ...rest, x: n.x + dx, y: n.y + dy };
    d.parent = n.parent && ids.has(n.parent) ? ids.get(n.parent) : undefined;
    for (const key of ["b0", "b1"] as const) {
      const bind = n[key];
      if (!bind) continue;
      d[key] = ids.has(bind.id) ? { ...bind, id: ids.get(bind.id)! } : null;
      // изломы считались от потерянной цели — систему отсчёта пересчитаем ниже
      if (!d[key]) d.rf = undefined;
    }
    return d;
  });
  const newIds = clip.nodes.map((n) => ids.get(n.id)!);
  b.store.transact(() => {
    b.store.createMany(list, newIds);
    // линии, потерявшие цель, — закрепить концы на месте
    clip.nodes.forEach((n, i) => {
      if (n.type !== "path") return;
      if ((n.b0 && !ids.has(n.b0.id)) || (n.b1 && !ids.has(n.b1.id))) {
        const v = b.store.get(newIds[i]);
        if (v) b.store.update(v.id, b.store.pathPatchOf(v));
      }
    });
  });
  // уже после записи: узлы без своей рамки ложатся в ту, куда попали
  b.store.reparent(newIds.filter((id, i) => !list[i]!.parent && id));
  b.store.selection.set(newIds.filter((_, i) => !list[i]!.parent || !ids.has(clip.nodes[i]!.parent!)));
  return newIds;
}

export function duplicate(b: Board, ids: string[], offset: Pt = { x: 24, y: 24 }): string[] {
  if (!ids.length) return [];
  return insertClip(b, serialize(b, ids), { offset });
}

export function removeSelected(b: Board) {
  const ids = b.store.selection.list.filter((id) => !b.store.get(id)?.locked);
  if (ids.length) b.store.remove(ids);
}

/* ------------------------------ выравнивание ------------------------------ */

export type Align = "left" | "hcenter" | "right" | "top" | "vcenter" | "bottom";

export function align(b: Board, ids: string[], mode: Align) {
  const views = ids.map((id) => b.store.get(id)).filter((v): v is NodeView => !!v && !v.locked && v.type !== "path");
  if (views.length < 2) return;
  const box = union(views.map((v) => b.store.bounds(v)))!;
  b.store.transact(() => {
    for (const v of views) {
      const r = b.store.bounds(v);
      let dx = 0;
      let dy = 0;
      if (mode === "left") dx = box.x - r.x;
      if (mode === "right") dx = box.x + box.w - (r.x + r.w);
      if (mode === "hcenter") dx = box.x + box.w / 2 - (r.x + r.w / 2);
      if (mode === "top") dy = box.y - r.y;
      if (mode === "bottom") dy = box.y + box.h - (r.y + r.h);
      if (mode === "vcenter") dy = box.y + box.h / 2 - (r.y + r.h / 2);
      if (dx || dy) moveWithChildren(b, v, dx, dy);
    }
  });
  b.store.reflowPaths(views.map((v) => v.id));
}

export function distribute(b: Board, ids: string[], axis: "x" | "y") {
  const views = ids.map((id) => b.store.get(id)).filter((v): v is NodeView => !!v && !v.locked && v.type !== "path");
  if (views.length < 3) return;
  const rects = views.map((v) => ({ v, r: b.store.bounds(v) }));
  rects.sort((a, c) => (axis === "x" ? a.r.x - c.r.x : a.r.y - c.r.y));
  const first = rects[0]!.r;
  const last = rects[rects.length - 1]!.r;
  const total = rects.reduce((s, x) => s + (axis === "x" ? x.r.w : x.r.h), 0);
  const span = axis === "x" ? last.x + last.w - first.x : last.y + last.h - first.y;
  const gap = (span - total) / (rects.length - 1);
  let pos = axis === "x" ? first.x : first.y;
  b.store.transact(() => {
    for (const { v, r } of rects) {
      const d = pos - (axis === "x" ? r.x : r.y);
      if (Math.abs(d) > 0.01) moveWithChildren(b, v, axis === "x" ? d : 0, axis === "y" ? d : 0);
      pos += (axis === "x" ? r.w : r.h) + gap;
    }
  });
  b.store.reflowPaths(views.map((v) => v.id));
}

/** Разложить сеткой (G): по строкам, сохраняя порядок чтения. */
export function tidy(b: Board, ids: string[]) {
  const views = ids.map((id) => b.store.get(id)).filter((v): v is NodeView => !!v && !v.locked && v.type !== "path" && v.type !== "frame");
  if (views.length < 2) return;
  const rects = views.map((v) => ({ v, r: b.store.bounds(v) }));
  const box = union(rects.map((x) => x.r))!;
  rects.sort((a, c) => a.r.y + a.r.h / 2 - (c.r.y + c.r.h / 2) || a.r.x - c.r.x);
  const cols = Math.max(1, Math.round(Math.sqrt(rects.length * (box.w / Math.max(box.h, 1)))));
  const gap = 24;
  const colW = Math.max(...rects.map((x) => x.r.w));
  b.store.transact(() => {
    let y = box.y;
    for (let i = 0; i < rects.length; i += cols) {
      const row = rects.slice(i, i + cols).sort((a, c) => a.r.x - c.r.x);
      const rowH = Math.max(...row.map((x) => x.r.h));
      row.forEach(({ v, r }, j) => {
        moveWithChildren(b, v, box.x + j * (colW + gap) - r.x, y - r.y);
      });
      y += rowH + gap;
    }
  });
  b.store.reflowPaths(views.map((v) => v.id));
}

function moveWithChildren(b: Board, v: NodeView, dx: number, dy: number) {
  b.store.update(v.id, { x: Math.round(v.x + dx), y: Math.round(v.y + dy) });
  if (v.type === "frame") {
    for (const c of b.store.descendants(v.id)) b.store.update(c.id, { x: Math.round(c.x + dx), y: Math.round(c.y + dy) });
  }
}

/* --------------------------------- рамки --------------------------------- */

export function wrapInFrame(b: Board, ids: string[]): string | null {
  const views = ids.map((id) => b.store.get(id)).filter((v): v is NodeView => !!v);
  if (!views.length) return null;
  const box = union(views.map((v) => b.store.bounds(v)))!;
  const pad = 40;
  let frameId = "";
  b.store.transact(() => {
    frameId = b.store.create({
      type: "frame",
      x: Math.round(box.x - pad),
      y: Math.round(box.y - pad - 10),
      w: Math.round(box.w + pad * 2),
      h: Math.round(box.h + pad * 2 + 10),
      name: "Рамка",
      z: undefined,
    });
    for (const v of views) b.store.update(v.id, { parent: frameId });
  });
  b.store.selection.set([frameId]);
  return frameId;
}

/** Рамка подгоняется под содержимое. */
export function fitFrame(b: Board, frameId: string) {
  const kids = b.store.children(frameId);
  if (!kids.length) return;
  const box = union(kids.map((v) => b.store.bounds(v)))!;
  const pad = 40;
  b.store.update(frameId, {
    x: Math.round(box.x - pad),
    y: Math.round(box.y - pad),
    w: Math.round(box.w + pad * 2),
    h: Math.round(box.h + pad * 2),
  });
}

/* ------------------------------- геометрия ------------------------------- */

export function selectionRect(b: Board): Rect | null {
  return b.store.boundsOfIds(b.store.selection.ids);
}

export function zoomToSelection(b: Board) {
  const r = selectionRect(b);
  if (r) b.camera.fit(r, { maxZoom: 2 });
}

export function zoomToFit(b: Board) {
  const r = b.store.allBounds();
  if (r) b.camera.fit(r, { maxZoom: 1 });
  else b.camera.go(b.camera.vw / 2, b.camera.vh / 2, 1);
}

