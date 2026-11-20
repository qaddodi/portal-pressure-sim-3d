// Several tubes in one geometry (a trunk with its strands, a fan of tributaries): one mesh, so one draw call. A course's vertex count is fixed by its `tubular`
// (chosen once from the course's resting length with room to spare), so a shape that changes (a collateral coiling) rewrites the positions in place.
import { BufferGeometry, CatmullRomCurve3, Float32BufferAttribute, SphereGeometry, TubeGeometry, Vector3 } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Vec3 } from '../anatomy/vessels.ts';
import { beadRadius } from './varix-bead.copied.js';

export interface Course {
  pts: Vec3[]; radius: number;
  /** the radius at the start and at the end as a share of `radius`: the tube eases to it over its first and last 30 % as the 2D tubes do (stage-tubes.js tubeRadius), so
   *  two vessels that run on into one another meet at one width */
  taper?: readonly [number, number];
  /** the fillet collars at the two ends where this tube ends on a trunk (network.ts Flare): extra radius at the wall that melts into the tube over `span` */
  /** a varix's beading (varix-bead.js): the radius swells and narrows along it by `b`, phase `ph`, from `u0`, one bead every `lambda` of the course's `len` (2D units) */
  bead?: { b: number; ph: number; u0: number; lambda: number; len: number };
  /** the ends that carry on into another tube, which need no cap (network.ts `joined`) */
  capless?: readonly [boolean, boolean];
  flare?: readonly [{ add: number; wall: number; span: number } | null, { add: number; wall: number; span: number } | null];
  /** Atlas art only (atlas-art/courses.ts): the radius along the course as a share of `radius`, flat pairs [arc-length share, share, ...], read by linear interpolation. Absent: the course is not changed by it. */
  profile?: readonly number[];
}
const smooth = (u: number) => u * u * (3 - 2 * u);
/** The atlas course's radius share at arc-length share `u` (flat [u0, f0, u1, f1, ...], u rising). */
export function profileAt(p: readonly number[], u: number): number {
  const n = p.length / 2;
  if (u <= p[0]!) return p[1]!;
  for (let i = 1; i < n; i++) {
    const u1 = p[2 * i]!;
    if (u <= u1) { const u0 = p[2 * i - 2]!, t = u1 > u0 ? (u - u0) / (u1 - u0) : 1; return p[2 * i - 1]! + (p[2 * i + 1]! - p[2 * i - 1]!) * t; }
  }
  return p[2 * n - 1]!;
}
const factorAt = (t: readonly [number, number] | undefined, u: number): number => (!t ? 1 : u < 0.3 ? t[0] + (1 - t[0]) * smooth(u / 0.3) : u > 0.7 ? 1 + (t[1] - 1) * smooth((u - 0.7) / 0.3) : 1);

/** Tube segments for a course of `len` scene units, with `room` to grow into when it coils. */
export const tubularFor = (len: number, room = 1.6): number => Math.max(16, Math.round(len * 30 * room));

/** The collar's extra radius at distance `d` from an end: all of `add` up to the host's wall, then melting away over `span` (a quadratic, tangent to the tube where it ends). */
export const flareAdd = (f: { add: number; wall: number; span: number } | null | undefined, d: number): number => {
  if (!f) return 0;
  const u = Math.min(1, Math.max(0, (d - f.wall) / f.span));
  return f.add * (1 - u) * (1 - u);
};

const RADIAL = 14;

/** The tubes, each with round caps, in one geometry: uv.x runs 0 to 1 along each, uv.y round it; `tang` is the unit tangent; `rk` the tube's radius against `radius0`. */
/** Where one course sits in the merged geometry: its tube's vertices, then its two caps' (the Circuit's morph reads this layout). */
export interface TubeRun { curve: CatmullRomCurve3; tubular: number; radial: number; tubeStart: number; tubeCount: number; capStart: number; capCount: number }

/** The width a course of no radius is built at: finite, and never drawn (rk 0). */
const HAIR = 1e-6;

export function buildTubes(courses: readonly Course[], tubular: readonly number[], radius0: number): { geometry: BufferGeometry; length: number; runs: TubeRun[] } {
  const parts: BufferGeometry[] = [];
  const runs: TubeRun[] = [];
  let length = 0, at = 0;
  courses.forEach((c, i) => {
    const curve = new CatmullRomCurve3(c.pts.map((p) => new Vector3(p[0], p[1], p[2])));
    if (i === 0) length = curve.getLength();
    const seg = tubular[i]!;
    // (A course of no radius, a strand a band has closed or a channel not yet grown, is built at a hair's width and marked rk 0, which the vertex shader keeps off the screen. Built at 0 its collar
    // share `flare / radius` and the Circuit's `offset / radius` are NaN, and a NaN position on a real GPU draws as a black blob or a long black spindle across its neighbours: Mohammad's iPhone, 19 Nov 2026.)
    const open = c.radius > 0, R0 = open ? c.radius : HAIR;
    const tube = new TubeGeometry(curve, seg, R0, RADIAL, false);
    const rks: number[] = [];
    const clen = curve.getLength();
    const P = new Vector3(), pos = tube.attributes.position as Float32BufferAttribute;
    for (let k = 0; k <= seg; k++) {
      const u = k / seg;
      const f = open ? (factorAt(c.taper, u) + (flareAdd(c.flare?.[0], u * clen) + flareAdd(c.flare?.[1], (1 - u) * clen)) / c.radius) * (c.bead && c.bead.b > 0 ? (beadRadius(1, c.bead.b, u, c.bead.len, c.bead.ph, c.bead.u0, c.bead.lambda) as number) : 1) * (c.profile ? profileAt(c.profile, u) : 1) : 1;
      curve.getPointAt(k / seg, P);
      for (let j = 0; j <= RADIAL; j++) {
        const at = k * (RADIAL + 1) + j;
        if (f !== 1) pos.setXYZ(at, P.x + (pos.getX(at) - P.x) * f, P.y + (pos.getY(at) - P.y) * f, P.z + (pos.getZ(at) - P.z) * f);
        rks.push(open ? (c.radius * f) / radius0 : 0);
      }
    }
    tube.setAttribute('rk', new Float32BufferAttribute(rks, 1));
    const tang: number[] = [];
    for (let k = 0; k <= seg; k++) { const t = curve.getTangentAt(k / seg); for (let j = 0; j <= RADIAL; j++) tang.push(t.x, t.y, t.z); }
    tube.setAttribute('tang', new Float32BufferAttribute(tang, 3));
    const group: BufferGeometry[] = [tube];
    for (const end of [0, 1]) {
      const capR = open && !c.capless?.[end] ? c.radius * factorAt(c.taper, end) * (c.profile ? profileAt(c.profile, end) : 1) + flareAdd(c.flare?.[end], 0) : HAIR;
      const s = new SphereGeometry(capR, 14, 10);
      const pos = curve.getPointAt(end), t = curve.getTangentAt(end);
      s.translate(pos.x, pos.y, pos.z);
      const n = s.attributes.position!.count, uv: number[] = [], tg: number[] = [];
      for (let k = 0; k < n; k++) { uv.push(end, 0.5); tg.push(t.x, t.y, t.z); }
      s.setAttribute('uv', new Float32BufferAttribute(uv, 2));
      s.setAttribute('tang', new Float32BufferAttribute(tg, 3));
      group.push(s);
    }
    for (const e of [1, 2]) group[e]!.setAttribute('rk', new Float32BufferAttribute(new Float32Array(group[e]!.attributes.position!.count).fill(open && !c.capless?.[e - 1] ? (c.radius * factorAt(c.taper, e - 1) * (c.profile ? profileAt(c.profile, e - 1) : 1) + flareAdd(c.flare?.[e - 1], 0)) / radius0 : 0), 1));
    const tubeCount = tube.attributes.position!.count, capCount = group[1]!.attributes.position!.count;
    runs.push({ curve, tubular: seg, radial: RADIAL, tubeStart: at, tubeCount, capStart: at + tubeCount, capCount });
    at += tubeCount + 2 * capCount;
    parts.push(...group);
  });
  return { geometry: parts.length > 1 ? mergeGeometries(parts, false)! : parts[0]!, length, runs };
}
