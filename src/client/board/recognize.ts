/* Умное рисование: из штриха — линия, стрелка, эллипс, прямоугольник,
   ромб, треугольник или многоугольник. Пороги относительные (доли
   размера штриха) плюс минимум в экранных пикселях — чтобы одинаково
   работало при любом масштабе. Неуверенный результат = обычный штрих. */
import { boundsOf, dist, distToSegment, pathLength, type Pt, type Rect, resample, rotate, simplify } from "./geometry.ts";

export type Recognized =
  | { kind: "line"; a: Pt; b: Pt; head0: boolean; head1: boolean }
  | { kind: "shape"; shape: "rect" | "ellipse" | "diamond" | "triangle" | "poly"; rect: Rect; r: number; pts?: number[][] }
  | { kind: "chevron"; apex: Pt; dir: Pt; size: number }
  | null;

const DEG = Math.PI / 180;

function angleAt(a: Pt, b: Pt, c: Pt): number {
  const v1 = { x: a.x - b.x, y: a.y - b.y };
  const v2 = { x: c.x - b.x, y: c.y - b.y };
  const d = Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y) || 1;
  return Math.acos(Math.max(-1, Math.min(1, (v1.x * v2.x + v1.y * v2.y) / d)));
}

function polygonArea(pts: Pt[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    const q = pts[(i + 1) % pts.length]!;
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
}

/** Средняя ошибка точек относительно ломаной (в долях диагонали). */
function polyError(pts: Pt[], poly: Pt[], closed: boolean, diag: number): number {
  let sum = 0;
  for (const p of pts) {
    let best = Infinity;
    const n = closed ? poly.length : poly.length - 1;
    for (let i = 0; i < n; i++) best = Math.min(best, distToSegment(p, poly[i]!, poly[(i + 1) % poly.length]!));
    sum += best;
  }
  return sum / pts.length / (diag || 1);
}

/** Главная ось облака точек (угол). */
function principalAngle(pts: Pt[]): number {
  let mx = 0;
  let my = 0;
  for (const p of pts) {
    mx += p.x;
    my += p.y;
  }
  mx /= pts.length;
  my /= pts.length;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const p of pts) {
    sxx += (p.x - mx) ** 2;
    syy += (p.y - my) ** 2;
    sxy += (p.x - mx) * (p.y - my);
  }
  return 0.5 * Math.atan2(2 * sxy, sxx - syy);
}

/** Убрать почти прямые углы у замкнутой ломаной. */
function corners(poly: Pt[], minTurn: number): Pt[] {
  let pts = poly.slice();
  let changed = true;
  while (changed && pts.length > 3) {
    changed = false;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[(i - 1 + pts.length) % pts.length]!;
      const b = pts[i]!;
      const c = pts[(i + 1) % pts.length]!;
      if (Math.PI - angleAt(a, b, c) < minTurn) {
        pts.splice(i, 1);
        changed = true;
        break;
      }
    }
  }
  return pts;
}

function ellipseError(pts: Pt[], theta: number): { err: number; rect: Rect } {
  const c = boundsOf(pts);
  const cc = { x: c.x + c.w / 2, y: c.y + c.h / 2 };
  const local = pts.map((p) => rotate(p, cc, -theta));
  const b = boundsOf(local);
  const ec = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  const rx = b.w / 2 || 1;
  const ry = b.h / 2 || 1;
  let err = 0;
  for (const p of local) {
    const d = Math.sqrt(((p.x - ec.x) / rx) ** 2 + ((p.y - ec.y) / ry) ** 2);
    err += Math.abs(d - 1);
  }
  const center = rotate(ec, cc, theta);
  return { err: err / local.length, rect: { x: center.x - rx, y: center.y - ry, w: rx * 2, h: ry * 2 } };
}

/**
 * pts — точки штриха в мировых координатах, zoom — текущий масштаб
 * (минимальные пороги задаются в экранных пикселях).
 */
export function recognize(raw: Pt[], zoom: number): Recognized {
  if (raw.length < 3) return null;
  const px = 1 / zoom;
  const len = pathLength(raw);
  if (len < 14 * px) return null;
  const pts = resample(raw, 72);
  const box = boundsOf(pts);
  const diag = Math.hypot(box.w, box.h) || 1;
  const gap = dist(pts[0]!, pts[pts.length - 1]!);
  const closed = gap < Math.max(0.22 * diag, 14 * px) && len > 2.2 * diag;

  if (!closed) return recognizeOpen(pts, diag, px);

  // замкнутый: эллипс или многоугольник
  const ring = pts.slice(0, -1);
  const area = polygonArea(ring);
  if (area < 0.12 * box.w * box.h || Math.min(box.w, box.h) < 8 * px) return null;

  const theta = principalAngle(ring);
  const aligned = Math.abs(theta) < 12 * DEG || Math.abs(Math.abs(theta) - Math.PI / 2) < 12 * DEG;
  const el = ellipseError(ring, aligned ? 0 : theta);
  const el0 = aligned ? el : ellipseError(ring, 0);

  let poly = simplify([...ring, ring[0]!], 0.055 * diag);
  poly = poly.slice(0, -1);
  poly = corners(poly, 28 * DEG);
  const pErr = polyError(ring, poly, true, diag);

  const isEllipse = el.err < 0.13 && (poly.length > 5 || pErr > el.err * 0.32);
  if (isEllipse) {
    const useAligned = aligned || el0.err < el.err * 1.25;
    const fit = useAligned ? el0 : el;
    const r = useAligned ? 0 : theta;
    return { kind: "shape", shape: "ellipse", rect: fit.rect, r };
  }

  if (pErr > 0.06) return null;

  if (poly.length === 4) {
    const angles = poly.map((p, i) => angleAt(poly[(i + 3) % 4]!, p, poly[(i + 1) % 4]!));
    const right = angles.every((a) => Math.abs(a - Math.PI / 2) < 22 * DEG);
    // ромб: вершины у середин сторон описывающего прямоугольника
    const mids = [
      { x: box.x + box.w / 2, y: box.y },
      { x: box.x + box.w, y: box.y + box.h / 2 },
      { x: box.x + box.w / 2, y: box.y + box.h },
      { x: box.x, y: box.y + box.h / 2 },
    ];
    const nearMid = poly.every((p) => mids.some((m) => dist(m, p) < 0.16 * diag));
    if (nearMid && !right) return { kind: "shape", shape: "diamond", rect: box, r: 0 };
    if (right || nearMid === false) {
      // угол наклона — по самой длинной стороне
      let edge = 0;
      let best = 0;
      for (let i = 0; i < 4; i++) {
        const l = dist(poly[i]!, poly[(i + 1) % 4]!);
        if (l > best) {
          best = l;
          edge = i;
        }
      }
      const a = poly[edge]!;
      const b = poly[(edge + 1) % 4]!;
      let ang = Math.atan2(b.y - a.y, b.x - a.x);
      // приводим к (-45°, 45°]
      while (ang > Math.PI / 4) ang -= Math.PI / 2;
      while (ang <= -Math.PI / 4) ang += Math.PI / 2;
      if (right && Math.abs(ang) < 9 * DEG) return { kind: "shape", shape: "rect", rect: boundsOf(poly), r: 0 };
      if (right) {
        const c = { x: box.x + box.w / 2, y: box.y + box.h / 2 };
        const local = boundsOf(poly.map((p) => rotate(p, c, -ang)));
        return { kind: "shape", shape: "rect", rect: local, r: ang };
      }
    }
  }

  if (poly.length === 3) {
    const b = boundsOf(poly);
    // равнобедренный «домиком»: вершина сверху по центру, основание внизу
    const top = poly.reduce((a, p) => (p.y < a.y ? p : a));
    const base = poly.filter((p) => p !== top);
    const upright =
      Math.abs(top.x - (b.x + b.w / 2)) < 0.14 * b.w && base.every((p) => Math.abs(p.y - (b.y + b.h)) < 0.14 * b.h);
    if (upright) return { kind: "shape", shape: "triangle", rect: b, r: 0 };
    return { kind: "shape", shape: "poly", rect: b, r: 0, pts: normalize(poly, b) };
  }

  if (poly.length >= 4 && poly.length <= 8) {
    const b = boundsOf(poly);
    return { kind: "shape", shape: "poly", rect: b, r: 0, pts: normalize(poly, b) };
  }
  return null;
}

function normalize(poly: Pt[], b: Rect): number[][] {
  return poly.map((p) => [round3((p.x - b.x) / (b.w || 1)), round3((p.y - b.y) / (b.h || 1))]);
}

const round3 = (v: number) => Math.round(v * 1000) / 1000;

function recognizeOpen(pts: Pt[], diag: number, px: number): Recognized {
  const a = pts[0]!;
  const b = pts[pts.length - 1]!;
  const chord = dist(a, b);

  // «галочка» ˄ — отдельный наконечник для только что нарисованной линии
  const s = simplify(pts, Math.max(0.08 * diag, 3 * px));
  if (s.length === 3) {
    const ang = angleAt(s[0]!, s[1]!, s[2]!);
    const l1 = dist(s[0]!, s[1]!);
    const l2 = dist(s[2]!, s[1]!);
    if (ang > 25 * DEG && ang < 120 * DEG && Math.min(l1, l2) / Math.max(l1, l2) > 0.45 && chord < 0.95 * (l1 + l2)) {
      const mid = { x: (s[0]!.x + s[2]!.x) / 2, y: (s[0]!.y + s[2]!.y) / 2 };
      const d = dist(s[1]!, mid) || 1;
      const chevron: Recognized = {
        kind: "chevron",
        apex: s[1]!,
        dir: { x: (s[1]!.x - mid.x) / d, y: (s[1]!.y - mid.y) / d },
        size: Math.max(l1, l2),
      };
      // одиночная галочка — возможно наконечник; решит вызывающий
      if (Math.max(l1, l2) < 90 * px) return chevron;
    }
  }

  // стрелка одним штрихом: древко, затем «усы» у конца
  const arrow = detectArrowHead(s, diag);
  if (arrow) return { kind: "line", a: s[0]!, b: arrow, head0: false, head1: true };

  // прямая
  let maxDev = 0;
  for (const p of pts) maxDev = Math.max(maxDev, distToSegment(p, a, b));
  if (chord > 18 * px && maxDev < Math.max(0.06 * chord, 5 * px)) {
    return { kind: "line", a, b, head0: false, head1: false };
  }
  return null;
}

/** Ищет наконечник в конце упрощённого штриха; возвращает острие. */
function detectArrowHead(s: Pt[], diag: number): Pt | null {
  const n = s.length;
  if (n < 3) return null;
  // варианты: [.., tip, b1] , [.., tip, b1, tip', b2]
  for (const tipIndex of [n - 4, n - 2]) {
    if (tipIndex < 1) continue;
    const tip = s[tipIndex]!;
    const shaftStart = s[0]!;
    const shaft = dist(shaftStart, tip);
    if (shaft < 0.5 * diag) continue;
    // древко должно быть почти прямым
    let dev = 0;
    for (let i = 1; i < tipIndex; i++) dev = Math.max(dev, distToSegment(s[i]!, shaftStart, tip));
    if (dev > 0.12 * shaft) continue;
    const dir = { x: (tip.x - shaftStart.x) / shaft, y: (tip.y - shaftStart.y) / shaft };
    const barbs: Pt[] = [];
    if (tipIndex === n - 2) barbs.push(s[n - 1]!);
    else {
      const tip2 = s[n - 2]!;
      if (dist(tip, tip2) > 0.25 * shaft) continue;
      barbs.push(s[n - 3]!, s[n - 1]!);
    }
    const ok = barbs.every((bp) => {
      const l = dist(tip, bp);
      if (l < 0.06 * shaft || l > 0.5 * shaft) return false;
      const v = { x: (bp.x - tip.x) / l, y: (bp.y - tip.y) / l };
      const cos = v.x * dir.x + v.y * dir.y; // назад по древку → cos < 0
      return cos < -0.35 && cos > -0.985;
    });
    if (!ok) continue;
    if (barbs.length === 2) {
      // усы — по разные стороны древка
      const side = (p: Pt) => Math.sign((p.x - tip.x) * dir.y - (p.y - tip.y) * dir.x);
      if (side(barbs[0]!) === side(barbs[1]!)) continue;
    }
    return tip;
  }
  return null;
}
