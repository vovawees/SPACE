/* «Свечение» под скоплениями карточек.

   Настоящее скалярное поле: каждая карточка даёт exp(−d / reach), где d —
   расстояние до её прямоугольника; вклады складываются и проходят через
   одну плавную ступень. Одинокая карточка даёт ~1 — ниже порога, её не
   видно; две рядом дают лужицу между собой; несколько сливаются в одно
   пятно по форме группы, а не по кругу.

   Поле считается в координатах мира: при прокрутке ничего не
   пересчитывается — холст просто едет вместе с доской.
   Пересчёт — только когда узлы сдвинулись или вид ушёл далеко. */
import type { Rect } from "./geometry.ts";

const REACH = 108;
const FOOT = 0.98;
const FULL = 2.55;
const CUT = 2.4;
const TAIL = Math.exp(-CUT);

export interface GlowField {
  x: number;
  y: number;
  step: number;
  bw: number;
  bh: number;
  data: ImageData;
}

const smooth = (t: number) => t * t * (3 - 2 * t);

/**
 * Поле для прямоугольников в области area. Возвращает null, если
 * светиться нечему (меньше двух карточек рядом).
 */
export function computeGlow(rects: Rect[], area: Rect, tint: [number, number, number], cap: number, maxSamples = 140_000): GlowField | null {
  if (rects.length < 2) return null;
  const halo = REACH * CUT;
  // область — только вокруг карточек и в пределах вида
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const r of rects) {
    x0 = Math.min(x0, r.x - halo);
    y0 = Math.min(y0, r.y - halo);
    x1 = Math.max(x1, r.x + r.w + halo);
    y1 = Math.max(y1, r.y + r.h + halo);
  }
  x0 = Math.max(x0, area.x);
  y0 = Math.max(y0, area.y);
  x1 = Math.min(x1, area.x + area.w);
  y1 = Math.min(y1, area.y + area.h);
  if (x1 <= x0 || y1 <= y0) return null;
  const step = Math.max(9, Math.sqrt(((x1 - x0) * (y1 - y0)) / maxSamples));
  const bw = Math.max(2, Math.ceil((x1 - x0) / step) + 1);
  const bh = Math.max(2, Math.ceil((y1 - y0) / step) + 1);
  const field = new Float32Array(bw * bh);
  const inv = 1 / REACH;
  const norm = 1 / (1 - TAIL);

  for (const r of rects) {
    const gx0 = Math.max(0, Math.floor((r.x - halo - x0) / step));
    const gx1 = Math.min(bw - 1, Math.ceil((r.x + r.w + halo - x0) / step));
    const gy0 = Math.max(0, Math.floor((r.y - halo - y0) / step));
    const gy1 = Math.min(bh - 1, Math.ceil((r.y + r.h + halo - y0) / step));
    if (gx1 < gx0 || gy1 < gy0) continue;
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    const hw = r.w / 2;
    const hh = r.h / 2;
    for (let gy = gy0; gy <= gy1; gy++) {
      const py = y0 + gy * step;
      const dy = Math.max(Math.abs(py - cy) - hh, 0);
      if (dy > halo) continue;
      const row = gy * bw;
      for (let gx = gx0; gx <= gx1; gx++) {
        const px = x0 + gx * step;
        const dx = Math.max(Math.abs(px - cx) - hw, 0);
        const d = dx === 0 ? dy : dy === 0 ? dx : Math.sqrt(dx * dx + dy * dy);
        if (d >= halo) continue;
        // хвост вычтен — на границе ореола вклад плавно уходит в ноль
        field[row + gx]! += (Math.exp(-d * inv) - TAIL) * norm;
      }
    }
  }

  const data = new ImageData(bw, bh);
  const px = data.data;
  const span = FULL - FOOT;
  const [tr, tg, tb] = tint;
  let any = false;
  for (let i = 0, p = 0; i < field.length; i++, p += 4) {
    const v = field[i]!;
    if (v <= FOOT) continue;
    const t = v >= FULL ? 1 : (v - FOOT) / span;
    const a = smooth(t) * cap;
    px[p] = tr;
    px[p + 1] = tg;
    px[p + 2] = tb;
    px[p + 3] = (a * 255) | 0;
    if (px[p + 3]) any = true;
  }
  if (!any) return null;
  return { x: x0, y: y0, step, bw, bh, data };
}
