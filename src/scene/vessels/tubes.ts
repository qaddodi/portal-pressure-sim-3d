// Several tubes in one geometry (a trunk with its strands, a fan of tributaries): one mesh, so one draw call. A course's vertex count is fixed by its `tubular`
// (chosen once from the course's resting length with room to spare), so a shape that changes (a collateral coiling) rewrites the positions in place.
import { BufferGeometry, CatmullRomCurve3, Float32BufferAttribute, SphereGeometry, TubeGeometry, Vector3 } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Vec3 } from '../anatomy/vessels.ts';

export interface Course {
  pts: Vec3[]; radius: number;
  /** the radius at the start and at the end as a share of `radius`: the tube eases to it over its first and last 30 % as the 2D tubes do (stage-tubes.js tubeRadius), so
   *  two vessels that run on into one another meet at one width */
  taper?: readonly [number, number];
}
const smooth = (u: number) => u * u * (3 - 2 * u);
const factorAt = (t: readonly [number, number] | undefined, u: number): number => (!t ? 1 : u < 0.3 ? t[0] + (1 - t[0]) * smooth(u / 0.3) : u > 0.7 ? 1 + (t[1] - 1) * smooth((u - 0.7) / 0.3) : 1);

/** Tube segments for a course of `len` scene units, with `room` to grow into when it coils. */
export const tubularFor = (len: number, room = 1.6): number => Math.max(16, Math.round(len * 30 * room));

const RADIAL = 14;

/** The tubes, each with round caps, in one geometry: uv.x runs 0 to 1 along each, uv.y round it; `tang` is the unit tangent; `rk` the tube's radius against `radius0`. */
/** Where one course sits in the merged geometry: its tube's vertices, then its two caps' (the Circuit's morph reads this layout). */
export interface TubeRun { curve: CatmullRomCurve3; tubular: number; radial: number; tubeStart: number; tubeCount: number; capStart: number; capCount: number }

export function buildTubes(courses: readonly Course[], tubular: readonly number[], radius0: number): { geometry: BufferGeometry; length: number; runs: TubeRun[] } {
  const parts: BufferGeometry[] = [];
  const runs: TubeRun[] = [];
  let length = 0, at = 0;
  courses.forEach((c, i) => {
    const curve = new CatmullRomCurve3(c.pts.map((p) => new Vector3(p[0], p[1], p[2])));
    if (i === 0) length = curve.getLength();
    const seg = tubular[i]!;
    const tube = new TubeGeometry(curve, seg, c.radius, RADIAL, false);
    const rks: number[] = [];
    const P = new Vector3(), pos = tube.attributes.position as Float32BufferAttribute;
    for (let k = 0; k <= seg; k++) {
      const f = factorAt(c.taper, k / seg);
      curve.getPointAt(k / seg, P);
      for (let j = 0; j <= RADIAL; j++) {
        const at = k * (RADIAL + 1) + j;
        if (f !== 1) pos.setXYZ(at, P.x + (pos.getX(at) - P.x) * f, P.y + (pos.getY(at) - P.y) * f, P.z + (pos.getZ(at) - P.z) * f);
        rks.push((c.radius * f) / radius0);
      }
    }
    tube.setAttribute('rk', new Float32BufferAttribute(rks, 1));
    const tang: number[] = [];
    for (let k = 0; k <= seg; k++) { const t = curve.getTangentAt(k / seg); for (let j = 0; j <= RADIAL; j++) tang.push(t.x, t.y, t.z); }
    tube.setAttribute('tang', new Float32BufferAttribute(tang, 3));
    const group: BufferGeometry[] = [tube];
    for (const end of [0, 1]) {
      const capR = c.radius * factorAt(c.taper, end);
      const s = new SphereGeometry(capR, 14, 10);
      const pos = curve.getPointAt(end), t = curve.getTangentAt(end);
      s.translate(pos.x, pos.y, pos.z);
      const n = s.attributes.position!.count, uv: number[] = [], tg: number[] = [];
      for (let k = 0; k < n; k++) { uv.push(end, 0.5); tg.push(t.x, t.y, t.z); }
      s.setAttribute('uv', new Float32BufferAttribute(uv, 2));
      s.setAttribute('tang', new Float32BufferAttribute(tg, 3));
      group.push(s);
    }
    for (const e of [1, 2]) group[e]!.setAttribute('rk', new Float32BufferAttribute(new Float32Array(group[e]!.attributes.position!.count).fill((c.radius * factorAt(c.taper, e - 1)) / radius0), 1));
    const tubeCount = tube.attributes.position!.count, capCount = group[1]!.attributes.position!.count;
    runs.push({ curve, tubular: seg, radial: RADIAL, tubeStart: at, tubeCount, capStart: at + tubeCount, capCount });
    at += tubeCount + 2 * capCount;
    parts.push(...group);
  });
  return { geometry: parts.length > 1 ? mergeGeometries(parts, false)! : parts[0]!, length, runs };
}
