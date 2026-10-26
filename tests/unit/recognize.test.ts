import { describe, expect, it } from "vitest";
import { recognize } from "../../src/client/board/recognize.ts";

const ellipse = (cx: number, cy: number, rx: number, ry: number, n = 60, wobble = 0) =>
  Array.from({ length: n + 1 }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    const k = 1 + wobble * Math.sin(i * 1.7);
    return { x: cx + Math.cos(a) * rx * k, y: cy + Math.sin(a) * ry * k };
  });

function polyline(pts: [number, number][], step = 4) {
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i]!;
    const [x1, y1] = pts[i + 1]!;
    const n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0) / step));
    for (let k = 0; k < n; k++) out.push({ x: x0 + ((x1 - x0) * k) / n, y: y0 + ((y1 - y0) * k) / n });
  }
  const [lx, ly] = pts[pts.length - 1]!;
  out.push({ x: lx, y: ly });
  return out;
}

describe("умное рисование", () => {
  it("круг от руки → эллипс", () => {
    const r = recognize(ellipse(200, 200, 90, 60, 60, 0.03), 1);
    expect(r?.kind).toBe("shape");
    expect(r && r.kind === "shape" && r.shape).toBe("ellipse");
  });

  it("квадрат → прямоугольник", () => {
    const r = recognize(polyline([[0, 0], [200, 2], [201, 150], [-1, 149], [0, 4]]), 1);
    expect(r && r.kind === "shape" && r.shape).toBe("rect");
  });

  it("треугольник", () => {
    const r = recognize(polyline([[100, 0], [200, 170], [0, 170], [98, 4]]), 1);
    expect(r && r.kind === "shape" && r.shape).toBe("triangle");
  });

  it("прямой штрих → линия", () => {
    const r = recognize(polyline([[0, 0], [300, 12]]), 1);
    expect(r?.kind).toBe("line");
  });

  it("каракули остаются штрихом", () => {
    const pts = Array.from({ length: 80 }, (_, i) => ({ x: i * 4, y: Math.sin(i * 0.9) * 40 + (i % 3) * 9 }));
    expect(recognize(pts, 1)).toBeNull();
  });

  it("слишком короткий штрих не распознаётся", () => {
    expect(recognize(polyline([[0, 0], [5, 3]], 1), 1)).toBeNull();
  });
});
