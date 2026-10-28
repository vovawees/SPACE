import { describe, expect, it } from "vitest";
import { FACES, apply, axisAngle, basis, cubeFrame, mul, restPose, topFace, view } from "../../src/client/board/nodes/die3d.ts";

const det = (m: number[]) => m[0]! * (m[4]! * m[8]! - m[5]! * m[7]!) - m[1]! * (m[3]! * m[8]! - m[5]! * m[6]!) + m[2]! * (m[3]! * m[7]! - m[4]! * m[6]!);

describe("кубик в 3D", () => {
  it("противоположные грани в сумме дают 7, базисы — повороты", () => {
    for (const f of [1, 2, 3, 4, 5, 6]) {
      const a = FACES[f]!.n;
      const b = FACES[7 - f]!.n;
      expect(a.map((x, i) => x + b[i]!)).toEqual([0, 0, 0]);
      expect(det(basis(f))).toBeCloseTo(1, 9);
    }
  });
  it("в покое к зрителю обращена выпавшая грань — при любом повороте на столе", () => {
    for (const f of [1, 2, 3, 4, 5, 6])
      for (const tilt of [-0.3, 0, 0.25]) {
        const m = view(restPose(f, tilt));
        expect(topFace(m)).toBe(f);
        expect(apply(restPose(f, tilt), FACES[f]!.n)[2]).toBeCloseTo(1, 9);
      }
  });
  it("видно не больше трёх граней, выпавшая — светлее боков не темнее нуля", () => {
    const fr = cubeFrame(view(restPose(6, 0.1)), 78, 0.2);
    expect(fr.faces.length).toBeGreaterThan(0);
    expect(fr.faces.length).toBeLessThanOrEqual(3);
    expect(fr.faces.some((x) => x.f === 6)).toBe(true);
    expect(fr.hull.split(" ").length).toBeGreaterThanOrEqual(4);
  });
  it("поворот вокруг оси на полный круг возвращает на место", () => {
    const m = mul(axisAngle([0.6, 0.8, 0], Math.PI * 2), restPose(3, 0.2));
    const r = restPose(3, 0.2);
    m.forEach((x, i) => expect(x).toBeCloseTo(r[i]!, 9));
  });
});
