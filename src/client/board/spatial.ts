/* Пространственный индекс узлов: мир разбит на клетки CELL×CELL, у каждой
   клетки — список узлов, чьи габариты её задевают. Изменённый узел только
   помечается; переиндексация — при ближайшем запросе. Выборка «что в этом
   прямоугольнике» стоит столько, сколько узлов рядом, а не на всей доске. */
import type { Rect } from "./geometry.ts";

const CELL = 512;
/** Узел шире стольких клеток лежит в отдельном списке и проверяется всегда. */
const BIG = 96;
const key = (cx: number, cy: number) => cx * 67108864 + cy;

interface Slot {
  box: Rect;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  big: boolean;
  /** Номер последнего запроса, в который узел уже попал (без повторов). */
  q: number;
}

export class SpatialIndex<T> {
  private cells = new Map<number, T[]>();
  private slots = new Map<T, Slot>();
  private dirty = new Set<T>();
  private big = new Set<T>();
  private qid = 0;

  private readonly boundsOf: (v: T) => Rect;

  constructor(boundsOf: (v: T) => Rect) {
    this.boundsOf = boundsOf;
  }

  get size(): number {
    return this.slots.size + this.dirty.size;
  }

  /** Узел появился или сдвинулся. */
  mark(v: T) {
    this.dirty.add(v);
  }

  delete(v: T) {
    this.dirty.delete(v);
    this.unplace(v);
  }

  /** Габариты узла (как их видит индекс). */
  box(v: T): Rect | undefined {
    this.flush();
    return this.slots.get(v)?.box;
  }

  flush() {
    if (!this.dirty.size) return;
    for (const v of this.dirty) {
      this.unplace(v);
      this.place(v);
    }
    this.dirty.clear();
  }

  /** Все узлы, чьи габариты пересекают r (порядок произвольный). */
  query(r: Rect, out: T[] = []): T[] {
    this.flush();
    const q = ++this.qid;
    const x0 = Math.floor(r.x / CELL);
    const y0 = Math.floor(r.y / CELL);
    const x1 = Math.floor((r.x + r.w) / CELL);
    const y1 = Math.floor((r.y + r.h) / CELL);
    const test = (v: T, s: Slot) => {
      if (s.q === q) return;
      s.q = q;
      const b = s.box;
      if (b.x <= r.x + r.w && b.x + b.w >= r.x && b.y <= r.y + r.h && b.y + b.h >= r.y) out.push(v);
    };
    // огромная область (сильное отдаление) — дешевле пройти всех
    if ((x1 - x0 + 1) * (y1 - y0 + 1) > this.slots.size) {
      for (const [v, s] of this.slots) test(v, s);
      return out;
    }
    for (const v of this.big) test(v, this.slots.get(v)!);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const list = this.cells.get(key(cx, cy));
        if (!list) continue;
        for (const v of list) test(v, this.slots.get(v)!);
      }
    }
    return out;
  }

  private place(v: T) {
    const box = this.boundsOf(v);
    if (!Number.isFinite(box.x + box.y + box.w + box.h)) return;
    const x0 = Math.floor(box.x / CELL);
    const y0 = Math.floor(box.y / CELL);
    const x1 = Math.floor((box.x + box.w) / CELL);
    const y1 = Math.floor((box.y + box.h) / CELL);
    const big = (x1 - x0 + 1) * (y1 - y0 + 1) > BIG;
    this.slots.set(v, { box, x0, y0, x1, y1, big, q: 0 });
    if (big) {
      this.big.add(v);
      return;
    }
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const k = key(cx, cy);
        const list = this.cells.get(k);
        if (list) list.push(v);
        else this.cells.set(k, [v]);
      }
    }
  }

  private unplace(v: T) {
    const s = this.slots.get(v);
    if (!s) return;
    this.slots.delete(v);
    if (s.big) {
      this.big.delete(v);
      return;
    }
    for (let cx = s.x0; cx <= s.x1; cx++) {
      for (let cy = s.y0; cy <= s.y1; cy++) {
        const k = key(cx, cy);
        const list = this.cells.get(k);
        if (!list) continue;
        const i = list.indexOf(v);
        if (i >= 0) {
          list[i] = list[list.length - 1]!;
          list.pop();
        }
        if (!list.length) this.cells.delete(k);
      }
    }
  }
}
