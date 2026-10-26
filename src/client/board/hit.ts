/* Попадание указателя в узлы — геометрически, без DOM. Нужно там, где
   DOM-узлов нет (дальний план рисуется на холсте) и для выделения рамкой,
   ластика и привязок линий. */
import { center, containsPt, distToSegment, intersects, contains, rotate, segmentHitsRect, type Pt, type Rect } from "./geometry.ts";
import { inkPx, strokePx } from "./shapes.ts";
import type { BoardStore, NodeView } from "./store.svelte.ts";

/** Точка внутри повёрнутого прямоугольника узла. */
export function insideNode(v: NodeView, p: Pt, pad = 0): boolean {
  const r = v.rect;
  const lp = v.r ? rotate(p, center(r), -v.r) : p;
  return containsPt(r, lp, pad);
}

function nearPolyline(pts: Pt[], p: Pt, tol: number): boolean {
  for (let i = 1; i < pts.length; i++) if (distToSegment(p, pts[i - 1]!, pts[i]!) <= tol) return true;
  return pts.length === 1 && Math.hypot(pts[0]!.x - p.x, pts[0]!.y - p.y) <= tol;
}

export function inkPoints(v: NodeView): Pt[] {
  const pts = v.props.pts ?? [];
  const sx = v.props.ow ? v.w / v.props.ow : 1;
  const sy = v.props.oh ? v.h / v.props.oh : 1;
  return pts.map((q) => ({ x: v.x + q[0]! * sx, y: v.y + q[1]! * sy }));
}

/** Узел под точкой; tol — допуск в мировых единицах. */
export function hitTest(s: BoardStore, p: Pt, tol: number, opts: { frames?: "label" | "all" | "none" } = {}): NodeView | undefined {
  const order = s.order;
  for (let i = order.length - 1; i >= 0; i--) {
    const v = order[i]!;
    if (v.type === "frame") continue;
    if (hitNode(s, v, p, tol)) return v;
  }
  if (opts.frames === "none") return undefined;
  for (let i = order.length - 1; i >= 0; i--) {
    const v = order[i]!;
    if (v.type !== "frame") continue;
    if (opts.frames === "all" ? containsPt(v.rect, p) : frameLabelHit(v, p, tol)) return v;
  }
  return undefined;
}

export function hitNode(s: BoardStore, v: NodeView, p: Pt, tol: number): boolean {
  if (v.type === "path") {
    const geo = s.connector(v);
    // подпись на линии тоже её часть
    if (v.textValue && Math.abs(p.x - geo.label.x) < 44 + tol && Math.abs(p.y - geo.label.y) < 14 + tol) return true;
    if (!containsPt(geo.box, p, tol + 12)) return false;
    return nearPolyline(geo.track, p, tol + strokePx(v.props.stroke) / 2 + 2);
  }
  if (v.type === "ink") {
    if (!containsPt(v.rect, p, tol + 10)) return false;
    return nearPolyline(inkPoints(v), p, tol + inkPx(v.props.stroke) / 2);
  }
  return insideNode(v, p, tol * 0.25);
}

/** Подпись рамки — над её левым верхним углом. */
export function frameLabelHit(v: NodeView, p: Pt, tol: number): boolean {
  const h = 22 + tol * 2;
  return p.x >= v.x - tol && p.x <= v.x + Math.max(120, Math.min(v.w, 320)) && p.y >= v.y - h && p.y <= v.y + tol;
}

/** Выделение рамкой: рамки — только целиком, линии — по отрезкам, рисунки — по точкам. */
export function nodesInRect(s: BoardStore, r: Rect): string[] {
  const out: string[] = [];
  for (const v of s.order) {
    if (v.type === "frame") {
      if (contains(r, v.rect)) out.push(v.id);
      continue;
    }
    const b = s.bounds(v);
    if (!intersects(b, r)) continue;
    if (contains(r, b)) {
      out.push(v.id);
      continue;
    }
    if (v.type === "path") {
      const pts = s.pathTrack(v);
      for (let i = 1; i < pts.length; i++) {
        if (segmentHitsRect(pts[i - 1]!, pts[i]!, r)) {
          out.push(v.id);
          break;
        }
      }
      continue;
    }
    if (v.type === "ink") {
      if (inkPoints(v).some((q) => containsPt(r, q))) out.push(v.id);
      continue;
    }
    out.push(v.id);
  }
  return out;
}

/** Что задевает отрезок ластика a→b (рисунки, линии и фигуры). */
export function eraseHits(s: BoardStore, a: Pt, b: Pt, radius: number, out: Set<string>) {
  const box: Rect = {
    x: Math.min(a.x, b.x) - radius,
    y: Math.min(a.y, b.y) - radius,
    w: Math.abs(a.x - b.x) + radius * 2,
    h: Math.abs(a.y - b.y) + radius * 2,
  };
  for (const v of s.order) {
    if (out.has(v.id) || v.locked) continue;
    if (v.type !== "ink" && v.type !== "path" && v.type !== "shape") continue;
    const bb = s.bounds(v);
    if (!intersects(bb, box)) continue;
    if (v.type === "shape") {
      if (segmentHitsRect(a, b, bb)) out.add(v.id);
      continue;
    }
    const pts = v.type === "ink" ? inkPoints(v) : s.pathTrack(v);
    const tol = radius + (v.type === "ink" ? inkPx(v.props.stroke) : strokePx(v.props.stroke)) / 2;
    let hit = false;
    for (let i = 0; i < pts.length && !hit; i++) {
      if (distToSegment(pts[i]!, a, b) <= tol) hit = true;
      else if (i > 0 && segmentsCross(pts[i - 1]!, pts[i]!, a, b)) hit = true;
    }
    if (hit) out.add(v.id);
  }
}

function segmentsCross(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const o = (p: Pt, q: Pt, r: Pt) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const d1 = o(c, d, a);
  const d2 = o(c, d, b);
  const d3 = o(a, b, c);
  const d4 = o(a, b, d);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

/** Можно ли привязать к узлу конец линии. */
export function bindable(v: NodeView): boolean {
  return v.type !== "path" && v.type !== "ink" && v.type !== "frame";
}

