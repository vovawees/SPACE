import { describe, expect, it } from "vitest";
import { aabb, boundsOf, clipToShape, intersects, resample, simplify, union } from "../../src/client/board/geometry.ts";

describe("геометрия", () => {
  it("габариты точек и объединение", () => {
    expect(boundsOf([{ x: 1, y: 5 }, { x: -3, y: 2 }, { x: 4, y: -1 }])).toEqual({ x: -3, y: -1, w: 7, h: 6 });
    expect(union([{ x: 0, y: 0, w: 10, h: 10 }, { x: 20, y: -5, w: 5, h: 5 }])).toEqual({ x: 0, y: -5, w: 25, h: 15 });
    expect(union([])).toBeNull();
  });

  it("пересечение прямоугольников", () => {
    const a = { x: 0, y: 0, w: 10, h: 10 };
    expect(intersects(a, { x: 5, y: 5, w: 10, h: 10 })).toBe(true);
    expect(intersects(a, { x: 11, y: 0, w: 5, h: 5 })).toBe(false);
  });

  it("повёрнутый прямоугольник: охватывающая рамка шире", () => {
    const r = aabb({ x: 0, y: 0, w: 100, h: 20 }, Math.PI / 2);
    expect(r.w).toBeCloseTo(20);
    expect(r.h).toBeCloseTo(100);
    expect(r.x + r.w / 2).toBeCloseTo(50);
  });

  it("стрелка упирается в край фигуры", () => {
    const box = { x: 100, y: 0, w: 100, h: 100 };
    const p = clipToShape({ x: 0, y: 50 }, { x: 150, y: 50 }, box, 0, false)!;
    expect(p.x).toBeCloseTo(100);
    expect(p.y).toBeCloseTo(50);
    const e = clipToShape({ x: 150, y: -100 }, { x: 150, y: 50 }, box, 0, true)!;
    expect(e.y).toBeCloseTo(0);
  });

  it("упрощение и передискретизация сохраняют концы", () => {
    const line = Array.from({ length: 50 }, (_, i) => ({ x: i, y: i % 2 ? 0.1 : 0 }));
    const s = simplify(line, 1);
    expect(s[0]).toEqual(line[0]);
    expect(s[s.length - 1]).toEqual(line[49]);
    expect(s.length).toBeLessThan(5);
    const r = resample(line, 10);
    expect(r).toHaveLength(10);
    expect(r[9]!.x).toBeCloseTo(49);
  });
});
