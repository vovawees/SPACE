/* Геометрия: прямоугольники, повороты, пересечения. Все координаты — мировые. */

export interface Pt {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const EMPTY: Rect = { x: 0, y: 0, w: 0, h: 0 };

export function rect(x: number, y: number, w: number, h: number): Rect {
  return { x, y, w, h };
}

export function fromPoints(a: Pt, b: Pt): Rect {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
}

export function boundsOf(pts: ArrayLike<Pt> | Pt[]): Rect {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    if (p.x < x0) x0 = p.x;
    if (p.y < y0) y0 = p.y;
    if (p.x > x1) x1 = p.x;
    if (p.y > y1) y1 = p.y;
  }
  if (x0 === Infinity) return { ...EMPTY };
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export function union(rects: Rect[]): Rect | null {
  if (!rects.length) return null;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const r of rects) {
    x0 = Math.min(x0, r.x);
    y0 = Math.min(y0, r.y);
    x1 = Math.max(x1, r.x + r.w);
    y1 = Math.max(y1, r.y + r.h);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export function intersects(a: Rect, b: Rect): boolean {
  return a.x <= b.x + b.w && a.x + a.w >= b.x && a.y <= b.y + b.h && a.y + a.h >= b.y;
}

export function contains(outer: Rect, inner: Rect): boolean {
  return inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h;
}

export function containsPt(r: Rect, p: Pt, pad = 0): boolean {
  return p.x >= r.x - pad && p.x <= r.x + r.w + pad && p.y >= r.y - pad && p.y <= r.y + r.h + pad;
}

export function expand(r: Rect, d: number): Rect {
  return { x: r.x - d, y: r.y - d, w: r.w + 2 * d, h: r.h + 2 * d };
}

export function center(r: Rect): Pt {
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

export function dist(a: Pt, b: Pt): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function rotate(p: Pt, c: Pt, angle: number): Pt {
  if (!angle) return p;
  const s = Math.sin(angle);
  const k = Math.cos(angle);
  const dx = p.x - c.x;
  const dy = p.y - c.y;
  return { x: c.x + dx * k - dy * s, y: c.y + dx * s + dy * k };
}

/** Углы повёрнутого прямоугольника (поворот вокруг центра). */
export function corners(r: Rect, angle = 0): Pt[] {
  const c = center(r);
  return [
    { x: r.x, y: r.y },
    { x: r.x + r.w, y: r.y },
    { x: r.x + r.w, y: r.y + r.h },
    { x: r.x, y: r.y + r.h },
  ].map((p) => rotate(p, c, angle));
}

/** Описывающий прямоугольник с учётом поворота. */
export function aabb(r: Rect, angle = 0): Rect {
  if (!angle) return r;
  return boundsOf(corners(r, angle));
}

export function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export function segmentsIntersect(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const o = (p: Pt, q: Pt, r: Pt) => Math.sign((q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y));
  const o1 = o(a, b, c);
  const o2 = o(a, b, d);
  const o3 = o(c, d, a);
  const o4 = o(c, d, b);
  return o1 !== o2 && o3 !== o4;
}

/** Пересекает ли отрезок прямоугольник (для ластика и выделения линий). */
export function segmentHitsRect(a: Pt, b: Pt, r: Rect): boolean {
  if (containsPt(r, a) || containsPt(r, b)) return true;
  const c = corners(r);
  for (let i = 0; i < 4; i++) if (segmentsIntersect(a, b, c[i]!, c[(i + 1) % 4]!)) return true;
  return false;
}

/** Точка пересечения луча from→to с границей фигуры (прямоугольник/эллипс, с поворотом). */
export function clipToShape(from: Pt, to: Pt, r: Rect, angle: number, ellipse: boolean): Pt | null {
  const c = center(r);
  // переходим в локальную систему фигуры
  const f = rotate(from, c, -angle);
  const t = rotate(to, c, -angle);
  const dx = t.x - f.x;
  const dy = t.y - f.y;
  let best: number | null = null;
  if (ellipse) {
    const rx = r.w / 2 || 1;
    const ry = r.h / 2 || 1;
    const ox = (f.x - c.x) / rx;
    const oy = (f.y - c.y) / ry;
    const vx = dx / rx;
    const vy = dy / ry;
    const A = vx * vx + vy * vy;
    const B = 2 * (ox * vx + oy * vy);
    const C = ox * ox + oy * oy - 1;
    const D = B * B - 4 * A * C;
    if (D >= 0 && A > 0) {
      const s = Math.sqrt(D);
      for (const k of [(-B - s) / (2 * A), (-B + s) / (2 * A)]) {
        if (k >= 0 && k <= 1 && (best === null || k < best)) best = k;
      }
    }
  } else {
    const xs = [r.x, r.x + r.w];
    const ys = [r.y, r.y + r.h];
    if (dx) {
      for (const x of xs) {
        const k = (x - f.x) / dx;
        const y = f.y + k * dy;
        if (k >= 0 && k <= 1 && y >= r.y - 0.01 && y <= r.y + r.h + 0.01 && (best === null || k < best)) best = k;
      }
    }
    if (dy) {
      for (const y of ys) {
        const k = (y - f.y) / dy;
        const x = f.x + k * dx;
        if (k >= 0 && k <= 1 && x >= r.x - 0.01 && x <= r.x + r.w + 0.01 && (best === null || k < best)) best = k;
      }
    }
  }
  if (best === null) return null;
  return rotate({ x: f.x + best * dx, y: f.y + best * dy }, c, angle);
}

export function snapAngle(angle: number, step = Math.PI / 12): number {
  return Math.round(angle / step) * step;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export const r2 = (v: number) => Math.round(v * 100) / 100;

/** Упрощение ломаной (Рамер — Дуглас — Пекер). */
export function simplify(pts: Pt[], eps: number): Pt[] {
  if (pts.length < 3) return pts.slice();
  const keep = new Uint8Array(pts.length);
  keep[0] = 1;
  keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop()!;
    let maxD = 0;
    let idx = -1;
    for (let i = s + 1; i < e; i++) {
      const d = distToSegment(pts[i]!, pts[s]!, pts[e]!);
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (maxD > eps && idx > 0) {
      keep[idx] = 1;
      stack.push([s, idx], [idx, e]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

export function pathLength(pts: Pt[]): number {
  let l = 0;
  for (let i = 1; i < pts.length; i++) l += dist(pts[i - 1]!, pts[i]!);
  return l;
}

/** Равномерная передискретизация ломаной в n точек. */
export function resample(pts: Pt[], n: number): Pt[] {
  if (pts.length < 2) return pts.slice();
  const total = pathLength(pts);
  if (!total) return [pts[0]!];
  const step = total / (n - 1);
  const out: Pt[] = [{ ...pts[0]! }];
  let acc = 0;
  let prev = pts[0]!;
  for (let i = 1; i < pts.length; i++) {
    let cur = pts[i]!;
    let d = dist(prev, cur);
    while (acc + d >= step && out.length < n) {
      const t = (step - acc) / d;
      const p = { x: prev.x + t * (cur.x - prev.x), y: prev.y + t * (cur.y - prev.y) };
      out.push(p);
      prev = p;
      d = dist(prev, cur);
      acc = 0;
    }
    acc += d;
    prev = cur;
  }
  while (out.length < n) out.push({ ...pts[pts.length - 1]! });
  return out;
}
