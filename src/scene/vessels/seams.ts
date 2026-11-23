// The running stitch at a surgical shunt's sewn end (2D stage-transitions.js anastomoses, suture-marks.js seamTable / seamDashes), lifted whole: the seam is the CURVE where the host vein's wall
// crosses the shunt, found on the 2D courses at 21 places across the shunt (walking in from its end until the shunt is out of the host), smoothed, and drawn as dashes along it (a halo, then the
// thread). The slanted curve is what makes it read as a join that follows the wall, not a ring. Here the curve is a quartic in the place across the shunt (a from -1 to 1, the side of the tube
// the shader's `across` is on), which the 21 smoothed samples fit to the pixel, and the dashes are the 2D's own count and length along it. A shunt whose end lies in no host keeps 2D's three ticks.
// THE 3D COURSE (23 Nov, Mohammad: the Warren shunt's stitch ran along the limb, 23.8 units along a tube 12.6 wide): with smooth joins on, the seam is found on the course the tube is drawn on (shape.ts at rest), in 3D, against the host's 3D axis, so
// the shader's own distance (`sl = Lw - aF`, along the 3D course) and the curve agree; the 2D hook a shunt had into its host is no longer what it is measured on. With them off it is the 2D art's own paths, as before.
// Pure: figure units, in from the start and from the end of the vessel.
import { EDGE_PATH_2D } from './paths.copied.ts';
import { NETWORK, NETWORK_BY_ID } from './network.ts';
import { UNITS_PER_SCENE } from '../frame2d.ts';
import { shuntEnds, sewnHostIds } from './shunt-ends.ts';
import { flareScale, sideEndScale } from './fork-joins.copied.js';
import { smoothJoinsOn } from './join-mode.ts';
import { coursesOf, REST } from './shape.ts';

/** The surgical shunts that are sewn (the Warren, the portocaval, the mesocaval and the Meso-Rex). */
export const SEWN_IDS: readonly string[] = ['S_DSR', 'S_PC', 'S_MC', 'REX'];
type Pt = readonly [number, number];
/** A point of a path in figure units (the figure's y runs down; the 2D paths have z = 0). */
type P3 = readonly [number, number, number];
const WALL = 1, STEP = 0.75, TICKS = 10, NS = 21;

/** One seam as the shader draws it: its distance in from the end (figure units) as a quartic in the place across the shunt (c0..c4), and the dashes along it as shares of its length: how many (0: three ticks, no dashes),
 *  one dash's length, one dash and its gap. */
export interface SeamCurve { readonly c: readonly [number, number, number, number, number]; readonly n: number; readonly dash: number; readonly per: number }

const distToLine = (cur: readonly P3[], x: number, y: number, z: number): number => {
  let m = Infinity;
  for (let i = 1; i < cur.length; i++) {
    const [ax, ay, az] = cur[i - 1]!, [bx, by, bz] = cur[i]!, dx = bx - ax, dy = by - ay, dz = bz - az, l2 = dx * dx + dy * dy + dz * dz;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy + (z - az) * dz) / l2)) : 0;
    m = Math.min(m, Math.hypot(x - (ax + t * dx), y - (ay + t * dy), z - (az + t * dz)));
  }
  return m;
};
const lengthOf = (c: readonly P3[]): number => { let s = 0; for (let i = 1; i < c.length; i++) s += Math.hypot(c[i]![0] - c[i - 1]![0], c[i]![1] - c[i - 1]![1], c[i]![2] - c[i - 1]![2]); return s; };
/** The point and the unit tangent at arc length d from the start of a polyline (2D's frameAt, in 3D). */
function frameAt(cur: readonly P3[], d: number): { x: number; y: number; z: number; tx: number; ty: number } {
  let s = 0;
  for (let i = 1; i < cur.length; i++) {
    const dx = cur[i]![0] - cur[i - 1]![0], dy = cur[i]![1] - cur[i - 1]![1], dz = cur[i]![2] - cur[i - 1]![2], l = Math.hypot(dx, dy, dz);
    if (s + l >= d || i === cur.length - 1) {
      const t = l > 0 ? Math.min(1, Math.max(0, (d - s) / l)) : 0, h = Math.hypot(dx, dy);
      return { x: cur[i - 1]![0] + dx * t, y: cur[i - 1]![1] + dy * t, z: cur[i - 1]![2] + dz * t, tx: h > 0 ? dx / h : 1, ty: h > 0 ? dy / h : 0 };
    }
    s += l;
  }
  const e = cur[cur.length - 1]!;
  return { x: e[0], y: e[1], z: e[2], tx: 1, ty: 0 };
}

/** A vessel's path as the seam is measured on it, in figure units: smooth joins on, the course the tube is drawn on at rest (scene units to figure units, y flipped to run down); off, the 2D art's path. */
function pathOf(id: string): readonly P3[] | undefined {
  if (smoothJoinsOn()) {
    const v = NETWORK_BY_ID.get(id), c = v?.plan ? coursesOf(v, REST)[0] : undefined;
    return c ? c.pts.map((q): P3 => [q[0] * UNITS_PER_SCENE, -q[1] * UNITS_PER_SCENE, q[2] * UNITS_PER_SCENE]) : undefined;
  }
  const p = EDGE_PATH_2D[id] as readonly Pt[] | undefined;
  return p?.map((q): P3 => [q[0], q[1], 0]);
}

/** The veins a shunt can be sewn into: a vein, a collateral or a liver vessel that is not an artery (2D hostable). */
const hosts = (id: string) => NETWORK.filter((v) => !v.feeder && v.id !== id && v.tone !== 'artery' && (v.kind === 'vein' || v.kind === 'collateral' || v.kind === 'liver') && EDGE_PATH_2D[v.id]);

/** 2D seamTable: where the host's wall meets the shunt, for 21 places across it, as the distance in from its end; null when the end is not inside a host. */
function seamTable(pt: (sl: number, a: number) => P3, du: (x: number, y: number, z: number) => number, maxSl: number): Float64Array | null {
  const tab = new Float64Array(NS);
  for (let i = 0; i < NS; i++) {
    const a = -1 + (2 * i) / (NS - 1);
    let found = -1;
    for (let sl = 0; sl <= maxSl; sl += STEP) { const p = pt(sl, a); if (du(p[0], p[1], p[2]) < -0.3) { found = sl; break; } }
    if (found < 0) return null;
    tab[i] = found;
  }
  for (let k = 0; k < 3; k++) { const c = Float64Array.from(tab); for (let i = 1; i < NS - 1; i++) tab[i] = (c[i - 1]! + 2 * c[i]! + c[i + 1]!) / 4; }
  return tab[NS >> 1]! > 1.5 ? tab : null;
}
/** The least-squares quartic through the 21 samples (a from -1 to 1). */
function quartic(tab: Float64Array): [number, number, number, number, number] {
  const K = 5, A: number[][] = Array.from({ length: K }, () => new Array<number>(K + 1).fill(0));
  for (let i = 0; i < NS; i++) {
    const a = -1 + (2 * i) / (NS - 1), p = [1, a, a * a, a * a * a, a * a * a * a];
    for (let r = 0; r < K; r++) { for (let c = 0; c < K; c++) A[r]![c]! += p[r]! * p[c]!; A[r]![K]! += p[r]! * tab[i]!; }
  }
  for (let c = 0; c < K; c++) {
    let m = c; for (let r = c + 1; r < K; r++) if (Math.abs(A[r]![c]!) > Math.abs(A[m]![c]!)) m = r;
    [A[c], A[m]] = [A[m]!, A[c]!];
    for (let r = 0; r < K; r++) { if (r === c) continue; const f = A[r]![c]! / A[c]![c]!; for (let k = c; k <= K; k++) A[r]![k]! -= f * A[c]![k]!; }
  }
  return [0, 1, 2, 3, 4].map((r) => A[r]![K]! / A[r]![r]!) as [number, number, number, number, number];
}
/** A seam is never at or past the shunt's own end: the least-squares quartic may dip a little under zero where the samples sit at the end itself (a shunt lying in its host along the first step), so it is lifted by what it dips under `floor`. */
const MIN_IN = 0.3;
function liftedAbove(c: [number, number, number, number, number], floor: number): [number, number, number, number, number] {
  let m = Infinity;
  for (let i = 0; i <= 40; i++) { const a = -1 + i / 20; m = Math.min(m, c[0] + a * (c[1] + a * (c[2] + a * (c[3] + a * c[4])))); }
  return m >= floor ? c : [c[0] + (floor - m), c[1], c[2], c[3], c[4]];
}
/** 2D seamDashes: the seam as one running stitch, `dash` long with `gap` between, the first and last half a gap in from the shunt's sides: how many, and one's share of the seam's length. */
function dashPlan(pt: (sl: number, a: number) => P3, tab: Float64Array, dash: number, gap: number): { n: number; dash: number; per: number } {
  const at = (a: number): number => { const f = (Math.max(-1, Math.min(1, a)) + 1) / 2 * (NS - 1), i = Math.min(NS - 2, Math.floor(f)); return tab[i]! + (tab[i + 1]! - tab[i]!) * (f - i); };
  let total = 0, prev: P3 | null = null;
  for (let i = 0; i <= 24; i++) { const a = -0.97 + (1.94 * i) / 24, p = pt(at(a), a); if (prev) total += Math.hypot(p[0] - prev[0], p[1] - prev[1], p[2] - prev[2]); prev = p; }
  const n = Math.max(2, Math.round((total + gap) / (dash + gap))), d1 = (total - gap * (n - 1)) / n;
  return { n, dash: d1 / total, per: (d1 + gap) / total };
}

const memo = new Map<string, readonly [SeamCurve | null, SeamCurve | null]>();
const memoKey = (id: string): string => `${id}|${smoothJoinsOn() ? 3 : 2}`;
/** The seams at a shunt's two ends (the start, then the end); each null where the shunt is not drawn at all. */
export function seamCurvesOf(id: string): readonly [SeamCurve | null, SeamCurve | null] {
  const hit = memo.get(memoKey(id));
  if (hit) return hit;
  const path = pathOf(id), own = NETWORK_BY_ID.get(id), sewn = shuntEnds(id);
  let out: readonly [SeamCurve | null, SeamCurve | null] = [null, null];
  if (path && own) {
    const L = lengthOf(path), cand = hosts(id), R0 = own.radius * UNITS_PER_SCENE;
    const end = (atEnd: boolean): SeamCurve => {
      const e = sewn ? sewn[atEnd ? 1 : 0] : null;
      // (the drawn radius at distance d from this end: narrowed inside a host and flared at the far end, plus 2D's wall; 2D rAt)
      const rAt = (d: number): number => {
        const sl = atEnd ? L - d : d, s = sl / UNITS_PER_SCENE;
        const k = !e ? 1 : (e.inside && !e.sink ? (sideEndScale(s, e.hostR) as number) : 1) * (e.flare ? (flareScale(s, e.hostR) as number) : 1);
        return R0 * k + WALL * 0.6;
      };
      const pt = (sl: number, a: number): P3 => { const d = atEnd ? L - sl : sl, q = frameAt(path, d), r = rAt(d); return [q.x - q.ty * r * a, q.y + q.tx * r * a, q.z]; };   // (the side the shader's `across` is on: (-ty, tx) in the figure's y-down units)
      const p0 = frameAt(path, atEnd ? L : 0);
      let host: { path: readonly P3[]; r: number } | null = null, bu = 0;
      const named = sewnHostIds(id, atEnd ? 1 : 0);   // (the table's host where it names one: the Warren shunt's renal end is sewn into the renal vein, whatever collateral shares its node and runs along the shunt)
      for (const h of named.length ? cand.filter((c) => named.includes(c.id)) : cand) {
        const hp = pathOf(h.id); if (!hp) continue;
        const hr = h.radius * UNITS_PER_SCENE + WALL, u = hr - distToLine(hp, p0.x, p0.y, p0.z);
        if (u > bu) { bu = u; host = { path: hp, r: hr }; }
      }
      const ticks: SeamCurve = { c: [Math.min(TICKS, L * 0.1), 0, 0, 0, 0], n: 0, dash: 1, per: 1 };   // (2D's three ticks, 10 units in)
      if (!host) return ticks;
      const hp = host.path, hr = host.r, tab = seamTable(pt, (x, y, z) => hr - distToLine(hp, x, y, z), Math.min(60, 0.45 * L));
      if (!tab) return ticks;
      const R = rAt(L * 0.5), plan = dashPlan(pt, tab, Math.max(2.6, R * 0.62), Math.max(1.5, R * 0.3));
      return { c: liftedAbove(quartic(tab), MIN_IN), n: plan.n, dash: plan.dash, per: plan.per };
    };
    out = [end(false), end(true)];
  }
  memo.set(memoKey(id), out);
  return out;
}
/** What the shader gets: the Warren shunt's start and the end-to-side portocaval shunt's start are the vein itself, so nothing is sewn there (2D sutureRunsOn); a side-to-side portocaval shunt is sewn at both. */
export function seamsFor(id: string, sideToSide: boolean): readonly [SeamCurve | null, SeamCurve | null] {
  const [a, b] = seamCurvesOf(id);
  const startRunsOn = id === 'S_DSR' || (id === 'S_PC' && !sideToSide);
  return [startRunsOn ? null : a, b];
}
/** The seam's distance in from the end at the place `a` across the shunt (the shader's own sum). */
export const seamAtA = (s: SeamCurve, a: number): number => s.c[0] + a * (s.c[1] + a * (s.c[2] + a * (s.c[3] + a * s.c[4])));
