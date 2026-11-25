// The 2D figure's coiling collaterals and their braids, as stage-paths.js wiggle / braid / blendFrom and stage-frame.js strandAt draw them (literal ports; the
// tests compare them with the 2D source when PPS_2D_REPO is set). A collateral coils as it opens (stage-tubes.js: amplitude 1.5 + 3.5 of its opening once
// past a quarter), the varices' strands fan out as far as their varix is big, and the strands leave and rejoin their trunk (anatomy.js STRANDS).
import { STRANDS_2D, STRAND_FROM_2D, STRAND_HOLD_2D, STRAND_SOFT_2D, STRAIGHT_COLL_2D, WIG_CAP_2D } from './coil.copied.ts';
import { EDGE_PATH_2D as TODAY_PATH_2D } from '../anatomy/source.ts';
import { PLACED_Z } from '../anatomy/placed-network.ts';
import { aroundEso, onEso, ESO_VARIX_GAP } from '../anatomy/eso-wall.ts';
import { UNITS_PER_SCENE, x2d, x3, y2d, y3 } from '../frame2d.ts';

export type P2 = [number, number];
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth01 = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const wiggleAt = (amp: number, env: number, d: number, k: number, seed: number) => amp * env * Math.sin(d * k + seed);   // (wiggle-math.js: the second harmonic is parked at 0)

/** stage-paths.js wiggle: a smooth serpentine along the course (a wave every 90 units or so), tapered to nothing at both ends. */
export function wiggle(pts: readonly P2[], amp: number, seed: number, hold = 0): P2[] {
  if (amp < 0.3) return pts as P2[];
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1]! + Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]));
  const L = cum[cum.length - 1] || 1;
  const k = Math.max(1.5, Math.round(L / 90)) * Math.PI * 2 / L;
  return pts.map((p, i): P2 => {
    if (i === 0 || i === pts.length - 1) return p;
    const a = pts[i - 1]!, b = pts[i + 1]!;
    let nx = -(b[1] - a[1]), ny = b[0] - a[0];
    const n = Math.hypot(nx, ny) || 1; nx /= n; ny /= n;
    const u = cum[i]! / L;
    // (the envelope eases in and out (smoothstep), so the coil starts with no bend of its own at a sixth of the way; the 2D rule's ramp, min(1, 6u, 6(1 - u)), is a corner in its curvature)
    let env = smooth01(u * 6) * smooth01((1 - u) * 6);
    if (hold) env *= smooth01((u - hold) / (1.4 * hold)) * smooth01((1 - u - hold) / (1.4 * hold));
    const w = wiggleAt(amp, env, cum[i]!, k, seed);
    return [p[0] + nx * w, p[1] + ny * w];
  });
}

/** stage-paths.js braid: a lateral offset of `off` at mid-course easing to zero at both ends (or at `u0` and the far end), or over a stretch `span`. */
export function braid(pts: readonly P2[], off: number, u0 = 0, span: readonly [number, number] | null = null, ph = 0, soft = false): P2[] {
  if (Math.abs(off) < 0.3) return pts as P2[];
  if (span) {
    const [ua, ub] = span, n0 = pts.length - 1, A = pts[0]!, B = pts[n0]!;
    const cl = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1, nx = -(B[1] - A[1]) / cl, ny = (B[0] - A[0]) / cl;
    return pts.map((p, i): P2 => {
      const v = (i / n0 - ua) / (ub - ua);
      if (v <= 0 || v >= 1) return p;
      const o = off * Math.sin(Math.PI * v) ** 1.4 * (1 + 0.1 * Math.sin(3 * Math.PI * v + ph));
      return [p[0] + nx * o, p[1] + ny * o];
    });
  }
  const A = pts[0]!, B = pts[pts.length - 1]!, cl = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1, cx = -(B[1] - A[1]) / cl, cy = (B[0] - A[0]) / cl;
  return pts.map((p, i): P2 => {
    if (i === 0 || i === pts.length - 1) return p;
    const a = pts[i - 1]!, b = pts[i + 1]!;
    let nx = -(b[1] - a[1]), ny = b[0] - a[0];
    const n = Math.hypot(nx, ny) || 1; nx /= n; ny /= n;
    if (soft) { nx = cx; ny = cy; }
    const s = Math.sin(Math.PI * clamp((i / (pts.length - 1) - u0) / (1 - u0), 0, 1));
    const o = off * s * s;   // (every strand parts from its trunk tangent to it, sin squared; 2D's sine left it at an angle, a corner where the strand begins)
    return [p[0] + nx * o, p[1] + ny * o];
  });
}

/** stage-paths.js blendFrom: `a` up to `u0` along, `b` after, joined over the next eighth. */
export function blendFrom(a: readonly P2[], b: readonly P2[], u0: number): P2[] {
  const n = a.length - 1;
  return a.map((p, i): P2 => { const e = clamp((i / n - u0) / 0.12, 0, 1), k = e * e * (3 - 2 * e); return [lerp(p[0], b[i]![0], k), lerp(p[1], b[i]![1], k)]; });
}

// ---- varix size (varix-look.js) ----
export const LOOK_SITE: Record<string, 'VAR' | 'GV'> = { C1a: 'VAR', C1b: 'VAR', C2: 'GV', C5: 'GV' };
const VARIX_REST_MM = 2, VARIX_FULL_MM = { VAR: 7, GV: 8 };
/** How big a varix is, 0 (a resting vein) to 1 (its full size and up). No reading: 1. */
export const varixSize = (site: 'VAR' | 'GV', d: number | undefined): number => (Number.isFinite(d) ? clamp(((d as number) - VARIX_REST_MM) / (VARIX_FULL_MM[site] - VARIX_REST_MM), 0, 1) : 1);
/** How far the strands fan out from the vessel against their full spread. */
export const varixSpreadK = (size: number): number => 0.55 + 0.45 * size;
/** The size a spread stands for (varixSpreadK undone): the eased spread carries the size into the shape (shape.ts ShapeState.spr), so a strand's width follows it without a field or a rebuild of its own. */
export const varixSizeOfSpread = (spr: number): number => clamp((spr - 0.55) / 0.45, 0, 1);
/** The diameter (mm) a varix of `size` has (varixSize undone; 1 stands for its full size). */
export const varixDOfSize = (site: 'VAR' | 'GV', size: number): number => VARIX_REST_MM + size * (VARIX_FULL_MM[site] - VARIX_REST_MM);
/** How far the varices have grown (store.js varixGrowth): 0 at the 2.5 mm cut-off, 1 at about 5.5 mm; none when absent. */
export const varixGrowth = (present: boolean, d: number | undefined): number => (present && Number.isFinite(d) ? clamp(((d as number) - 2.5) / 3, 0.2, 1) : 0);

// ---- the coil of one collateral ----
export const COIL_MAX = 5;
export const isCoiling = (id: string, kind: string, spontaneous: boolean): boolean => kind === 'collateral' && !spontaneous && !STRAIGHT_COLL_2D.has(id);

/** A collateral's coil and spread, eased as stage-tubes.js eases them: coiled once it has grown past a quarter (straight again below a fifth), the target moving
 *  only for a change over 0.6, the coil following it with a quarter-second time constant. */
export class CoilState {
  wig = 0; wigT = 0; spr = 1; sprT = 1; prs = 0; prsT = 0;
  /** `shown`: how far the vessel is open (0 to 1); `spread`: the strands' target spread. Returns true while the shape is still changing. */
  step(shown: number, spread: number, dtMs: number, instant: boolean, press = 0): boolean {
    const coiled = this.wigT > 0 ? shown > 0.2 : shown > 0.25;
    const w = coiled ? 1.5 + 3.5 * shown : 0;
    const before = this.wig * 1000 + this.spr + this.prs * 1e6;
    if (Math.abs(w - this.wigT) > 0.6) this.wigT = w;
    this.sprT = spread;
    const k = instant ? 1 : -Math.expm1(-dtMs / 1000 / 0.25);
    const d = this.wigT - this.wig;
    this.wig = Math.abs(d) < 0.03 ? this.wigT : this.wig + d * k;
    const e = this.sprT - this.spr;
    this.spr = Math.abs(e) < 0.005 ? this.sprT : this.spr + e * k;
    this.prsT = press;
    const g = this.prsT - this.prs;
    this.prs = Math.abs(g) < 0.005 ? this.prsT : this.prs + g * k;
    return this.wig !== this.wigT || this.spr !== this.sprT || this.prs !== this.prsT || before !== this.wig * 1000 + this.spr + this.prs * 1e6;
  }
}

/** The share of a course (its length) over which the pinned stretch at a skinned end eases from the rest course to the live one, and the margin kept past the seam (a few rings: the skin reads the ring's neighbours for its tangent). */
export const PIN_RAMP = 0.1, PIN_MARGIN = 0.04;
/** The stretch of a course at each end that stays exactly as at rest (share of its length from the start, from the end): a skinned end's seam and a margin past it. */
export type Pin = readonly [number, number];
/** A course held at `rest` over the first `pin[0]` and the last `pin[1]` of its length, easing to `pts` over PIN_RAMP after that (smoothstep). A skin stands on the arm's tube at its seam: the seam region of the tube must not move when the rest of the vessel coils, or the skin would have to be rebuilt (about a tenth of a second to two seconds of CPU) on every frame of the growth. Same point count in both. */
export function pinCourse(pts: readonly P2[], rest: readonly P2[], pin: Pin): P2[] {
  if (pin[0] <= 0 && pin[1] <= 0) return pts as P2[];
  const cum = [0];
  for (let i = 1; i < rest.length; i++) cum.push(cum[i - 1]! + Math.hypot(rest[i]![0] - rest[i - 1]![0], rest[i]![1] - rest[i - 1]![1]));
  const L = cum[cum.length - 1] || 1;
  return pts.map((p, i): P2 => {
    const u = cum[i]! / L;
    const w = (pin[0] > 0 ? smooth01((u - pin[0]) / PIN_RAMP) : 1) * (pin[1] > 0 ? smooth01((1 - u - pin[1]) / PIN_RAMP) : 1);
    if (w >= 1) return p;
    const r = rest[i]!;
    return [r[0] + (p[0] - r[0]) * w, r[1] + (p[1] - r[1]) * w];
  });
}

export interface CoilCourse { pts: P2[]; k: number; ph: number; /** 0 to 1: how much of it is drawn (a channel growing in, a strand a band has closed) */ live?: number; /** depth offset at each point, in 2D units (a woven strand goes over and under its neighbours) */ dz?: number[] }
/** THE WEAVE (Mohammad, 22 Nov: the varices drawn as the gastrorenal shunt's braid, picked from the mocks as B2): the strands wind round the vein's axis, each at its own phase, so they cross over and under one another instead of bowing side by side.
 *  `turns` is how many times a strand goes round between where the strands leave the trunk (`u0`) and where they gather again; `reach` the radius of the winding, in 2D units; it is the same across and in depth. */
export const WEAVE: Readonly<Record<string, { turns: number; reach: number }>> = { C1a: { turns: 0.9, reach: 9 } };
const weaveEnv = (v: number): number => smooth01(v / 0.3) * (1 - smooth01((v - 0.7) / 0.3));
/** One woven strand: the course moved sideways by `reach` sin(angle) and in depth by `reach` cos(angle), the angle `phase` plus `turns` turns along the stretch from `u0`, the winding eased to nothing at both ends. */
export function weave(pts: readonly P2[], reach: number, turns: number, phase: number, u0: number): { pts: P2[]; dz: number[] } {
  const n = pts.length - 1, dz: number[] = [];
  const out = pts.map((p, i): P2 => {
    const v = clamp((i / n - u0) / (1 - u0), 0, 1), e = weaveEnv(v), a = phase + 2 * Math.PI * turns * v;
    dz.push(reach * e * Math.cos(a));
    if (i === 0 || i === n) return p;
    const q = pts[i - 1]!, r = pts[i + 1]!;
    let nx = -(r[1] - q[1]), ny = r[0] - q[0];
    const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
    const o = reach * e * Math.sin(a);
    return [p[0] + nx * o, p[1] + ny * o];
  });
  return { pts: out, dz };
}

/** THE VARICES ROUND THE OESOPHAGUS (the approved placement, Mohammad 24 Nov: "varices should be surrounding the esophagus", not one braided cord beside it): the strands wind round the OESOPHAGUS's axis, not their own trunk's,
 *  on its wall (anatomy/eso-wall.ts). Each leaves the trunk where the trunk lies on the tube and goes round the tube to its own angle, the strands spread evenly round it (strand i of n at i/n of a turn from the trunk's side,
 *  the far ones either way round, so no two cross), and gathers on the trunk again where they join the drain; between, each lies its gap out from the wall (anatomy/eso-wall.ts ESO_VARIX_GAP). */
export const WRAP: ReadonlySet<string> = new Set(['C1a']);
/** Where along the course (share of its length) the strands start to part: where the trunk has come up off the cardia onto the tube's wall (the trunk's own course is the strands' until there, so no blend is needed). */
const WRAP_FROM = 0.1;
/** How the strands part from the trunk and gather again along their stretch: a longer easing than the weave's, so a strand going a third of the way round the tube turns no tighter than the bar (tests/anatomy/smooth.ts). */
const wrapEnv = (v: number): number => smooth01(v / 0.5) * (1 - smooth01((v - 0.5) / 0.5));
/** How a strand comes out to (or in to) its gap from the wall: over the first and last fifth of its parted stretch, so the whole column lies its own radius off the wall. With the turn's bump (wrapEnv) a strand wider than its trunk reached its gap only half way up and lay in the wall either side of it. */
const WALL_EASE = 0.2;
const wallEnv = (v: number): number => smooth01(v / WALL_EASE) * smooth01((1 - v) / WALL_EASE);
/** How far out from the oesophagus's wall strand `i` of `n` (its 2D width share `k`) lies: shape.ts hands the strand's drawn radius at the present size, so it touches the wall at every size (ESO_VARIX_GAP when none is handed: the widest, at full size). */
export type WallGap = (i: number, n: number, k: number) => number;
function wrapEso(base: readonly P2[], z: readonly number[], i: number, n: number, u0: number, gap: number): { pts: P2[]; dz: number[] } {
  const m = base.length - 1, off = (2 * Math.PI * (((i + Math.floor(n / 2)) % n) - Math.floor(n / 2))) / n, dz: number[] = [];
  const pts = base.map((p, j): P2 => {
    const P = [x3(p[0]), y3(p[1]), z[j]!], a = aroundEso(P), v = clamp((j / m - u0) / (1 - u0), 0, 1), e = wrapEnv(v);
    const th = a.th + e * off, q = onEso(P[1]!, th, a.out + (gap - a.out) * wallEnv(v));
    dz.push(e > 0 ? (q[2] - P[2]!) * UNITS_PER_SCENE : 0);
    return e > 0 ? [x2d(q[0]), y2d(q[1])] : p;
  });
  return { pts, dz };
}

/** The 2D course of a collateral (or a liver bed) and its strands at coil `wig` and spread `spr`, as stage-frame.js builds them in the anatomic view. */
export function coilCourses(id: string, base: readonly P2[], coils: boolean, wig: number, spr: number, pin?: Pin, gap?: WallGap): { main: P2[]; strands: CoilCourse[] } {
  const live = coilCoursesFree(id, base, coils, wig, spr, gap);
  if (!pin || (pin[0] <= 0 && pin[1] <= 0)) return live;
  const rest = coilCoursesFree(id, base, coils, 0, 1);
  return { main: pinCourse(live.main, rest.main, pin), strands: live.strands.map((c, i) => ({ ...c, pts: pinCourse(c.pts, rest.strands[i]!.pts, pin) })) };
}
function coilCoursesFree(id: string, base: readonly P2[], coils: boolean, wig: number, spr: number, gap?: WallGap): { main: P2[]; strands: CoilCourse[] } {
  const u0 = STRAND_FROM_2D[id] ?? 0;
  let main = base as P2[];
  if (coils) { const wz = wiggle(base, Math.min(wig, WIG_CAP_2D[id] ?? Infinity), id.length); main = u0 ? blendFrom(base, wz, u0) : wz; }
  // (a varix is a few separate strands, three at most: the 2D figure's five overlapped into a solid-looking bundle in 3D)
  const all = STRANDS_2D[id] ?? [], rows = id !== 'C8' && !/^SIN/.test(id) && all.length > 3 ? [0, 1, 2].map((i) => all[Math.round((i * (all.length - 1)) / 2)]!) : all;
  const soft = STRAND_SOFT_2D.has(id), sp0 = LOOK_SITE[id] ? spr : 1;
  const wv = WEAVE[id];
  const strands = rows.map((r, i): CoilCourse => {
    const [off, ph, k, ua, ub] = r as [number, number, number, number?, number?];
    if (wv) {
      // (a course shorter than the 2D figure's (the varices, half as long) winds at the same pitch, not in the same number of turns: its turns and reach shrink with its length, so it curls no tighter)
      const kL = Math.min(1, len2(base) / (len2(TODAY_PATH_2D[id] ?? base) || 1));
      const z = WRAP.has(id) ? PLACED_Z[id] : undefined;
      if (z && z.length === base.length) { const w = wrapEso(base, z, i, rows.length, WRAP_FROM, gap ? gap(i, rows.length, k) : ESO_VARIX_GAP); return { pts: w.pts, k, ph, dz: w.dz }; }
      const w = weave(base, wv.reach * sp0 * kL, wv.turns * kL, (2 * Math.PI * i) / rows.length, u0);
      return { pts: u0 ? blendFrom(main, w.pts, u0) : w.pts, k, ph, dz: w.dz };
    }
    const fan = off * sp0, amp = 0.8 * wig + 3;
    let sp = ua != null ? braid(base, fan, 0, [ua, ub!], ph) : soft ? wiggle(braid(main, fan, u0, null, 0, true), amp, ph, STRAND_HOLD_2D) : wiggle(braid(base, fan, u0), amp, ph);
    if (u0) sp = blendFrom(main, sp, u0);
    return { pts: sp, k, ph };
  });
  return { main, strands };
}
/** A 2D course's length. */
function len2(p: readonly (readonly [number, number])[]): number { let l = 0; for (let i = 1; i < p.length; i++) l += Math.hypot(p[i]![0] - p[i - 1]![0], p[i]![1] - p[i - 1]![1]); return l; }
