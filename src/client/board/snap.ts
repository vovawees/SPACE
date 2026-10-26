/* Прилипание: края и центры перетаскиваемого прямоугольника липнут к
   краям и центрам соседей; найденные совпадения рисуются направляющими. */
import type { Rect } from "./geometry.ts";

export interface Guide {
  axis: "x" | "y";
  at: number;
  from: number;
  to: number;
}

export interface SnapResult {
  dx: number;
  dy: number;
  guides: Guide[];
}

const xs = (r: Rect) => [r.x, r.x + r.w / 2, r.x + r.w];
const ys = (r: Rect) => [r.y, r.y + r.h / 2, r.y + r.h];

export function snapRect(m: Rect, others: Rect[], threshold: number, axes: { x: boolean; y: boolean } = { x: true, y: true }): SnapResult {
  let bestX = threshold + 1;
  let bestY = threshold + 1;
  let dx = 0;
  let dy = 0;
  const mx = xs(m);
  const my = ys(m);
  for (const o of others) {
    if (axes.x) {
      for (const a of mx) {
        for (const b of xs(o)) {
          const d = b - a;
          if (Math.abs(d) < Math.abs(bestX)) {
            bestX = d;
            dx = d;
          }
        }
      }
    }
    if (axes.y) {
      for (const a of my) {
        for (const b of ys(o)) {
          const d = b - a;
          if (Math.abs(d) < Math.abs(bestY)) {
            bestY = d;
            dy = d;
          }
        }
      }
    }
  }
  if (Math.abs(bestX) > threshold) dx = 0;
  if (Math.abs(bestY) > threshold) dy = 0;
  const snapped = { x: m.x + dx, y: m.y + dy, w: m.w, h: m.h };
  return { dx, dy, guides: guidesFor(snapped, others, Math.abs(bestX) <= threshold, Math.abs(bestY) <= threshold) };
}

function guidesFor(m: Rect, others: Rect[], gx: boolean, gy: boolean): Guide[] {
  const out: Guide[] = [];
  const eps = 0.5;
  if (gx) {
    for (const a of xs(m)) {
      let from = Infinity;
      let to = -Infinity;
      for (const o of others) {
        if (xs(o).some((b) => Math.abs(b - a) < eps)) {
          from = Math.min(from, o.y, m.y);
          to = Math.max(to, o.y + o.h, m.y + m.h);
        }
      }
      if (from < to) out.push({ axis: "x", at: a, from, to });
    }
  }
  if (gy) {
    for (const a of ys(m)) {
      let from = Infinity;
      let to = -Infinity;
      for (const o of others) {
        if (ys(o).some((b) => Math.abs(b - a) < eps)) {
          from = Math.min(from, o.x, m.x);
          to = Math.max(to, o.x + o.w, m.x + m.w);
        }
      }
      if (from < to) out.push({ axis: "y", at: a, from, to });
    }
  }
  return out;
}

/** Прилипание отдельных значений (края при изменении размера). */
export function snapValue(v: number, targets: number[], threshold: number): number | null {
  let best: number | null = null;
  let bd = threshold;
  for (const t of targets) {
    const d = Math.abs(t - v);
    if (d <= bd) {
      bd = d;
      best = t;
    }
  }
  return best;
}
