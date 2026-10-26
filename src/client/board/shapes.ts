/* Чистая геометрия отрисовки: контуры фигур, линии, наконечники, штрихи.
   Одни и те же функции рисуют DOM-узлы, предпросмотр и холст дальнего плана,
   поэтому фигура выглядит одинаково при любом масштабе. */
import { getStroke } from "perfect-freehand";
import { r2, type Pt } from "./geometry.ts";
import { INK_PX, STROKE_PX, type ShapeKind, type StrokeSize } from "./model.ts";

/** Вершины многоугольных фигур в долях (0..1) рамки, с учётом пропорций. */
function polyPoints(kind: ShapeKind, w: number, h: number): [number, number][] | null {
  const m = Math.min(w, h);
  switch (kind) {
    case "diamond":
      return [[w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2]];
    case "triangle":
      return [[w / 2, 0], [w, h], [0, h]];
    case "hexagon": {
      const k = Math.min(w * 0.25, h * 0.58);
      return [[k, 0], [w - k, 0], [w, h / 2], [w - k, h], [k, h], [0, h / 2]];
    }
    case "octagon": {
      const k = m * 0.29;
      return [[k, 0], [w - k, 0], [w, k], [w, h - k], [w - k, h], [k, h], [0, h - k], [0, k]];
    }
    case "pentagon":
      return [[w / 2, 0], [w, h * 0.38], [w * 0.81, h], [w * 0.19, h], [0, h * 0.38]];
    case "star": {
      const out: [number, number][] = [];
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const k = i % 2 ? 0.42 : 1;
        out.push([w / 2 + Math.cos(a) * (w / 2) * k, h / 2 + Math.sin(a) * (h / 2) * k + h * 0.04]);
      }
      return out;
    }
    case "parallelogram": {
      const k = Math.min(w * 0.2, h * 0.6);
      return [[k, 0], [w, 0], [w - k, h], [0, h]];
    }
    case "trapezoid": {
      const k = Math.min(w * 0.18, h * 0.8);
      return [[k, 0], [w - k, 0], [w, h], [0, h]];
    }
    case "arrow": {
      const k = Math.min(w * 0.42, h * 0.9);
      return [[0, h * 0.27], [w - k, h * 0.27], [w - k, 0], [w, h / 2], [w - k, h], [w - k, h * 0.73], [0, h * 0.73]];
    }
    case "chevron": {
      const k = Math.min(w * 0.3, h * 0.5);
      return [[0, 0], [w - k, 0], [w, h / 2], [w - k, h], [0, h], [k, h / 2]];
    }
    case "cross": {
      const tw = w * 0.34;
      const th = h * 0.34;
      const x0 = (w - tw) / 2;
      const x1 = (w + tw) / 2;
      const y0 = (h - th) / 2;
      const y1 = (h + th) / 2;
      return [[x0, 0], [x1, 0], [x1, y0], [w, y0], [w, y1], [x1, y1], [x1, h], [x0, h], [x0, y1], [0, y1], [0, y0], [x0, y0]];
    }
    default:
      return null;
  }
}

/** Контур фигуры в прямоугольнике (x, y, w, h). */
export function shapeD(kind: ShapeKind, x: number, y: number, w: number, h: number, pts?: number[][]): string {
  w = Math.max(1, w);
  h = Math.max(1, h);
  const vs = polyPoints(kind, w, h);
  if (vs) return poly(vs.map(([px, py]) => [x + px, y + py]));
  switch (kind) {
    case "ellipse": {
      const rx = w / 2;
      const ry = h / 2;
      const cx = x + rx;
      const cy = y + ry;
      return `M${r2(cx - rx)},${r2(cy)}a${r2(rx)},${r2(ry)} 0 1 0 ${r2(w)},0a${r2(rx)},${r2(ry)} 0 1 0 ${r2(-w)},0Z`;
    }
    case "sharp":
      return rectD(x, y, w, h, 0);
    case "pill":
      return rectD(x, y, w, h, r2(Math.min(w, h) / 2));
    case "cylinder": {
      const ry = r2(Math.min(h * 0.14, w * 0.25));
      const rx = r2(w / 2);
      return (
        `M${r2(x)},${r2(y + ry)}A${rx},${ry} 0 0 1 ${r2(x + w)},${r2(y + ry)}V${r2(y + h - ry)}` +
        `A${rx},${ry} 0 0 1 ${r2(x)},${r2(y + h - ry)}Z` +
        `M${r2(x)},${r2(y + ry)}A${rx},${ry} 0 0 0 ${r2(x + w)},${r2(y + ry)}`
      );
    }
    case "document": {
      const a = h * 0.09;
      return `M${r2(x)},${r2(y)}H${r2(x + w)}V${r2(y + h - a)}Q${r2(x + w * 0.75)},${r2(y + h - a * 3)} ${r2(x + w * 0.5)},${r2(y + h - a)}T${r2(x)},${r2(y + h - a)}Z`;
    }
    case "process": {
      const k = Math.min(w * 0.1, 18);
      return rectD(x, y, w, h, 0) + `M${r2(x + k)},${r2(y)}V${r2(y + h)}M${r2(x + w - k)},${r2(y)}V${r2(y + h)}`;
    }
    case "delay": {
      const rx = r2(Math.min(w / 2, h / 2));
      return `M${r2(x)},${r2(y)}H${r2(x + w - rx)}A${rx},${r2(h / 2)} 0 0 1 ${r2(x + w - rx)},${r2(y + h)}H${r2(x)}Z`;
    }
    case "cloud": {
      const n = 9;
      const cx = x + w / 2;
      const cy = y + h / 2;
      const ps: Pt[] = [];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 - Math.PI / 2;
        ps.push({ x: cx + Math.cos(a) * w * 0.4, y: cy + Math.sin(a) * h * 0.36 });
      }
      let d = `M${r2(ps[0]!.x)},${r2(ps[0]!.y)}`;
      for (let i = 0; i < n; i++) {
        const q = ps[(i + 1) % n]!;
        const pr = ps[i]!;
        const rr = r2(Math.hypot(q.x - pr.x, q.y - pr.y) * 0.62);
        d += `A${rr},${rr} 0 0 1 ${r2(q.x)},${r2(q.y)}`;
      }
      return d + "Z";
    }
    case "bubble": {
      const bh = h * 0.8;
      const r = Math.min(14, w * 0.12, bh * 0.2);
      return (
        `M${r2(x + r)},${r2(y)}H${r2(x + w - r)}A${r2(r)},${r2(r)} 0 0 1 ${r2(x + w)},${r2(y + r)}V${r2(y + bh - r)}` +
        `A${r2(r)},${r2(r)} 0 0 1 ${r2(x + w - r)},${r2(y + bh)}H${r2(x + w * 0.4)}L${r2(x + w * 0.18)},${r2(y + h)}L${r2(x + w * 0.24)},${r2(y + bh)}` +
        `H${r2(x + r)}A${r2(r)},${r2(r)} 0 0 1 ${r2(x)},${r2(y + bh - r)}V${r2(y + r)}A${r2(r)},${r2(r)} 0 0 1 ${r2(x + r)},${r2(y)}Z`
      );
    }
    case "heart":
      return (
        `M${r2(x + w / 2)},${r2(y + h * 0.96)}` +
        `C${r2(x + w * 0.08)},${r2(y + h * 0.66)} ${r2(x - w * 0.02)},${r2(y + h * 0.26)} ${r2(x + w * 0.24)},${r2(y + h * 0.08)}` +
        `C${r2(x + w * 0.38)},${r2(y - h * 0.01)} ${r2(x + w * 0.5)},${r2(y + h * 0.1)} ${r2(x + w * 0.5)},${r2(y + h * 0.22)}` +
        `C${r2(x + w * 0.5)},${r2(y + h * 0.1)} ${r2(x + w * 0.62)},${r2(y - h * 0.01)} ${r2(x + w * 0.76)},${r2(y + h * 0.08)}` +
        `C${r2(x + w * 1.02)},${r2(y + h * 0.26)} ${r2(x + w * 0.92)},${r2(y + h * 0.66)} ${r2(x + w / 2)},${r2(y + h * 0.96)}Z`
      );
    case "poly":
      if (pts && pts.length >= 3) return poly(pts.map(([u, v]) => [x + u! * w, y + v! * h]));
      return rectD(x, y, w, h, 0);
    default:
      return rectD(x, y, w, h, Math.min(12, w * 0.12, h * 0.12));
  }
}

/** Контур фигуры многоугольником в локальных координатах (0..w, 0..h) — для попаданий и привязок. */
/** Фигуры, которые в значке рисуются вытянутыми по ширине. */
const WIDE = new Set<ShapeKind>(["rect", "sharp", "pill", "parallelogram", "trapezoid", "document", "process", "delay", "arrow", "chevron", "bubble", "cloud"]);

/** Значок фигуры (SVG-разметка) — тем же контуром, что и на доске. */
export function shapeGlyph(kind: ShapeKind, size = 18, sw = 1.7): string {
  const wide = WIDE.has(kind);
  const pad = sw / 2 + 1;
  const w = 24 - pad * 2;
  const h = wide ? w * 0.72 : w;
  const d = shapeD(kind, pad, (24 - h) / 2, w, h);
  return (
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linejoin="round" aria-hidden="true">` +
    `<path d="${d}"/></svg>`
  );
}

export function shapeOutline(kind: ShapeKind | undefined, w: number, h: number, pts?: number[][]): Pt[] {
  const k = kind ?? "rect";
  const vs = polyPoints(k, w, h);
  if (vs) return vs.map(([x, y]) => ({ x, y }));
  const ellipse = (cx: number, cy: number, rx: number, ry: number, n = 40, a0 = 0, a1 = Math.PI * 2) => {
    const out: Pt[] = [];
    for (let i = 0; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      out.push({ x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry });
    }
    return out;
  };
  switch (k) {
    case "ellipse":
    case "cloud":
      return ellipse(w / 2, h / 2, w / 2, h / 2).slice(0, -1);
    case "pill": {
      const r = Math.min(w, h) / 2;
      if (w >= h) return [...ellipse(w - r, h / 2, r, r, 12, -Math.PI / 2, Math.PI / 2), ...ellipse(r, h / 2, r, r, 12, Math.PI / 2, Math.PI * 1.5)];
      return [...ellipse(w / 2, h - r, r, r, 12, 0, Math.PI), ...ellipse(w / 2, r, r, r, 12, Math.PI, Math.PI * 2)];
    }
    case "delay": {
      const rx = Math.min(w / 2, h / 2);
      return [{ x: 0, y: 0 }, ...ellipse(w - rx, h / 2, rx, h / 2, 16, -Math.PI / 2, Math.PI / 2), { x: 0, y: h }];
    }
    case "heart":
      return [
        { x: w / 2, y: h * 0.96 },
        { x: w * 0.18, y: h * 0.62 },
        { x: w * 0.03, y: h * 0.32 },
        { x: w * 0.12, y: h * 0.1 },
        { x: w * 0.3, y: h * 0.03 },
        { x: w * 0.45, y: h * 0.1 },
        { x: w * 0.5, y: h * 0.2 },
        { x: w * 0.55, y: h * 0.1 },
        { x: w * 0.7, y: h * 0.03 },
        { x: w * 0.88, y: h * 0.1 },
        { x: w * 0.97, y: h * 0.32 },
        { x: w * 0.82, y: h * 0.62 },
      ];
    case "poly":
      if (pts && pts.length >= 3) return pts.map(([u, v]) => ({ x: u! * w, y: v! * h }));
      return rectOutline(w, h);
    default:
      return rectOutline(w, h);
  }
}

const rectOutline = (w: number, h: number): Pt[] => [
  { x: 0, y: 0 },
  { x: w, y: 0 },
  { x: w, y: h },
  { x: 0, y: h },
];

/** Где внутри фигуры помещается подпись: отступы в долях ширины/высоты (сверху, справа, снизу, слева). */
export function labelInset(kind: ShapeKind | undefined): [number, number, number, number] {
  switch (kind) {
    case "diamond":
      return [0.22, 0.2, 0.22, 0.2];
    case "triangle":
      return [0.42, 0.2, 0.05, 0.2];
    case "hexagon":
      return [0.06, 0.16, 0.06, 0.16];
    case "octagon":
    case "pentagon":
      return [0.12, 0.1, 0.08, 0.1];
    case "star":
      return [0.3, 0.28, 0.22, 0.28];
    case "parallelogram":
      return [0, 0.16, 0, 0.16];
    case "trapezoid":
      return [0, 0.14, 0, 0.14];
    case "cylinder":
      return [0.2, 0, 0.08, 0];
    case "document":
      return [0, 0, 0.14, 0];
    case "process":
      return [0, 0.1, 0, 0.1];
    case "delay":
      return [0, 0.18, 0, 0];
    case "cloud":
      return [0.18, 0.16, 0.16, 0.16];
    case "bubble":
      return [0, 0, 0.2, 0];
    case "arrow":
      return [0.24, 0.3, 0.24, 0];
    case "chevron":
      return [0, 0.24, 0, 0.24];
    case "cross":
      return [0.3, 0.3, 0.3, 0.3];
    case "heart":
      return [0.18, 0.18, 0.3, 0.18];
    case "ellipse":
      return [0.12, 0.12, 0.12, 0.12];
    case "pill":
      return [0, 0.08, 0, 0.08];
    default:
      return [0, 0, 0, 0];
  }
}

function poly(pts: [number, number][] | number[][]): string {
  return pts.map(([px, py], i) => `${i ? "L" : "M"}${r2(px!)},${r2(py!)}`).join("") + "Z";
}

export function rectD(x: number, y: number, w: number, h: number, r: number): string {
  if (r <= 0) return `M${r2(x)},${r2(y)}h${r2(w)}v${r2(h)}h${r2(-w)}Z`;
  return (
    `M${r2(x + r)},${r2(y)}H${r2(x + w - r)}A${r},${r} 0 0 1 ${r2(x + w)},${r2(y + r)}` +
    `V${r2(y + h - r)}A${r},${r} 0 0 1 ${r2(x + w - r)},${r2(y + h)}H${r2(x + r)}` +
    `A${r},${r} 0 0 1 ${r2(x)},${r2(y + h - r)}V${r2(y + r)}A${r},${r} 0 0 1 ${r2(x + r)},${r2(y)}Z`
  );
}

/* ------------------------------- линии ------------------------------- */

export const strokePx = (s: StrokeSize | undefined) => STROKE_PX[s ?? "m"] ?? 3.5;

export const dashArray = (dash: string | undefined, sw: number) =>
  dash === "dash" ? `${r2(sw * 3)} ${r2(sw * 2.4)}` : dash === "dot" ? `0.01 ${r2(sw * 2.2)}` : undefined;

/** Длина наконечника для толщины линии. */
export const headSize = (sw: number) => 9 + sw * 2.4;

/* ------------------------------- штрихи ------------------------------- */

export const inkPx = (s: StrokeSize | undefined) => INK_PX[s ?? "m"] ?? 6;

/** Контур штриха пера (perfect-freehand) как SVG-путь. */
export function inkD(pts: ArrayLike<number[]> | number[][], size: number, sx = 1, sy = 1, last = true): string {
  const n = pts.length;
  if (!n) return "";
  const input: number[][] = new Array(n);
  let pressure = false;
  for (let i = 0; i < n; i++) {
    const p = pts[i]!;
    const pr = p[2] ?? 0.5;
    if (pr !== 0.5 && pr > 0) pressure = true;
    input[i] = [p[0]! * sx, p[1]! * sy, pr || 0.5];
  }
  const outline = getStroke(input, {
    size,
    thinning: pressure ? 0.6 : 0.5,
    smoothing: 0.6,
    streamline: 0.45,
    simulatePressure: !pressure,
    last,
    start: { taper: 0, cap: true },
    end: { taper: 0, cap: true },
  });
  return outlineD(outline);
}

function outlineD(o: number[][]): string {
  const n = o.length;
  if (n < 2) return "";
  let d = `M${r2(o[0]![0]!)},${r2(o[0]![1]!)}Q`;
  for (let i = 0; i < n; i++) {
    const a = o[i]!;
    const b = o[(i + 1) % n]!;
    d += `${r2(a[0]!)},${r2(a[1]!)} ${r2((a[0]! + b[0]!) / 2)},${r2((a[1]! + b[1]!) / 2)} `;
  }
  return d + "Z";
}

/** Плоский массив [x, y, p, x, y, p…] → точки. */
export function triples(flat: ArrayLike<number>): number[][] {
  const out: number[][] = [];
  for (let i = 0; i + 2 < flat.length; i += 3) out.push([flat[i]!, flat[i + 1]!, flat[i + 2]!]);
  return out;
}
