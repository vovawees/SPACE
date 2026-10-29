/* «Свечение» под скоплениями карточек.

   Настоящее скалярное поле: каждая карточка даёт exp(−d / reach), где d —
   расстояние до её прямоугольника; вклады складываются и проходят через
   одну плавную ступень. Одинокая карточка даёт ~1 — ниже порога, её не
   видно; две рядом дают лужицу между собой; несколько сливаются в одно
   пятно по форме группы, а не по кругу.

   Поле считается на общей сетке мира: точка (i, j) — это мировые
   (i·GLOW_STEP, j·GLOW_STEP), независимо от камеры. Поэтому его можно
   считать кусками (плитками и их частями), и куски стыкуются без швов:
   при масштабе и прокрутке ничего не пересчитывается, а после правки —
   только место вокруг сдвинутых карточек. */

const REACH = 108;
const FOOT = 0.98;
const FULL = 2.55;
const CUT = 2.4;
const TAIL = Math.exp(-CUT);

/** Шаг сетки поля, мировые px. Поле гладкое — этого хватает при любом масштабе. */
export const GLOW_STEP = 9;
/** Плитка — столько точек по стороне. */
export const GLOW_TILE = 256;
/** Сторона плитки в мире. */
export const GLOW_TILE_W = GLOW_STEP * GLOW_TILE;
/** Дальше этого от карточки её вклада нет. */
export const GLOW_HALO = REACH * CUT;

const smooth = (t: number) => t * t * (3 - 2 * t);

/* exp() в самом горячем цикле заменён таблицей: 8 значений на единицу
   расстояния — точнее, чем видно на поле с шагом 9. */
const LUT_RES = 8;
const LUT = (() => {
  const n = Math.ceil(GLOW_HALO * LUT_RES) + 2;
  const t = new Float32Array(n);
  const norm = 1 / (1 - TAIL);
  for (let i = 0; i < n; i++) t[i] = Math.max(0, (Math.exp(-i / LUT_RES / REACH) - TAIL) * norm);
  return t;
})();

/**
 * Пиксели свечения для куска сетки: точки (sx0 + i, sy0 + j), i < w, j < h.
 * rects — плоский массив [x, y, w, h, …] всех карточек, чей ореол задевает
 * кусок (остальные на него не влияют). RGBA построчно или null, если в
 * куске ничего не светится.
 */
export function glowBlock(rects: ArrayLike<number>, sx0: number, sy0: number, w: number, h: number, tint: readonly [number, number, number], cap: number): Uint8ClampedArray | null {
  const n = rects.length >> 2;
  // одна карточка сама по себе не светится (её поле ≤ 1, ниже порога)
  if (n < 2 || w <= 0 || h <= 0) return null;
  const step = GLOW_STEP;
  const halo = GLOW_HALO;
  const field = new Float32Array(w * h);
  let hits = 0;

  for (let k = 0; k < n; k++) {
    const rx = rects[k * 4]!;
    const ry = rects[k * 4 + 1]!;
    const rw = rects[k * 4 + 2]!;
    const rh = rects[k * 4 + 3]!;
    const gx0 = Math.max(0, Math.ceil((rx - halo) / step) - sx0);
    const gx1 = Math.min(w - 1, Math.floor((rx + rw + halo) / step) - sx0);
    const gy0 = Math.max(0, Math.ceil((ry - halo) / step) - sy0);
    const gy1 = Math.min(h - 1, Math.floor((ry + rh + halo) / step) - sy0);
    if (gx1 < gx0 || gy1 < gy0) continue;
    hits++;
    const cx = rx + rw / 2;
    const cy = ry + rh / 2;
    const hw = rw / 2;
    const hh = rh / 2;
    for (let gy = gy0; gy <= gy1; gy++) {
      const py = (sy0 + gy) * step;
      const dy = Math.max(Math.abs(py - cy) - hh, 0);
      if (dy >= halo) continue;
      const row = gy * w;
      for (let gx = gx0; gx <= gx1; gx++) {
        const px = (sx0 + gx) * step;
        const dx = Math.max(Math.abs(px - cx) - hw, 0);
        const d = dx === 0 ? dy : dy === 0 ? dx : Math.sqrt(dx * dx + dy * dy);
        if (d >= halo) continue;
        // хвост вычтен — на границе ореола вклад плавно уходит в ноль
        field[row + gx]! += LUT[(d * LUT_RES) | 0]!;
      }
    }
  }
  if (hits < 2) return null;

  const px = new Uint8ClampedArray(w * h * 4);
  const span = FULL - FOOT;
  const [tr, tg, tb] = tint;
  let any = false;
  for (let i = 0, p = 0; i < field.length; i++, p += 4) {
    const v = field[i]!;
    if (v <= FOOT) continue;
    const t = v >= FULL ? 1 : (v - FOOT) / span;
    const a = (smooth(t) * cap * 255) | 0;
    if (!a) continue;
    px[p] = tr;
    px[p + 1] = tg;
    px[p + 2] = tb;
    px[p + 3] = a;
    any = true;
  }
  return any ? px : null;
}

/* ------------------------------ задания потоку ------------------------------ */

export interface GlowJob {
  key: string;
  /** Начало куска на сетке и его размер (в точках). */
  sx: number;
  sy: number;
  w: number;
  h: number;
  /** Кусок — вся плитка (иначе — её часть). */
  full: boolean;
  rects: Float64Array;
}

export interface GlowResult {
  key: string;
  sx: number;
  sy: number;
  w: number;
  h: number;
  full: boolean;
  /** RGBA куска или null — ничего не светится. */
  buf: ArrayBuffer | null;
}

export interface GlowRequest {
  id: number;
  jobs: GlowJob[];
  tint: [number, number, number];
  cap: number;
}

export interface GlowReply {
  id: number;
  results: GlowResult[];
}

export function runGlowJobs(jobs: readonly GlowJob[], tint: readonly [number, number, number], cap: number): GlowResult[] {
  return jobs.map((j) => {
    const px = glowBlock(j.rects, j.sx, j.sy, j.w, j.h, tint, cap);
    return { key: j.key, sx: j.sx, sy: j.sy, w: j.w, h: j.h, full: j.full, buf: px ? (px.buffer as ArrayBuffer) : null };
  });
}
