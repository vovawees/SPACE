/* Шестигранный кубик, нарисованный в SVG: скруглённый куб в ортогональной
   проекции со светом. Видимые грани — квадраты с точками, растянутые
   аффинной матрицей; скруглённые рёбра и углы — выпуклая оболочка
   внутреннего куба, обведённая толстой линией со скруглёнными стыками
   (ровно так и выглядит силуэт скруглённого куба). Никакого CSS 3D — значит,
   ни щелей в углах, ни «сплющивания» от фильтров. */

export type V3 = [number, number, number];
/** Матрица 3×3 по строкам. */
export type M3 = [number, number, number, number, number, number, number, number, number];

export const I3: M3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

export function mul(a: M3, b: M3): M3 {
  const r = [0, 0, 0, 0, 0, 0, 0, 0, 0] as M3;
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) r[i * 3 + j] = a[i * 3]! * b[j]! + a[i * 3 + 1]! * b[3 + j]! + a[i * 3 + 2]! * b[6 + j]!;
  return r;
}
export const apply = (m: M3, v: V3): V3 => [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export function norm(v: V3): V3 {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

/** Поворот вокруг оси (Родриг). Ось — единичная. */
export function axisAngle(a: V3, t: number): M3 {
  const [x, y, z] = a;
  const c = Math.cos(t);
  const s = Math.sin(t);
  const k = 1 - c;
  return [c + x * x * k, x * y * k - z * s, x * z * k + y * s, y * x * k + z * s, c + y * y * k, y * z * k - x * s, z * x * k - y * s, z * y * k + x * s, c + z * z * k];
}
export const rotX = (t: number) => axisAngle([1, 0, 0], t);
export const rotY = (t: number) => axisAngle([0, 1, 0], t);
export const rotZ = (t: number) => axisAngle([0, 0, 1], t);

/* Координаты: x — вправо, y — вверх, z — к зрителю (для лежащего на столе
   кубика — вверх от стола). У каждой грани: нормаль n, а в её плоскости
   u — «вправо» и v — «вниз» для читающего грань (u × v = −n). */
export const FACES: Record<number, { n: V3; u: V3; v: V3 }> = {
  1: { n: [0, 0, 1], u: [1, 0, 0], v: [0, -1, 0] },
  6: { n: [0, 0, -1], u: [-1, 0, 0], v: [0, -1, 0] },
  2: { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, 1] },
  5: { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, -1] },
  3: { n: [1, 0, 0], u: [0, 0, -1], v: [0, -1, 0] },
  4: { n: [-1, 0, 0], u: [0, 0, 1], v: [0, -1, 0] },
};

/** Поворот, кладущий грань f к зрителю (и «верхом» вверх). */
export function basis(f: number): M3 {
  const { n, u, v } = FACES[f] ?? FACES[1]!;
  return [u[0], u[1], u[2], -v[0], -v[1], -v[2], n[0], n[1], n[2]];
}

/** Камера чуть сверху и справа: видны верх и правый бок. */
export const CAM: M3 = mul(rotX((24 * Math.PI) / 180), rotY((-17 * Math.PI) / 180));
/** Свет — слева сверху, немного спереди. */
const LIGHT = norm([-0.45, 0.7, 0.62]);

/** Поза лежащего кубика: грань f вверх, повёрнут на столе на tilt (рад). */
export const restPose = (f: number, tilt: number): M3 => mul(rotZ(tilt), basis(f));
/** Как его видит камера. */
export const view = (pose: M3): M3 => mul(CAM, pose);

/** Какая грань смотрит на камеру сильнее всех. */
export function topFace(m: M3): number {
  let best = 1;
  let bz = -Infinity;
  for (const f of [1, 2, 3, 4, 5, 6]) {
    const z = apply(m, FACES[f]!.n)[2];
    if (z > bz) {
      bz = z;
      best = f;
    }
  }
  return best;
}

export type CubeFace = { f: number; m: string; shade: number };

/** Выпуклая оболочка точек (монотонная цепь). */
function hull(pts: [number, number][]): [number, number][] {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: [number, number], a: [number, number], b: [number, number]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo: [number, number][] = [];
  for (const q of p) {
    while (lo.length >= 2 && cross(lo[lo.length - 2]!, lo[lo.length - 1]!, q) <= 0) lo.pop();
    lo.push(q);
  }
  const up: [number, number][] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i]!;
    while (up.length >= 2 && cross(up[up.length - 2]!, up[up.length - 1]!, q) <= 0) up.pop();
    up.push(q);
  }
  return [...lo.slice(0, -1), ...up.slice(0, -1)];
}

const f2 = (x: number) => Math.round(x * 100) / 100;

/**
 * Геометрия кадра. m — поворот (уже с камерой), R — половина ребра в единицах
 * SVG, rho — доля скругления. Грань рисуется в своих координатах ±100
 * (плоская часть — ±100·(1−rho)), матрица переводит их на экран.
 */
export function cubeFrame(m: M3, R: number, rho: number): { hull: string; faces: CubeFace[] } {
  const k = 1 - rho;
  const pts: [number, number][] = [];
  for (const x of [-k, k])
    for (const y of [-k, k])
      for (const z of [-k, k]) {
        const p = apply(m, [x, y, z]);
        pts.push([p[0] * R, -p[1] * R]);
      }
  const faces: CubeFace[] = [];
  for (const f of [1, 2, 3, 4, 5, 6]) {
    const F = FACES[f]!;
    const n = apply(m, F.n);
    if (n[2] <= 0.02) continue;
    const u = apply(m, F.u);
    const v = apply(m, F.v);
    const s = R / 100;
    faces.push({
      f,
      m: `matrix(${f2(u[0] * s)} ${f2(-u[1] * s)} ${f2(v[0] * s)} ${f2(-v[1] * s)} ${f2(n[0] * R)} ${f2(-n[1] * R)})`,
      shade: Math.max(0, dot(n, LIGHT)),
    });
  }
  return {
    hull: hull(pts)
      .map(([x, y]) => `${f2(x)},${f2(y)}`)
      .join(" "),
    faces,
  };
}

/** Точки грани в сетке 3×3 → координаты грани (±100). */
export const pipXY = (j: number, gap = 46): [number, number] => [((j % 3) - 1) * gap, (Math.floor(j / 3) - 1) * gap];
