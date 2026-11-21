// Several tubes in one geometry (a trunk with its strands, a fan of tributaries): one mesh, so one draw call. A course's vertex count is fixed by its `tubular`
// (chosen once from the course's resting length with room to spare), so a shape that changes (a collateral coiling) rewrites the positions in place.
import { BufferGeometry, CatmullRomCurve3, Float32BufferAttribute, SphereGeometry, TubeGeometry, Vector3 } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Vec3 } from '../anatomy/vessels.ts';
import { beadRadius } from './varix-bead.copied.js';
import { PIN_RAMP } from './coil.ts';
import { flareScale, sideEndScale } from './fork-joins.copied.js';
import type { ShuntEnd } from './shunt-ends.ts';

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
  /** smooth joins (smooth-joins.ts): the end is buried in a trunk, so its radius (the collar, the cap) stays under `max` for `d0` of course from the end and eases back to its own by `d1` */
  clamp?: readonly [Buried | null, Buried | null];
  /** smooth joins: the share of the course each end's `taper` eases over (0.3 as the 2D tubes do; a vein narrowing into a thin bed funnels over the whole of it, so it never swells into a bulb) */
  taperSpan?: readonly [number, number];
  /** a surgical shunt's sewn ends (shunt-ends.ts): the end inside its host narrows to nothing past the wall (2D sideEndScale) and the heel flares toward it (flareScale) */
  sewn?: readonly [ShuntEnd | null, ShuntEnd | null];
  /** smooth joins: nothing meets this end, so the tube tapers to a point over its last stretch (`pointLength`) instead of ending in a round cap */
  point?: readonly [boolean, boolean];
  /** a fan's course wears this stretch `[from, to]` of the host's colour ramp (feeder-fan.ts), so a child begins in the colour its parent ends in; none: the vessel's own `lensSpan` */
  lens?: readonly [number, number];
  /** a junction skin stands on this course's end(s) and the course is coiling (coil.ts pinCourse): `len` the course's length at rest, `a` and `b` the share of it, from its start and from its end, held as at rest. The rings there sit at the same distances from the end whatever the length now is
   *  (the rings are spaced along the arc, so a longer course would slide the skin's seam ring along its axis), and the varix's bead is not applied there; both ease in over PIN_RAMP of the course after it. */
  hold?: { len: number; a: number; b: number };
}
/** A branch end buried in its trunk (smooth-joins.ts): `max` the radius its end ring and cap may take, held for `d0` of course from the end and easing back by `d1`; `ceil` the most its collar may reach anywhere (never wider than the trunk). */
export interface Buried { max: number; d0: number; d1: number; ceil?: number }
const smooth = (u: number) => u * u * (3 - 2 * u);
/** The same with each end's own span (the share of the course it eases over); with 0.3 and 0.3 it is `factorAt`. */
export const factorSpan = (t: readonly [number, number], sp: readonly [number, number], u: number): number => {
  const fs = u < sp[0] ? t[0] + (1 - t[0]) * smooth(u / sp[0]) : 1, fe = u > 1 - sp[1] ? 1 + (t[1] - 1) * smooth((u - (1 - sp[1])) / sp[1]) : 1;
  return fs < 1 && fe < 1 ? Math.min(fs, fe) : fs * fe;   // (two narrowings that overlap, a funnel and a tapered end, take the narrower: the radius then rises from each end to the middle and never dips on the way)
};
/** A shunt's sewn end (shunt-ends.ts) as a share of the tube's radius at distance `d` from that end: narrowed inside its host (2D sideEndScale), flared in front of the wall (flareScale). */
const sewnAt = (e: ShuntEnd | null | undefined, end: number, d: number): number => (!e ? 1 : (e.inside && !e.sink ? (sideEndScale(d, e.hostR) as number) : 1) * (e.flare ? (flareScale(d, e.hostR) as number) : 1));
/** The narrowing alone of a sewn end at distance `d`: inside its host's wall it closes toward SIDE_END_MIN (2D sideEndScale). */
const narrowAt = (e: ShuntEnd | null | undefined, d: number): number => (e && e.inside && !e.sink ? (sideEndScale(d, e.hostR) as number) : 1);
const factorAt = (t: readonly [number, number] | undefined, u: number): number => (!t ? 1 : u < 0.3 ? t[0] + (1 - t[0]) * smooth(u / 0.3) : u > 0.7 ? 1 + (t[1] - 1) * smooth((u - 0.7) / 0.3) : 1);

/** A course's radius at `u` (0 to 1 along it) as its tube is built, without the collar and the bead: its own radius, its end tapers, a buried end held under its trunk and a free end's point. `len` is the course's length (scene units). */
export function radiusAtU(c: Course, u: number, len: number): number {
  let f = c.taper && c.taperSpan ? factorSpan(c.taper, c.taperSpan, u) : factorAt(c.taper, u);
  let R = c.radius * f;
  const d0 = u * len, d1 = (1 - u) * len;
  if (c.clamp) R = Math.min(buriedRadius(R, d0, c.clamp[0]), buriedRadius(R, d1, c.clamp[1]));
  if (c.point?.[0]) R *= pointFactor(d0, pointLength(c.radius, len));
  if (c.point?.[1]) R *= pointFactor(d1, pointLength(c.radius, len));
  return R;
}

/** The share of its radius a free end tapers down to (a point, not a hole: the tube stays closed). */
export const TIP_K = 0.07;
/** The length (scene units) a free end tapers over: four radii, never more than 40 % of the course. */
export const pointLength = (radius: number, courseLen: number): number => Math.min(0.4 * courseLen, 4 * radius);
/** The tube's radius share at distance `d` from a free end: TIP_K at the end, 1 at `len` and beyond (a smooth ease, so it is monotone). */
export const pointFactor = (d: number, len: number): number => (len <= 0 || d >= len ? 1 : TIP_K + (1 - TIP_K) * smooth(Math.max(0, d) / len));
/** A radius `r` at distance `d` from an end that is buried in a trunk, held under the trunk's allowance there. */
export const buriedRadius = (r: number, d: number, b: { max: number; d0: number; d1: number } | null | undefined): number => {
  if (!b || d >= b.d1 || r <= b.max) return r;
  return d <= b.d0 ? b.max : b.max + (r - b.max) * smooth((d - b.d0) / Math.max(1e-9, b.d1 - b.d0));
};

/** Tube segments for a course of `len` scene units, with `room` to grow into when it coils. */
export const tubularFor = (len: number, room = 1.6): number => Math.max(16, Math.round(len * 30 * room));

/** The collar's extra radius at distance `d` from an end: all of `add` up to the host's wall, then melting away over `span` (a quadratic, tangent to the tube where it ends). */
export const flareAdd = (f: { add: number; wall: number; span: number } | null | undefined, d: number): number => {
  if (!f) return 0;
  const u = Math.min(1, Math.max(0, (d - f.wall) / f.span));
  return f.add * (1 - u) * (1 - u);
};

export const TUBE_RADIAL = 14;

const smooth01 = (t: number): number => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
/** The pinned stretch's weight at `u`: 0 inside the held stretch, 1 past its ramp (coil.ts PIN_RAMP, the same ramp the courses use). */
const holdWeight = (h: NonNullable<Course['hold']>, u: number): number => (h.a > 0 ? smooth01((u - h.a) / PIN_RAMP) : 1) * (h.b > 0 ? smooth01((1 - u - h.b) / PIN_RAMP) : 1);
/** Where along the arc (0 to 1) ring `u` sits: the held stretches keep the distance from their end they have at rest, the rings between them share the rest of the course. */
function heldArc(h: NonNullable<Course['hold']>, len: number): (u: number) => number {
  const ka = h.len / len, a1 = h.a * ka, b1 = h.b * ka;   // (the held stretches' share of the course now)
  if (!(len > 0) || a1 + b1 >= 1) return (u) => u;
  return (u) => (h.a > 0 && u <= h.a ? u * ka : h.b > 0 && u >= 1 - h.b ? 1 - (1 - u) * ka : a1 + ((u - (h.a > 0 ? h.a : 0)) / (1 - (h.a > 0 ? h.a : 0) - (h.b > 0 ? h.b : 0))) * (1 - a1 - b1));
}
/** A curve whose parameter runs through a remap (the held rings): the tube geometry reads its points, tangents and frames through `getPointAt` and `getTangentAt`. */
class HeldCurve extends CatmullRomCurve3 {
  at: (u: number) => number = (u) => u;
  override getPointAt(u: number, t?: Vector3): Vector3 { return super.getPointAt(this.at(u), t); }
  override getTangentAt(u: number, t?: Vector3): Vector3 { return super.getTangentAt(this.at(u), t); }
}
const RADIAL = TUBE_RADIAL;

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
    const curve = new HeldCurve(c.pts.map((p) => new Vector3(p[0], p[1], p[2])));
    if (i === 0) length = curve.getLength();
    if (c.hold) curve.at = heldArc(c.hold, curve.getLength());
    const seg = tubular[i]!;
    // (A course of no radius, a strand a band has closed or a channel not yet grown, is built at a hair's width and marked rk 0, which the vertex shader keeps off the screen. Built at 0 its collar
    // share `flare / radius` and the Circuit's `offset / radius` are NaN, and a NaN position on a real GPU draws as a black blob or a long black spindle across its neighbours: Mohammad's iPhone, 19 Nov 2026.)
    const open = c.radius > 0, R0 = open ? c.radius : HAIR;
    // the fillet's collar, never wider than the trunk it ends on (smooth joins: a bulb wider than the trunk reads as a blob at the junction)
    const collar = (end: number, d: number): number => { const a = flareAdd(c.flare?.[end], d), cl = c.clamp?.[end]; return cl?.ceil != null ? Math.min(a, Math.max(0, cl.ceil - c.radius)) : a; };
    const tube = new TubeGeometry(curve, seg, R0, RADIAL, false);
    const rks: number[] = [], rkcs: number[] = [];
    const clen = curve.getLength();
    const P = new Vector3(), pos = tube.attributes.position as Float32BufferAttribute;
    for (let k = 0; k <= seg; k++) {
      const u = k / seg, ua = curve.at(u);   // (ua: the share of the arc the ring sits at: its distances to the ends are ua * clen)
      let f = open ? ((c.taper && c.taperSpan ? factorSpan(c.taper, c.taperSpan, u) : factorAt(c.taper, u)) + (collar(0, ua * clen) + collar(1, (1 - ua) * clen)) / c.radius) * (c.bead && c.bead.b > 0 ? (1 + ((beadRadius(1, c.bead.b, u, c.bead.len, c.bead.ph, c.bead.u0, c.bead.lambda) as number) - 1) * (c.hold ? holdWeight(c.hold, u) : 1)) : 1) : 1;
      curve.getPointAt(k / seg, P);
      if (open && c.sewn) {
        const f0 = f, a0 = sewnAt(c.sewn[0], 0, ua * clen), a1 = sewnAt(c.sewn[1], 1, (1 - ua) * clen);
        f *= a0 * a1;
        // a generated end's flare never takes the tube wider than its host (a stent in a vein of its own width, a shunt on a thin branch: the heel was a bulge): the narrowing stays, the flare is cut at the host's radius
        const cap = [c.sewn[0], c.sewn[1]].reduce((m, e, i) => (e?.capped && e.flare && flareScale(i ? (1 - ua) * clen : ua * clen, e.hostR) as number > 1 ? Math.max(m, e.hostR / c.radius) : m), 0);
        if (cap > 0) f = Math.min(f, Math.max(f0 * narrowAt(c.sewn[0], ua * clen) * narrowAt(c.sewn[1], (1 - ua) * clen), cap));
      }
      if (open && (c.clamp || c.point)) {
        // (smooth joins) the buried ends keep their collar inside the trunk, and a free end narrows to a point
        const d0 = ua * clen, d1 = (1 - ua) * clen;
        let R = c.radius * f;
        if (c.clamp) R = Math.min(buriedRadius(R, d0, c.clamp[0]), buriedRadius(R, d1, c.clamp[1]));
        if (c.point?.[0]) R *= pointFactor(d0, pointLength(c.radius, clen));
        if (c.point?.[1]) R *= pointFactor(d1, pointLength(c.radius, clen));
        f = R / c.radius;
      }
      for (let j = 0; j <= RADIAL; j++) {
        const at = k * (RADIAL + 1) + j;
        if (f !== 1) pos.setXYZ(at, P.x + (pos.getX(at) - P.x) * f, P.y + (pos.getY(at) - P.y) * f, P.z + (pos.getZ(at) - P.z) * f);
        rks.push(open ? (c.radius * f) / radius0 : 0);
        rkcs.push(open ? c.radius / radius0 : 0);
      }
    }
    tube.setAttribute('rk', new Float32BufferAttribute(rks, 1));
    // (`lensR`: from and span of the ramp stretch this course wears; (0, 0) = the vessel's own)
    const lensRange = [c.lens ? c.lens[0] : 0, c.lens ? c.lens[1] - c.lens[0] : 0];
    tube.setAttribute('lensR', new Float32BufferAttribute(Array.from({ length: (seg + 1) * (RADIAL + 1) }, () => lensRange).flat(), 2));
    // (`rkc`: the radius share on the Circuit's map, the course's own: the body's tapers, collars, beads and buried ends are the 3D figure's, and the map draws a vessel one width along its length)
    tube.setAttribute('rkc', new Float32BufferAttribute(rkcs, 1));
    const tang: number[] = [];
    for (let k = 0; k <= seg; k++) { const t = curve.getTangentAt(k / seg); for (let j = 0; j <= RADIAL; j++) tang.push(t.x, t.y, t.z); }
    tube.setAttribute('tang', new Float32BufferAttribute(tang, 3));
    // the radius a round cap is built at: the tube's own at that end (the collar's, a buried end's held inside its trunk, a free end's tip); none at an end that carries on
    const capRadius = (end: number): number => {
      let r = open && !c.capless?.[end] ? c.radius * factorAt(c.taper, end) * sewnAt(c.sewn?.[end], end, 0) + collar(end, 0) : HAIR;
      if (open && r > HAIR && c.clamp?.[end]) r = Math.min(r, c.clamp[end]!.max);
      if (open && r > HAIR && c.point?.[end]) r *= TIP_K;
      return r;
    };
    const group: BufferGeometry[] = [tube];
    for (const end of [0, 1]) {
      const capR = capRadius(end);
      const s = new SphereGeometry(capR, 14, 10);
      const pos = curve.getPointAt(end), t = curve.getTangentAt(end);
      s.translate(pos.x, pos.y, pos.z);
      const n = s.attributes.position!.count, uv: number[] = [], tg: number[] = [];
      for (let k = 0; k < n; k++) { uv.push(end, 0.5); tg.push(t.x, t.y, t.z); }
      s.setAttribute('uv', new Float32BufferAttribute(uv, 2));
      s.setAttribute('tang', new Float32BufferAttribute(tg, 3));
      group.push(s);
    }
    for (const e of [1, 2]) group[e]!.setAttribute('lensR', new Float32BufferAttribute(Array.from({ length: group[e]!.attributes.position!.count }, () => lensRange).flat(), 2));
    for (const e of [1, 2]) group[e]!.setAttribute('rk', new Float32BufferAttribute(new Float32Array(group[e]!.attributes.position!.count).fill(open && !c.capless?.[e - 1] ? capRadius(e - 1) / radius0 : 0), 1));
    for (const e of [1, 2]) group[e]!.setAttribute('rkc', new Float32BufferAttribute(new Float32Array(group[e]!.attributes.position!.count).fill(open && !c.capless?.[e - 1] ? c.radius / radius0 : 0), 1));
    const tubeCount = tube.attributes.position!.count, capCount = group[1]!.attributes.position!.count;
    runs.push({ curve, tubular: seg, radial: RADIAL, tubeStart: at, tubeCount, capStart: at + tubeCount, capCount });
    at += tubeCount + 2 * capCount;
    parts.push(...group);
  });
  return { geometry: parts.length > 1 ? mergeGeometries(parts, false)! : parts[0]!, length, runs };
}
