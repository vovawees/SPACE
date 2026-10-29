import { describe, expect, it } from "vitest";
import { SpatialIndex } from "../../src/client/board/spatial.ts";
import type { Rect } from "../../src/client/board/geometry.ts";

type Item = { id: number; r: Rect };

function hits(a: Rect, b: Rect) {
  return a.x <= b.x + b.w && a.x + a.w >= b.x && a.y <= b.y + b.h && a.y + a.h >= b.y;
}

describe("spatial index", () => {
  it("matches brute force after inserts, moves and deletes", () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const items: Item[] = [];
    const idx = new SpatialIndex<Item>((v) => v.r);
    for (let i = 0; i < 800; i++) {
      const big = i % 97 === 0;
      const it: Item = { id: i, r: { x: (rnd() - 0.5) * 20000, y: (rnd() - 0.5) * 20000, w: big ? 9000 : rnd() * 600, h: big ? 7000 : rnd() * 400 } };
      items.push(it);
      idx.mark(it);
    }
    const check = () => {
      for (let k = 0; k < 40; k++) {
        const q = { x: (rnd() - 0.5) * 22000, y: (rnd() - 0.5) * 22000, w: rnd() * (k % 5 === 0 ? 30000 : 3000), h: rnd() * 2500 };
        const got = idx.query(q).map((v) => v.id).sort((a, b) => a - b);
        const want = items.filter((v) => hits(v.r, q)).map((v) => v.id).sort((a, b) => a - b);
        expect(got).toEqual(want);
      }
    };
    check();
    // сдвигаем часть и удаляем часть
    for (const it of items.slice(0, 300)) {
      it.r = { ...it.r, x: it.r.x + (rnd() - 0.5) * 3000, y: it.r.y + (rnd() - 0.5) * 3000 };
      idx.mark(it);
    }
    for (const it of items.splice(300, 100)) idx.delete(it);
    check();
    expect(idx.size).toBe(items.length);
  });
});
