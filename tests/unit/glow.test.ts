import { describe, expect, it } from "vitest";
import { GLOW_HALO, GLOW_STEP, GLOW_TILE, glowBlock, runGlowJobs } from "../../src/client/board/glow.ts";

const TINT: [number, number, number] = [255, 250, 240];
const CAP = 0.07;
const flat = (...rs: [number, number, number, number][]) => Float64Array.from(rs.flat());

/** Кусок [x0, x0 + w) × [y0, y0 + h) из блока ширины bw. */
function crop(px: Uint8ClampedArray, bw: number, x0: number, y0: number, w: number, h: number) {
  const out = new Uint8ClampedArray(w * h * 4);
  for (let j = 0; j < h; j++) out.set(px.subarray(((y0 + j) * bw + x0) * 4, ((y0 + j) * bw + x0 + w) * 4), j * w * 4);
  return out;
}

describe("glow", () => {
  const pair = flat([100, 100, 200, 120], [330, 110, 180, 140]);

  it("одна карточка не светится, две рядом — светятся", () => {
    expect(glowBlock(flat([100, 100, 200, 120]), 0, 0, 80, 60, TINT, CAP)).toBeNull();
    const px = glowBlock(pair, 0, 0, 80, 60, TINT, CAP);
    expect(px).not.toBeNull();
    // ярче всего — между карточками
    const at = (x: number, y: number) => px![(Math.round(y / GLOW_STEP) * 80 + Math.round(x / GLOW_STEP)) * 4 + 3]!;
    expect(at(315, 170)).toBeGreaterThan(0);
    expect(at(315, 170)).toBeLessThanOrEqual(Math.ceil(CAP * 255));
    expect(at(315, 170)).toBeGreaterThan(at(315, 170 + 200));
  });

  it("далеко разнесённые карточки не светятся", () => {
    expect(glowBlock(flat([0, 0, 100, 100], [5000, 0, 100, 100]), 0, 0, 600, 20, TINT, CAP)).toBeNull();
  });

  it("часть сетки — ровно тот же кусок, что и в целом блоке", () => {
    const full = glowBlock(pair, 0, 0, 80, 60, TINT, CAP)!;
    const part = glowBlock(pair, 23, 9, 17, 21, TINT, CAP)!;
    expect(part).not.toBeNull();
    expect(Array.from(part)).toEqual(Array.from(crop(full, 80, 23, 9, 17, 21)));
  });

  it("соседние плитки стыкуются без шва", () => {
    // группа прямо на границе двух плиток
    const edge = GLOW_TILE * GLOW_STEP;
    const rects = flat([edge - 150, 300, 120, 100], [edge + 20, 320, 140, 90], [edge - 60, 450, 100, 80]);
    const sy = 0;
    const h = 120;
    const span = glowBlock(rects, GLOW_TILE - 60, sy, 120, h, TINT, CAP)!;
    const left = glowBlock(rects, GLOW_TILE - 60, sy, 60, h, TINT, CAP)!;
    const right = glowBlock(rects, GLOW_TILE, sy, 60, h, TINT, CAP)!;
    expect(span && left && right).toBeTruthy();
    expect(Array.from(left)).toEqual(Array.from(crop(span, 120, 0, 0, 60, h)));
    expect(Array.from(right)).toEqual(Array.from(crop(span, 120, 60, 0, 60, h)));
  });

  it("карточки дальше ореола на кусок не влияют", () => {
    const far = flat([100, 100, 200, 120], [330, 110, 180, 140], [100 + 40 * GLOW_STEP + GLOW_HALO + 400, 100, 50, 50]);
    expect(Array.from(glowBlock(far, 0, 0, 40, 40, TINT, CAP)!)).toEqual(Array.from(glowBlock(pair, 0, 0, 40, 40, TINT, CAP)!));
  });

  it("задания потоку: буфер нужного размера или null", () => {
    const res = runGlowJobs(
      [
        { key: "a", sx: 0, sy: 0, w: 50, h: 40, full: true, rects: pair },
        { key: "b", sx: 5000, sy: 5000, w: 10, h: 10, full: false, rects: new Float64Array(0) },
      ],
      TINT,
      CAP,
    );
    expect(res[0]!.buf!.byteLength).toBe(50 * 40 * 4);
    expect(res[1]!.buf).toBeNull();
    expect(res.map((r) => [r.key, r.full])).toEqual([
      ["a", true],
      ["b", false],
    ]);
  });
});
