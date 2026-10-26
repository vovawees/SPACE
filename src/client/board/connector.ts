/* Связи между узлами: где конец линии касается узла, каким путём она идёт
   (прямая, плавная, под прямыми углами), наконечники и подпись.

   Привязка конца (Binding) хранит точку в долях рамки узла:
   - precise: false — «плавающий» конец. Прямая целится в центр узла и
     обрезается по контуру; плавная и ломаная выходят из середины той
     стороны, что смотрит на собеседника, — переставили узлы, и сторона
     выбирается заново;
   - precise + edge — конец сидит в этой точке контура и выходит из неё
     перпендикулярно. Точка проецируется на контур при каждом расчёте,
     поэтому после смены размера или формы узла остаётся на краю;
   - precise без edge — точка внутри узла: линия целится в неё.

   Изломы линии с привязанными концами хранятся вместе с «системой
   отсчёта» rf — положениями якорей концов на момент записи. Когда узел
   двигают, изломы едут следом: вдоль линии — пропорционально, поперёк —
   на прежнее расстояние, так что изгиб не ломается, а тянется. */
import { boundsOf, dist, r2, type Pt, type Rect } from "./geometry.ts";
import { HEAD_SCALE, type Binding, type Head, type NodeProps, type Route } from "./model.ts";
import { headSize, shapeOutline, strokePx } from "./shapes.ts";
import type { NodeView } from "./store.svelte.ts";

export type Side = "n" | "e" | "s" | "w";
export const SIDES: Side[] = ["n", "e", "s", "w"];
export const SIDE_N: Record<Side, Pt> = { n: { x: 0, y: -1 }, e: { x: 1, y: 0 }, s: { x: 0, y: 1 }, w: { x: -1, y: 0 } };

/** Зазор между концом линии и контуром узла. */
export const GAP = 5;
/** Короче крайние отрезки ломаной не делаем без нужды: там поворот и наконечник. */
const END_MIN = 34;
/** Вылет ломаной от узла до первого поворота. */
const STUB = 22;
/** Радиус скругления углов ломаной. */
const CORNER = 10;

export function routeOf(p: NodeProps): Route {
  return p.route ?? (p.curve ? "curve" : "straight");
}

/* ------------------------------ векторы ------------------------------ */

const add = (a: Pt, b: Pt, k = 1): Pt => ({ x: a.x + b.x * k, y: a.y + b.y * k });
const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y });
const dot = (a: Pt, b: Pt) => a.x * b.x + a.y * b.y;
function unit(v: Pt, fallback: Pt = { x: 1, y: 0 }): Pt {
  const l = Math.hypot(v.x, v.y);
  return l > 1e-9 ? { x: v.x / l, y: v.y / l } : fallback;
}
const rot = (v: Pt, a: number): Pt => {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c };
};

/* ------------------------------ контуры ------------------------------ */

export interface Outline {
  /** Вершины замкнутого контура в мире. */
  pts: Pt[];
  /** 1 — обход по часовой стрелке на экране, −1 — против. */
  dir: number;
  c: Pt;
  box: Rect;
}

interface OutlineCache {
  x: number;
  y: number;
  w: number;
  h: number;
  r: number;
  kind: string;
  pp: unknown;
  o: Outline;
}

/** Контур узла в мире (фигуры — по форме, остальное — прямоугольник). */
export function outlineOf(v: NodeView): Outline {
  const w = v.w;
  const h = v.H;
  const r = v.r;
  const shape = v.type === "shape";
  const kind = shape ? (v.props.kind ?? "rect") : "rect";
  const pp = shape ? v.props.pts : undefined;
  const c = v.cache.outline as OutlineCache | undefined;
  if (c && c.x === v.x && c.y === v.y && c.w === w && c.h === h && c.r === r && c.kind === kind && c.pp === pp) return c.o;
  const local = shapeOutline(kind, w, h, pp);
  const cx = v.x + w / 2;
  const cy = v.y + h / 2;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  const pts = local.map((q) => {
    if (!r) return { x: v.x + q.x, y: v.y + q.y };
    const dx = q.x - w / 2;
    const dy = q.y - h / 2;
    return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
  });
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    area += a.x * b.y - b.x * a.y;
  }
  const o: Outline = { pts, dir: area >= 0 ? 1 : -1, c: { x: cx, y: cy }, box: boundsOf(pts) };
  v.cache.outline = { x: v.x, y: v.y, w, h, r, kind, pp, o } satisfies OutlineCache;
  return o;
}

/** Первое (ближайшее к from) пересечение отрезка from→to с контуром. */
export function hitOutline(o: Outline, from: Pt, to: Pt): { p: Pt; n: Pt } | null {
  const pts = o.pts;
  const n = pts.length;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  let best = Infinity;
  let bp: Pt | null = null;
  let bn: Pt = { x: 0, y: -1 };
  for (let i = 0; i < n; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % n]!;
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-12) continue;
    const ax = a.x - from.x;
    const ay = a.y - from.y;
    const k = (ax * ey - ay * ex) / den;
    const s = (ax * dy - ay * dx) / den;
    if (k < 0 || k > 1 || s < -1e-9 || s > 1 + 1e-9 || k >= best) continue;
    best = k;
    bp = { x: from.x + dx * k, y: from.y + dy * k };
    const l = Math.hypot(ex, ey) || 1;
    bn = { x: (o.dir * ey) / l, y: (-o.dir * ex) / l };
  }
  return bp ? { p: bp, n: bn } : null;
}

/** Ближайшая точка контура и внешняя нормаль в ней. */
export function nearestOnOutline(o: Outline, p: Pt): { p: Pt; n: Pt; d: number } {
  const pts = o.pts;
  const n = pts.length;
  let best = Infinity;
  let bp = p;
  let bi = 0;
  let bt = 0.5;
  for (let i = 0; i < n; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % n]!;
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const l2 = ex * ex + ey * ey || 1e-9;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * ex + (p.y - a.y) * ey) / l2));
    const q = { x: a.x + ex * t, y: a.y + ey * t };
    const d = Math.hypot(p.x - q.x, p.y - q.y);
    if (d < best) {
      best = d;
      bp = q;
      bi = i;
      bt = t;
    }
  }
  const normal = (i: number): Pt => {
    const a = pts[(i + n) % n]!;
    const b = pts[(i + 1 + n) % n]!;
    const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return { x: (o.dir * (b.y - a.y)) / l, y: (-o.dir * (b.x - a.x)) / l };
  };
  let nn = normal(bi);
  // в вершине — средняя из нормалей соседних сторон
  if (bt < 0.02) nn = unit(add(nn, normal(bi - 1)), nn);
  else if (bt > 0.98) nn = unit(add(nn, normal(bi + 1)), nn);
  return { p: bp, n: nn, d: best };
}

export function insideOutline(o: Outline, p: Pt): boolean {
  const pts = o.pts;
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i]!;
    const b = pts[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y || 1e-12) + a.x) inside = !inside;
  }
  return inside;
}

/** Точка контура в направлении dir (мировом) от центра узла. */
function rayPoint(o: Outline, dir: Pt): Pt {
  const R = o.box.w + o.box.h + 10;
  return hitOutline(o, add(o.c, dir, R), o.c)?.p ?? o.c;
}

/** «Магниты» — середины сторон узла (по его собственным осям). */
export function magnetsOf(v: NodeView): { side: Side; p: Pt }[] {
  const o = outlineOf(v);
  return SIDES.map((side) => ({ side, p: rayPoint(o, rot(SIDE_N[side], v.r)) }));
}

/** Мировая точка по долям (u, v) рамки узла. */
export function uvPoint(v: NodeView, u: number, vv: number): Pt {
  const w = v.w;
  const h = v.H;
  const lp = { x: (u - 0.5) * w, y: (vv - 0.5) * h };
  const c = { x: v.x + w / 2, y: v.y + h / 2 };
  return add(c, v.r ? rot(lp, v.r) : lp);
}

/** Доли (u, v) мировой точки в рамке узла. */
export function uvOf(v: NodeView, p: Pt): { u: number; v: number } {
  const w = Math.max(1, v.w);
  const h = Math.max(1, v.H);
  const c = { x: v.x + v.w / 2, y: v.y + v.H / 2 };
  const lp = v.r ? rot(sub(p, c), -v.r) : sub(p, c);
  return { u: clamp01(lp.x / w + 0.5), v: clamp01(lp.y / h + 0.5) };
}

const clamp01 = (n: number) => Math.round(Math.min(1, Math.max(0, n)) * 10000) / 10000;

/** Якорь привязки: точка, к которой «приколот» конец (для системы отсчёта изломов). */
export function anchorPoint(v: NodeView, b: Binding): Pt {
  if (!b.precise) return outlineOf(v).c;
  const p = uvPoint(v, b.u, b.v);
  return b.edge ? nearestOnOutline(outlineOf(v), p).p : p;
}

/* ------------------------------- концы ------------------------------- */

export interface EndSpec {
  node: NodeView;
  bind: Binding;
}

export interface End {
  /** Где рисуется конец (с зазором от контура). */
  p: Pt;
  /** Направление выхода из узла, если оно определено. */
  n: Pt | null;
  /** Габариты узла — ломаная обходит их. */
  box: Rect | null;
}

/** Какая сторона прямоугольника a смотрит на прямоугольник b. */
export function facing(a: Rect, b: Rect): Side {
  const right = b.x - (a.x + a.w);
  const left = a.x - (b.x + b.w);
  const below = b.y - (a.y + a.h);
  const above = a.y - (b.y + b.h);
  const gx = Math.max(right, left);
  const gy = Math.max(below, above);
  if (gx > 0 || gy > 0) {
    if (gx >= gy) return right >= left ? "e" : "w";
    return below >= above ? "s" : "n";
  }
  const dx = (b.x + b.w / 2 - (a.x + a.w / 2)) / Math.max(1, a.w);
  const dy = (b.y + b.h / 2 - (a.y + a.h / 2)) / Math.max(1, a.h);
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? "e" : "w";
  return dy >= 0 ? "s" : "n";
}

function resolveEnd(spec: EndSpec, toward: Pt | Rect, route: Route): End {
  const v = spec.node;
  const b = spec.bind;
  const o = outlineOf(v);
  const to: Pt = "w" in toward ? { x: toward.x + toward.w / 2, y: toward.y + toward.h / 2 } : toward;
  if (b.precise && b.edge) {
    const q = nearestOnOutline(o, uvPoint(v, b.u, b.v));
    return { p: add(q.p, q.n, GAP), n: q.n, box: o.box };
  }
  if (b.precise) {
    const ap = uvPoint(v, b.u, b.v);
    const hit = hitOutline(o, to, ap);
    if (!hit || dist(ap, to) <= dist(hit.p, to)) return { p: ap, n: null, box: o.box };
    const dir = unit(sub(to, hit.p));
    return { p: add(hit.p, dir, Math.min(GAP, dist(hit.p, to) / 3)), n: hit.n, box: o.box };
  }
  if (route !== "straight") {
    const target: Rect = "w" in toward ? toward : { x: toward.x, y: toward.y, w: 0, h: 0 };
    const side = facing(o.box, target);
    const n = SIDE_N[side];
    return { p: add(rayPoint(o, n), n, GAP), n, box: o.box };
  }
  const hit = hitOutline(o, to, o.c);
  if (!hit) return { p: o.c, n: null, box: o.box };
  const len = dist(to, hit.p);
  const dir = unit(sub(to, hit.p));
  return { p: add(hit.p, dir, Math.min(GAP, len / 3)), n: dir, box: o.box };
}

/** Изломы переезжают из системы отсчёта (f0, f1) в (t0, t1). */
function reframe(pts: Pt[], f0: Pt, f1: Pt, t0: Pt, t1: Pt): Pt[] {
  if (f0.x === t0.x && f0.y === t0.y && f1.x === t1.x && f1.y === t1.y) return pts;
  const u = sub(f1, f0);
  const L = Math.hypot(u.x, u.y);
  const v = sub(t1, t0);
  const L2 = Math.hypot(v.x, v.y);
  if (L < 1e-6 || L2 < 1e-6) {
    const d = sub(t0, f0);
    return pts.map((p) => add(p, d));
  }
  const e = { x: u.x / L, y: u.y / L };
  const e2 = { x: v.x / L2, y: v.y / L2 };
  return pts.map((p) => {
    const q = sub(p, f0);
    const t = dot(q, e) / L;
    const off = -q.x * e.y + q.y * e.x;
    return { x: t0.x + e2.x * t * L2 - e2.y * off, y: t0.y + e2.y * t * L2 + e2.x * off };
  });
}

/* ------------------------------ ломаная ------------------------------ */

function axisOf(n: Pt | null): Pt | null {
  if (!n) return null;
  return Math.abs(n.x) >= Math.abs(n.y) - 1e-6 ? { x: Math.sign(n.x) || 1, y: 0 } : { x: 0, y: Math.sign(n.y) || 1 };
}

/** Выход за габариты узла по направлению n (чтобы первый поворот был снаружи). */
function stubOf(p: Pt, n: Pt, box: Rect | null): Pt {
  let k = STUB;
  if (box) {
    const ex = n.x > 0 ? box.x + box.w - p.x : n.x < 0 ? p.x - box.x : n.y > 0 ? box.y + box.h - p.y : p.y - box.y;
    if (ex > 0) k += ex;
  }
  return add(p, n, k);
}

function clean(pts: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.x - p.x) < 0.01 && Math.abs(last.y - p.y) < 0.01) continue;
    out.push(p);
  }
  // точки на одной прямой с соседями не нужны
  for (let i = out.length - 2; i >= 1; i--) {
    const a = out[i - 1]!;
    const b = out[i]!;
    const c = out[i + 1]!;
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cross) < 0.01 && dot(sub(b, a), sub(c, b)) > 0) out.splice(i, 1);
  }
  return out;
}

function segHitsBox(a: Pt, b: Pt, r: Rect | null): boolean {
  if (!r) return false;
  const e = 1;
  const x0 = Math.min(a.x, b.x);
  const x1 = Math.max(a.x, b.x);
  const y0 = Math.min(a.y, b.y);
  const y1 = Math.max(a.y, b.y);
  return x1 > r.x + e && x0 < r.x + r.w - e && y1 > r.y + e && y0 < r.y + r.h - e;
}

function distToPolyline(p: Pt, pts: Pt[]): number {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const l2 = ex * ex + ey * ey || 1e-9;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * ex + (p.y - a.y) * ey) / l2));
    best = Math.min(best, Math.hypot(p.x - a.x - ex * t, p.y - a.y - ey * t));
  }
  return best;
}

function score(path: Pt[], a: End, b: End, na: Pt | null, nb: Pt | null, mid: Pt | null): number {
  let cost = 0;
  const n = path.length;
  if (n < 2) return Infinity;
  for (let i = 1; i < n; i++) {
    const p = path[i - 1]!;
    const q = path[i]!;
    cost += Math.abs(q.x - p.x) + Math.abs(q.y - p.y);
    // насквозь через узлы нельзя (свой край у первого/последнего отрезка не в счёт)
    if (i > 1 && segHitsBox(p, q, a.box)) cost += 1e4;
    if (i < n - 1 && segHitsBox(p, q, b.box)) cost += 1e4;
    if (i > 1) {
      const d1 = sub(p, path[i - 2]!);
      const d2 = sub(q, p);
      if (dot(d1, d2) < -0.01) cost += 1e4; // разворот на месте
    }
  }
  cost += (n - 2) * 36;
  // короткий крайний отрезок — наконечник налезает на поворот
  if (n > 2) {
    const first = Math.abs(path[1]!.x - path[0]!.x) + Math.abs(path[1]!.y - path[0]!.y);
    const last = Math.abs(path[n - 1]!.x - path[n - 2]!.x) + Math.abs(path[n - 1]!.y - path[n - 2]!.y);
    if (first < END_MIN) cost += (END_MIN - first) * 2;
    if (last < END_MIN) cost += (END_MIN - last) * 2;
  }
  if (na && dot(unit(sub(path[1]!, path[0]!)), na) < 0.99) cost += 5e3;
  if (nb && dot(unit(sub(path[n - 2]!, path[n - 1]!)), nb) < 0.99) cost += 5e3;
  if (mid) cost += distToPolyline(mid, path) * 40;
  return cost;
}

/**
 * Ортогональный маршрут между концами: перебор простых вариантов с оценкой.
 * mid — середина «колена», которое сдвинул человек; axis — какая координата
 * у него закреплена (y — горизонтальный отрезок, x — вертикальный).
 */
export function elbowRoute(a: End, b: End, mid: Pt | null, axis: "x" | "y" | null = null): Pt[] {
  if (mid && axis) {
    const own = elbowSearch(a, b, mid, axis);
    // колено так не встаёт (насквозь через узел и т. п.) — как получится ближе
    if (own.cost < 5e3) return own.path;
    const free = elbowSearch(a, b, mid, null);
    return free.cost < own.cost ? free.path : own.path;
  }
  return elbowSearch(a, b, mid, null).path;
}

function elbowSearch(a: End, b: End, mid: Pt | null, axis: "x" | "y" | null): { path: Pt[]; cost: number } {
  const na = axisOf(a.n);
  const nb = axisOf(b.n);
  const A = a.p;
  const B = b.p;
  const sa = na ? stubOf(A, na, a.box) : null;
  const sb = nb ? stubOf(B, nb, b.box) : null;
  const xs: number[] = [];
  const ys: number[] = [];
  if (mid) {
    if (axis !== "y") xs.push(mid.x);
    if (axis !== "x") ys.push(mid.y);
  } else {
    const pa = sa ?? A;
    const pb = sb ?? B;
    xs.push((pa.x + pb.x) / 2, (A.x + B.x) / 2);
    ys.push((pa.y + pb.y) / 2, (A.y + B.y) / 2);
    for (const r of [a.box, b.box]) {
      if (!r) continue;
      xs.push(r.x - STUB, r.x + r.w + STUB);
      ys.push(r.y - STUB, r.y + r.h + STUB);
    }
    const ra = a.box;
    const rb = b.box;
    if (ra && rb) {
      if (ra.x + ra.w < rb.x) xs.push((ra.x + ra.w + rb.x) / 2);
      if (rb.x + rb.w < ra.x) xs.push((rb.x + rb.w + ra.x) / 2);
      if (ra.y + ra.h < rb.y) ys.push((ra.y + ra.h + rb.y) / 2);
      if (rb.y + rb.h < ra.y) ys.push((rb.y + rb.h + ra.y) / 2);
      // общий обход сверху/снизу/сбоку
      xs.push(Math.min(ra.x, rb.x) - STUB, Math.max(ra.x + ra.w, rb.x + rb.w) + STUB);
      ys.push(Math.min(ra.y, rb.y) - STUB, Math.max(ra.y + ra.h, rb.y + rb.h) + STUB);
    }
  }
  const heads: Pt[][] = sa ? [[A, sa], [A]] : [[A]];
  const tails: Pt[][] = sb ? [[sb, B], [B]] : [[B]];
  let best: Pt[] | null = null;
  let bestCost = Infinity;
  const consider = (pts: Pt[]) => {
    const path = clean(pts);
    const c = score(path, a, b, na, nb, mid);
    if (c < bestCost) {
      bestCost = c;
      best = path;
    }
  };
  for (const h of heads) {
    for (const t of tails) {
      const p = h[h.length - 1]!;
      const q = t[0]!;
      // сначала «Z» с коленом посередине — при равной цене выигрывает он
      for (const x of xs) consider([...h, { x, y: p.y }, { x, y: q.y }, ...t]);
      for (const y of ys) consider([...h, { x: p.x, y }, { x: q.x, y }, ...t]);
      if (!mid) {
        consider([...h, { x: q.x, y: p.y }, ...t]);
        consider([...h, { x: p.x, y: q.y }, ...t]);
      }
    }
  }
  return { path: best ?? [A, B], cost: bestCost };
}

/** Колено ломаной из сохранённых изломов: отрезок [m1, m2] или (по-старому) одна точка. */
function elbowMid(ctrl: Pt[]): { mid: Pt; axis: "x" | "y" | null } | null {
  if (ctrl.length >= 4) {
    const m1 = ctrl[1]!;
    const m2 = ctrl[2]!;
    const axis = Math.abs(m2.x - m1.x) >= Math.abs(m2.y - m1.y) ? "y" : "x";
    return { mid: { x: (m1.x + m2.x) / 2, y: (m1.y + m2.y) / 2 }, axis };
  }
  if (ctrl.length === 3) return { mid: ctrl[1]!, axis: null };
  return null;
}

/* ------------------------------ кривые ------------------------------ */

type Cubic = [Pt, Pt, Pt, Pt];

/** Плавная линия через точки; на концах — вдоль нормалей узлов. */
function curvePieces(pts: Pt[], n0: Pt | null, n1: Pt | null): Cubic[] {
  const n = pts.length;
  const out: Cubic[] = [];
  if (n < 2) return out;
  const dirs: (Pt | null)[] = pts.map((_, i) => {
    if (i === 0) return n0;
    if (i === n - 1) return n1 ? { x: -n1.x, y: -n1.y } : null;
    return unit(sub(pts[i + 1]!, pts[i - 1]!));
  });
  for (let i = 0; i + 1 < n; i++) {
    const p = pts[i]!;
    const q = pts[i + 1]!;
    const L = dist(p, q);
    const twoEnds = n === 2;
    // у связи из двух точек «ручки» длиннее, чтобы получалась S-кривая
    const k = twoEnds ? Math.max(28, Math.min(260, L * 0.42)) : L * 0.36;
    const d0 = dirs[i];
    const d1 = dirs[i + 1];
    const c1 = d0 ? add(p, d0, k) : add(p, sub(d1 ? add(q, d1, -k) : q, p), 1 / 3);
    const c2 = d1 ? add(q, d1, -k) : add(q, sub(c1, q), 1 / 3);
    out.push([p, c1, c2, q]);
  }
  return out;
}

function cubicAt(c: Cubic, t: number): Pt {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const d = 3 * u * t * t;
  const e = t * t * t;
  return { x: a * c[0].x + b * c[1].x + d * c[2].x + e * c[3].x, y: a * c[0].y + b * c[1].y + d * c[2].y + e * c[3].y };
}

/* ---------------------------- наконечники ---------------------------- */

export interface HeadGeo {
  head: Head;
  d: string;
  /** stroke — линией, fill — заливкой, hollow — контур с заливкой фоном. */
  style: "stroke" | "fill" | "hollow";
  tip: Pt;
  /** Направление к острию. */
  t: Pt;
  /** Длина наконечника в мире. */
  len: number;
  /** Кончики «усов» (их можно тянуть). */
  barbs: Pt[];
}

/** Усы по умолчанию: [длина в долях, угол от направления к острию]. */
export const DEFAULT_BARBS: Partial<Record<Head, number[]>> = {
  arrow: [0.95, Math.PI - 0.5, 0.95, -(Math.PI - 0.5)],
  triangle: [1, Math.PI - 0.42, 1, -(Math.PI - 0.42)],
  "triangle-o": [1, Math.PI - 0.42, 1, -(Math.PI - 0.42)],
};
export const BARBED = new Set<Head>(["arrow", "triangle", "triangle-o"]);

const f = (p: Pt) => `${r2(p.x)},${r2(p.y)}`;
const circleD = (c: Pt, r: number) => `M${r2(c.x - r)},${r2(c.y)}a${r2(r)},${r2(r)} 0 1 0 ${r2(r * 2)},0a${r2(r)},${r2(r)} 0 1 0 ${r2(-r * 2)},0Z`;

function headGeo(head: Head, tip: Pt, t: Pt, L: number, sw: number, scale: number, custom?: number[]): { g: HeadGeo; cut: number } {
  const back = { x: -t.x, y: -t.y };
  const pn = { x: -t.y, y: t.x };
  const mk = (d: string, style: HeadGeo["style"], barbs: Pt[] = []): HeadGeo => ({ head, d, style, tip, t, len: L, barbs });
  if (BARBED.has(head)) {
    const bb = custom && custom.length === 4 && custom.every(Number.isFinite) ? custom : DEFAULT_BARBS[head]!;
    const b0 = add(tip, rot(t, bb[1]!), bb[0]! * L);
    const b1 = add(tip, rot(t, bb[3]!), bb[2]! * L);
    const base = Math.max(0, -dot(sub({ x: (b0.x + b1.x) / 2, y: (b0.y + b1.y) / 2 }, tip), t));
    if (head === "arrow") return { g: mk(`M${f(b0)}L${f(tip)}L${f(b1)}`, "stroke", [b0, b1]), cut: 0 };
    const d = `M${f(b0)}L${f(tip)}L${f(b1)}Z`;
    if (head === "triangle") return { g: mk(d, "fill", [b0, b1]), cut: base * 0.8 };
    return { g: mk(d, "hollow", [b0, b1]), cut: base };
  }
  switch (head) {
    case "dot": {
      const r = (sw * 1.4 + 2.5) * scale;
      return { g: mk(circleD(tip, r), "fill"), cut: r };
    }
    case "circle": {
      const r = (sw * 1.2 + 3.5) * scale;
      return { g: mk(circleD(add(tip, back, r), r), "hollow"), cut: r * 2 };
    }
    case "diamond":
    case "diamond-o": {
      const m = add(tip, back, L * 0.55);
      const e = add(tip, back, L * 1.1);
      const d = `M${f(tip)}L${f(add(m, pn, L * 0.34))}L${f(e)}L${f(add(m, pn, -L * 0.34))}Z`;
      return head === "diamond" ? { g: mk(d, "fill"), cut: L * 0.95 } : { g: mk(d, "hollow"), cut: L * 1.1 };
    }
    case "bar": {
      const c = add(tip, back, sw * 0.5);
      return { g: mk(`M${f(add(c, pn, L * 0.55))}L${f(add(c, pn, -L * 0.55))}`, "stroke"), cut: 0 };
    }
    case "crow": {
      const p = add(tip, back, L * 0.9);
      return { g: mk(`M${f(add(tip, pn, L * 0.55))}L${f(p)}L${f(add(tip, pn, -L * 0.55))}M${f(p)}L${f(tip)}`, "stroke"), cut: 0 };
    }
    default:
      return { g: mk("", "stroke"), cut: 0 };
  }
}

/** Значок наконечника для меню и панелей: короткая линия с ним на конце
    (start — наконечник слева, как в начале линии). Строится той же
    геометрией, что и на доске. */
export function headGlyph(head: Head, start = false, w = 30, h = 16): string {
  const y = h / 2;
  const tipX = start ? 4 : w - 4;
  const t = { x: start ? -1 : 1, y: 0 };
  const { g, cut } = headGeo(head, { x: tipX, y }, t, 7.5, 1.6, 1);
  const from = start ? w - 3 : 3;
  const to = tipX - t.x * cut;
  const fill = g.style === "fill" ? "currentColor" : "none";
  const headPath = g.d ? `<path d="${g.d}" fill="${fill}"/>` : "";
  return (
    `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">` +
    `<path d="M${from} ${y}H${r2(to)}"/>${headPath}</svg>`
  );
}

/* ------------------------------ сборка ------------------------------ */

export interface ConnectorGeo {
  route: Route;
  /** Опорные точки: концы с учётом привязок и изломы. */
  ctrl: Pt[];
  /** Ломаная, повторяющая нарисованную линию (для попаданий и габаритов). */
  track: Pt[];
  /** Ствол линии. */
  d: string;
  /** Наконечники: [в начале, в конце]. */
  heads: [HeadGeo | null, HeadGeo | null];
  /** Середины отрезков между опорными точками на самой линии (ручки «добавить излом»). */
  mids: Pt[];
  /** Ручка колена ломаной: середина, ось сдвига (x — отрезок вертикальный) и концы отрезка. */
  elbow: { p: Pt; axis: "x" | "y"; a: Pt; b: Pt } | null;
  /** Место подписи. */
  label: Pt;
  len: number;
  /** Габариты самой линии. */
  box: Rect;
  /** Габариты вместе с наконечниками — сколько места нужно для рисования. */
  paint: Rect;
}

export interface ConnectorInput {
  raw: Pt[];
  e0: EndSpec | null;
  e1: EndSpec | null;
  props: NodeProps;
  /** Система отсчёта изломов (мировые координаты), если есть. */
  rf: [Pt, Pt] | null;
}

/** Опорные точки линии: концы по привязкам, изломы — в новой системе отсчёта. */
export function resolvePoints(i: ConnectorInput): { ctrl: Pt[]; ends: [End, End] } {
  const raw = i.raw;
  const n = raw.length;
  const route = routeOf(i.props);
  if (n < 2) {
    const p = raw[0] ?? { x: 0, y: 0 };
    const e = { p, n: null, box: null };
    return { ctrl: raw.slice(), ends: [e, e] };
  }
  const a0 = i.e0 ? anchorPoint(i.e0.node, i.e0.bind) : raw[0]!;
  const a1 = i.e1 ? anchorPoint(i.e1.node, i.e1.bind) : raw[n - 1]!;
  let inner = raw.slice(1, -1);
  if (inner.length && i.rf && (i.e0 || i.e1)) inner = reframe(inner, i.rf[0], i.rf[1], a0, a1);
  // куда «смотрит» каждый конец: на соседний излом или на другой конец
  const box0 = i.e0 ? outlineOf(i.e0.node).box : null;
  const box1 = i.e1 ? outlineOf(i.e1.node).box : null;
  const elbowMid = route === "elbow";
  const toward0: Pt | Rect = inner.length && !elbowMid ? inner[0]! : (box1 ?? a1);
  const toward1: Pt | Rect = inner.length && !elbowMid ? inner[inner.length - 1]! : (box0 ?? a0);
  const e0: End = i.e0 ? resolveEnd(i.e0, toward0, route) : { p: raw[0]!, n: null, box: null };
  const e1: End = i.e1 ? resolveEnd(i.e1, toward1, route) : { p: raw[n - 1]!, n: null, box: null };
  return { ctrl: [e0.p, ...inner, e1.p], ends: [e0, e1] };
}

export function buildConnector(i: ConnectorInput): ConnectorGeo {
  const p = i.props;
  const route = routeOf(p);
  const { ctrl, ends } = resolvePoints(i);
  const sw = strokePx(p.stroke);
  const scale = HEAD_SCALE[p.hs ?? "m"] ?? 1;
  const L = headSize(sw) * scale;
  const head0 = p.head0 ?? "none";
  const head1 = p.head1 ?? "none";

  let poly: Pt[] | null = null;
  let cubics: Cubic[] | null = null;
  let elbow: ConnectorGeo["elbow"] = null;
  const mids: Pt[] = [];
  if (ctrl.length < 2) poly = ctrl.slice();
  else if (route === "elbow") {
    const em = elbowMid(ctrl);
    poly = elbowRoute(ends[0], ends[1], em?.mid ?? null, em?.axis ?? null);
    if (poly.length >= 2) {
      const k = poly.length - 1;
      // колено, которое двигали, — ближайший к нему отрезок; иначе средний
      let si = Math.floor((k - 1) / 2);
      if (em) {
        let bd = Infinity;
        for (let i = 0; i < k; i++) {
          const d = distToPolyline(em.mid, [poly[i]!, poly[i + 1]!]);
          if (d < bd - 0.01) {
            bd = d;
            si = i;
          }
        }
      }
      const a = poly[si]!;
      const b = poly[si + 1]!;
      if (dist(a, b) > 1) elbow = { p: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, axis: Math.abs(a.x - b.x) < 0.5 ? "x" : "y", a, b };
    }
  } else if (route === "curve") {
    cubics = curvePieces(ctrl, ends[0].n, ends[1].n);
    for (const c of cubics) mids.push(cubicAt(c, 0.5));
  } else {
    poly = ctrl.slice();
    for (let k = 0; k + 1 < ctrl.length; k++) mids.push({ x: (ctrl[k]!.x + ctrl[k + 1]!.x) / 2, y: (ctrl[k]!.y + ctrl[k + 1]!.y) / 2 });
  }

  // ломаная для попаданий: кривые раскладываются на короткие отрезки
  const track: Pt[] = [];
  if (cubics) {
    cubics.forEach((c, ci) => {
      const len = dist(c[0], c[1]) + dist(c[1], c[2]) + dist(c[2], c[3]);
      const steps = Math.max(6, Math.min(40, Math.ceil(len / 14)));
      for (let s = ci ? 1 : 0; s <= steps; s++) track.push(cubicAt(c, s / steps));
    });
  } else if (poly) track.push(...poly);

  // направления на остриях
  let t0: Pt = { x: -1, y: 0 };
  let t1: Pt = { x: 1, y: 0 };
  if (cubics && cubics.length) {
    const c0 = cubics[0]!;
    const cn = cubics[cubics.length - 1]!;
    t0 = unit(sub(c0[0], dist(c0[0], c0[1]) > 0.5 ? c0[1] : c0[3]));
    t1 = unit(sub(cn[3], dist(cn[3], cn[2]) > 0.5 ? cn[2] : cn[0]));
  } else if (track.length >= 2) {
    t0 = unit(sub(track[0]!, track[1]!));
    t1 = unit(sub(track[track.length - 1]!, track[track.length - 2]!));
  }

  const heads: [HeadGeo | null, HeadGeo | null] = [null, null];
  const cuts = [0, 0];
  if (track.length >= 2) {
    if (head0 !== "none") {
      const h = headGeo(head0, track[0]!, t0, L, sw, scale, p.hb0);
      heads[0] = h.g;
      cuts[0] = h.cut;
    }
    if (head1 !== "none") {
      const h = headGeo(head1, track[track.length - 1]!, t1, L, sw, scale, p.hb1);
      heads[1] = h.g;
      cuts[1] = h.cut;
    }
  }

  // ствол короче на величину закрашенного наконечника
  let d = "";
  if (cubics && cubics.length) {
    const cs = cubics.map((c) => c.slice() as Cubic);
    if (cuts[0]) {
      const c = cs[0]!;
      const k = Math.min(cuts[0], dist(c[0], c[3]) * 0.45);
      const dv = { x: -t0.x * k, y: -t0.y * k };
      c[0] = add(c[0], dv);
      c[1] = add(c[1], dv);
    }
    if (cuts[1]) {
      const c = cs[cs.length - 1]!;
      const k = Math.min(cuts[1], dist(c[0], c[3]) * 0.45);
      const dv = { x: -t1.x * k, y: -t1.y * k };
      c[3] = add(c[3], dv);
      c[2] = add(c[2], dv);
    }
    d = `M${f(cs[0]![0])}` + cs.map((c) => `C${f(c[1])} ${f(c[2])} ${f(c[3])}`).join("");
  } else if (poly && poly.length >= 2) {
    const pts = poly.map((q) => ({ ...q }));
    const shorten = (i: number, j: number, t: Pt, k: number) => {
      const l = dist(pts[i]!, pts[j]!);
      const kk = Math.min(k, Math.max(0, l - 0.5));
      pts[i] = add(pts[i]!, t, -kk);
    };
    if (cuts[0]) shorten(0, 1, t0, cuts[0]);
    if (cuts[1]) shorten(pts.length - 1, pts.length - 2, t1, cuts[1]);
    d = route === "elbow" ? roundedD(pts, CORNER) : pts.map((q, k) => `${k ? "L" : "M"}${f(q)}`).join("");
  }

  // подпись — на доле lt длины линии
  let len = 0;
  for (let k = 1; k < track.length; k++) len += dist(track[k - 1]!, track[k]!);
  const label = pointAlong(track, len * (p.lt ?? 0.5));
  const box = boundsOf(track.length ? track : ctrl);
  const ext: Pt[] = [{ x: box.x, y: box.y }, { x: box.x + box.w, y: box.y + box.h }];
  for (const h of heads) {
    if (!h) continue;
    ext.push(...h.barbs);
    const r = h.len * 1.25 + sw;
    ext.push({ x: h.tip.x - r, y: h.tip.y - r }, { x: h.tip.x + r, y: h.tip.y + r });
  }
  const paint = boundsOf(ext);
  return { route, ctrl, track, d, heads, mids, elbow, label, len, box, paint };
}

/** Точка на ломаной на расстоянии at от начала. */
export function pointAlong(track: Pt[], at: number): Pt {
  if (!track.length) return { x: 0, y: 0 };
  let left = Math.max(0, at);
  for (let k = 1; k < track.length; k++) {
    const a = track[k - 1]!;
    const b = track[k]!;
    const l = dist(a, b);
    if (left <= l && l > 0) return { x: a.x + ((b.x - a.x) * left) / l, y: a.y + ((b.y - a.y) * left) / l };
    left -= l;
  }
  return track[track.length - 1]!;
}

/** Доля длины линии, ближайшая к точке (для перетаскивания подписи). */
export function fractionAt(track: Pt[], p: Pt): number {
  let total = 0;
  let best = Infinity;
  let at = 0;
  for (let k = 1; k < track.length; k++) {
    const a = track[k - 1]!;
    const b = track[k]!;
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const l2 = ex * ex + ey * ey;
    const l = Math.sqrt(l2);
    const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * ex + (p.y - a.y) * ey) / l2)) : 0;
    const d = Math.hypot(p.x - a.x - ex * t, p.y - a.y - ey * t);
    if (d < best) {
      best = d;
      at = total + l * t;
    }
    total += l;
  }
  return total ? Math.max(0, Math.min(1, at / total)) : 0.5;
}

function roundedD(pts: Pt[], radius: number): string {
  let d = `M${f(pts[0]!)}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const c = pts[i + 1]!;
    const r = Math.min(radius, dist(a, b) / 2, dist(b, c) / 2);
    if (r < 0.5) {
      d += `L${f(b)}`;
      continue;
    }
    const p1 = add(b, unit(sub(a, b)), r);
    const p2 = add(b, unit(sub(c, b)), r);
    d += `L${f(p1)}Q${f(b)} ${f(p2)}`;
  }
  return d + `L${f(pts[pts.length - 1]!)}`;
}

/* ------------------------------ прилипание ------------------------------ */

export interface SnapHit {
  node: NodeView;
  bind: Binding;
  /** Точка на контуре, куда сядет конец (для «бусины»), если он на краю. */
  dot: Pt | null;
  /** Сторона-магнит, если конец прилип к середине стороны. */
  side: Side | null;
}

export interface SnapOptions {
  exclude?: string;
  /** Alt: точно в точку, без магнитов. */
  exact?: boolean;
}

/**
 * Куда прилипнет конец линии под указателем w (z — масштаб):
 * к магниту середины стороны, к ближайшей точке края, к узлу целиком
 * (конец сам выберет сторону) или никуда.
 */
export function snapEnd(order: readonly NodeView[], w: Pt, z: number, o: SnapOptions = {}): SnapHit | null {
  const R = 14 / z;
  for (let i = order.length - 1; i >= 0; i--) {
    const v = order[i]!;
    if (v.id === o.exclude || v.type === "path" || v.type === "ink") continue;
    const ol = outlineOf(v);
    const bx = ol.box;
    if (w.x < bx.x - R || w.x > bx.x + bx.w + R || w.y < bx.y - R || w.y > bx.y + bx.h + R) continue;
    const inside = insideOutline(ol, w);
    const near = nearestOnOutline(ol, w);
    if (!inside && near.d > R) continue;
    // рамки — только у края: внутри рамки целятся в её содержимое
    if (v.type === "frame" && inside && near.d > R) continue;
    const small = Math.min(v.w, v.H);
    if (o.exact) {
      if (inside) {
        const uv = uvOf(v, w);
        return { node: v, bind: { id: v.id, u: uv.u, v: uv.v, precise: true }, dot: null, side: null };
      }
      const uv = uvOf(v, near.p);
      return { node: v, bind: { id: v.id, u: uv.u, v: uv.v, precise: true, edge: true }, dot: near.p, side: null };
    }
    const magnetR = Math.min(18 / z, Math.max(6 / z, small * 0.3));
    let bestM: { side: Side; p: Pt } | null = null;
    let bestD = magnetR;
    for (const m of magnetsOf(v)) {
      const d = dist(m.p, w);
      if (d <= bestD) {
        bestD = d;
        bestM = m;
      }
    }
    if (bestM) {
      const uv = uvOf(v, bestM.p);
      return { node: v, bind: { id: v.id, u: uv.u, v: uv.v, precise: true, edge: true }, dot: bestM.p, side: bestM.side };
    }
    const band = inside ? Math.min(11 / z, small * 0.16) : R;
    if (near.d <= band) {
      const uv = uvOf(v, near.p);
      return { node: v, bind: { id: v.id, u: uv.u, v: uv.v, precise: true, edge: true }, dot: near.p, side: null };
    }
    return { node: v, bind: { id: v.id, u: 0.5, v: 0.5, precise: false }, dot: null, side: null };
  }
  return null;
}
