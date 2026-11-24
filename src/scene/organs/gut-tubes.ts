// The approved placement's gut (docs/approved/anatomy-placement.md: "the small bowel is tubes packed under the colon"; "the antrum tapers into the duodenum with no line"; "only the rectum's end fades"). The 2D figure's gut pillows
// (duodenum, bowel, colon) and their painted loops and haustra are retired (plan question 7): the gut is round tubes along the mock's centrelines (PLACED_GUT): one tube from the stomach's cut through the duodenum, the packed
// small-bowel loops and the ileum into the caecum, and the colon from the caecum to the rectum, with its haustra. The mock's own code (round-16 page/geom.js denseCurve, relax, gutCentrelines; script2.js tubeFrom), ported; the
// small tube is cut in two where the duodenum hands over to the jejunum (the end of PLACED_GUT.upper), so a tap can tell them apart, sharing that ring exactly (same points, same normals): drawn as one gut surface (layer.ts) it has
// no seam. Each tube carries what the organ shader and its outline need: the surface's own round normals, `esoA` (the rectum's fade, 1 elsewhere) and, on the duodenum, `tos` (how much of the stomach's look it wears: all of it at
// the cut, easing into the bowel's over the duodenal bulb). Pure arithmetic, built once when the organs are prepared.
import { BufferGeometry, Float32BufferAttribute, Uint32BufferAttribute } from 'three';
import { PLACED_GUT } from '../anatomy/placement.generated.ts';

type P4 = [number, number, number, number];
type Line = readonly (readonly number[])[];
const smooth = (a: number, b: number, x: number): number => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Where the stomach hands over to the duodenum's funnel (scene x; the mock's PYL_CUT, script2.js): the stomach is cut away on its patient's-right side of it, and the funnel starts here. */
export const PYL_CUT = 0.225;
/** The colon's haustra: how deep the sacculations are, as a share of its radius (PLACED_GUT.haustra). */
export const HAUSTRA = PLACED_GUT.haustra;
/** Segments round a gut tube (the mock's 16 left a 22.5 degree fold between neighbouring normals, close to the smooth bar's 25; 24 is 15 degrees) and the rings' spacing along it (near-square quads on the small bowel). */
export const GUT_SEGMENTS = 24, RING_STEP = 0.014;

/** A dense course resampled every `step` of arc length (the ends kept), each point's radius with it. */
export function byArc(d: readonly P4[], step: number): P4[] {
  const s = [0]; for (let i = 1; i < d.length; i++) s.push(s[i - 1]! + Math.hypot(d[i]![0] - d[i - 1]![0], d[i]![1] - d[i - 1]![1], d[i]![2] - d[i - 1]![2]));
  const L = s[s.length - 1]!, n = Math.max(2, Math.round(L / step) + 1), out: P4[] = []; let i = 1;
  for (let k = 0; k < n; k++) {
    const t = (L * k) / (n - 1); while (i < d.length - 1 && s[i]! < t) i++;
    const u = (t - s[i - 1]!) / (s[i]! - s[i - 1]! || 1);
    out.push([0, 1, 2, 3].map((j) => d[i - 1]![j]! + (d[i]![j]! - d[i - 1]![j]!) * u) as P4);
  }
  return out;
}

/** Catmull-Rom through control points [x, y, z, r], resampled every `step` by arc length (geom.js denseCurve). */
export function denseCurve(ctrl: readonly (readonly number[])[], step = 0.01): P4[] {
  const P = [ctrl[0]!, ...ctrl, ctrl[ctrl.length - 1]!], dense: P4[] = [];
  for (let i = 1; i < P.length - 2; i++) {
    const p0 = P[i - 1]!, p1 = P[i]!, p2 = P[i + 1]!, p3 = P[i + 2]!;
    const d1 = Math.hypot(p2[0]! - p1[0]!, p2[1]! - p1[1]!, p2[2]! - p1[2]!) || 1e-6;
    const d0 = Math.hypot(p1[0]! - p0[0]!, p1[1]! - p0[1]!, p1[2]! - p0[2]!) || d1, d2 = Math.hypot(p3[0]! - p2[0]!, p3[1]! - p2[1]!, p3[2]! - p2[2]!) || d1;
    const m1 = [0, 1, 2, 3].map((j) => ((p2[j]! - p0[j]!) / (d0 + d1)) * d1), m2 = [0, 1, 2, 3].map((j) => ((p3[j]! - p1[j]!) / (d1 + d2)) * d1);
    const N = 30;
    for (let k = 0; k < N; k++) {
      const u = k / N, u2 = u * u, u3 = u2 * u, h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
      dense.push([0, 1, 2, 3].map((j) => h00 * p1[j]! + h10 * m1[j]! + h01 * p2[j]! + h11 * m2[j]!) as P4);
    }
  }
  dense.push(ctrl[ctrl.length - 1]!.slice(0, 4) as P4);
  const out: P4[] = [dense[0]!]; let acc = 0;
  for (let i = 1; i < dense.length; i++) { acc += Math.hypot(dense[i]![0] - dense[i - 1]![0], dense[i]![1] - dense[i - 1]![1], dense[i]![2] - dense[i - 1]![2]); if (acc >= step) { out.push(dense[i]!); acc = 0; } }
  if (acc > 0) out.push(dense[dense.length - 1]!);
  return out;
}

/** Laplacian smoothing of a dense course, ends held (geom.js relax). */
export function relax(D: P4[], iters: number, keepEnd = 0): P4[] {
  for (let it = 0; it < iters; it++) {
    const N = D.map((p) => p.slice() as P4);
    for (let i = 1 + keepEnd; i < D.length - 1 - keepEnd; i++) for (let j = 0; j < 3; j++) N[i]![j] = 0.25 * D[i - 1]![j]! + 0.5 * D[i]![j]! + 0.25 * D[i + 1]![j]!;
    D = N;
  }
  return D;
}

/** The gut's centrelines as the mock makes them (geom.js gutCentrelines with the packed loops): `small` from the cut to the caecum, `colon` from the caecum to the rectum, and `duoEnd`, the dense index where the duodenum ends
 *  (the point of `small` nearest the last point of PLACED_GUT.upper). */
export function gutCentrelines(): { small: P4[]; colon: P4[]; duoEnd: number } {
  const upper: Line = PLACED_GUT.upper, pack: Line = PLACED_GUT.pack, ileum: Line = PLACED_GUT.ileum, col: Line = PLACED_GUT.colon;
  const small = byArc(relax(denseCurve([...upper, ...pack, ...ileum], 0.008), 12), RING_STEP), colon = byArc(relax(denseCurve(col, 0.008), 12), RING_STEP);
  const e = upper[upper.length - 1]!;
  let duoEnd = 0, best = Infinity;
  for (let i = 0; i < small.length; i++) { const p = small[i]!, d = Math.hypot(p[0] - e[0]!, p[1] - e[1]!, p[2] - e[2]!); if (d < best) { best = d; duoEnd = i; } }
  return { small, colon, duoEnd };
}

interface TubeOpts { /** each end: 'open' (joined edge to edge, no cap), 'fade' (fades out: alpha and a narrowing, no cap) or 'cap' (a round cap) */ ends: ['open' | 'fade' | 'cap', 'open' | 'fade' | 'cap']; haustra?: number; tos?: (s: number) => number; seg?: number }
interface Tube { pos: number[]; nrm: number[]; alpha: number[]; tos: number[]; s: number[]; idx: number[]; rings: number; seg: number }

/** A tube along dense centreline points (script2.js tubeFrom): rotation-minimising frames, the round section's own normals, a soft fade at a fading end, a round cap at a capped one. Wound outward: the front face is the near wall,
 *  the outline's back-face hull the far one. */
function tubeFrom(pts: readonly P4[], o: TubeOpts): Tube {
  const n = pts.length, seg = o.seg ?? GUT_SEGMENTS, pos: number[] = [], nrm: number[] = [], alpha: number[] = [], tos: number[] = [], sA: number[] = [], idx: number[] = [];
  const s = [0]; for (let i = 1; i < n; i++) s.push(s[i - 1]! + Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1], pts[i]![2] - pts[i - 1]![2]));
  const L = s[n - 1]!, fl = Math.min(0.16, L * 0.3);
  const norm = (v: number[]) => { const l = Math.hypot(v[0]!, v[1]!, v[2]!) || 1; return [v[0]! / l, v[1]! / l, v[2]! / l]; };
  const cross = (a: number[], b: number[]) => [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!];
  const sub = (a: readonly number[], b: readonly number[]) => [a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!];
  let T = norm(sub(pts[1]!, pts[0]!)), N = cross([0, 0, 1], T);
  if (Math.hypot(N[0]!, N[1]!, N[2]!) < 1e-3) N = cross([1, 0, 0], T);
  N = norm(N);
  for (let i = 0; i < n; i++) {
    const Ti = norm(sub(pts[Math.min(n - 1, i + 1)]!, pts[Math.max(0, i - 1)]!));
    const d = N[0]! * Ti[0]! + N[1]! * Ti[1]! + N[2]! * Ti[2]!;
    N = norm([N[0]! - Ti[0]! * d, N[1]! - Ti[1]! * d, N[2]! - Ti[2]! * d]); T = Ti;
    const B = cross(T, N);
    let f = 1, rr = pts[i]![3];
    if (o.haustra) rr *= 1 - o.haustra * 0.5 + o.haustra * Math.pow(Math.abs(Math.sin(s[i]! * 30)), 0.5);
    if (o.ends[0] === 'fade' && s[i]! < fl) { const k = smooth(0, fl, s[i]!); f = Math.min(f, k); rr *= 0.55 + 0.45 * k; }
    if (o.ends[1] === 'fade' && L - s[i]! < fl) { const k = smooth(0, fl, L - s[i]!); f = Math.min(f, k); rr *= 0.55 + 0.45 * k; }
    for (let j = 0; j <= seg; j++) {
      const th = (j / seg) * Math.PI * 2, c = Math.cos(th), sn = Math.sin(th), dx = N[0]! * c + B[0]! * sn, dy = N[1]! * c + B[1]! * sn, dz = N[2]! * c + B[2]! * sn;
      pos.push(pts[i]![0] + dx * rr, pts[i]![1] + dy * rr, pts[i]![2] + dz * rr); nrm.push(dx, dy, dz); alpha.push(f); tos.push(o.tos ? o.tos(s[i]!) : 0); sA.push(s[i]!);
    }
    if (i) for (let j = 0; j < seg; j++) { const a = (i - 1) * (seg + 1) + j, b = i * (seg + 1) + j; idx.push(a, b + 1, b, a, a + 1, b + 1); }
  }
  return { pos, nrm, alpha, tos, s: sA, idx, rings: n, seg };
}

/** A round cap on a tube's end (script2.js: a sphere of the end's radius about its centre, its own normals). */
function capInto(t: Tube, c: readonly number[], r: number, sAt: number, tosAt: number): void {
  const base = t.pos.length / 3, la = 16, lo = 32;
  for (let i = 0; i <= la; i++) for (let j = 0; j <= lo; j++) {
    const th = (i / la) * Math.PI, ph = (j / lo) * Math.PI * 2, d = [Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph)];
    t.pos.push(c[0]! + d[0]! * r, c[1]! + d[1]! * r, c[2]! + d[2]! * r); t.nrm.push(d[0]!, d[1]!, d[2]!); t.alpha.push(1); t.tos.push(tosAt); t.s.push(sAt);
  }
  for (let i = 0; i < la; i++) for (let j = 0; j < lo; j++) { const a = base + i * (lo + 1) + j, b = a + lo + 1; if (i > 0) t.idx.push(a, a + 1, b); if (i < la - 1) t.idx.push(a + 1, b + 1, b); }
}

function geometryOf(t: Tube, from = 0, to = t.pos.length / 3, idx = t.idx): BufferGeometry {
  const g = new BufferGeometry(), sl = (a: number[], k: number) => a.slice(from * k, to * k);
  g.setAttribute('position', new Float32BufferAttribute(sl(t.pos, 3), 3));
  g.setAttribute('normal', new Float32BufferAttribute(sl(t.nrm, 3), 3));
  g.setAttribute('esoA', new Float32BufferAttribute(sl(t.alpha, 1), 1));
  g.setIndex(new Uint32BufferAttribute(idx.map((i) => i - from), 1));
  g.computeBoundingBox();
  return g;
}

/** How much of the stomach's look the duodenum wears at arc length s from the cut (script2.js: all of it at the pylorus, the bowel's own past the duodenal bulb). */
export const stomachShare = (s: number): number => 1 - smooth(0.2, 0.34, s);

let made: Record<'duodenum' | 'bowel' | 'colon', BufferGeometry> | null = null;
/** The gut's three tubes, made once: `duodenum` (from the stomach's cut, open there, to the duodenojejunal flexure), `bowel` (the packed loops and the ileum, capped at the caecum) and `colon` (capped at the caecum, its rectum end
 *  fading). Each call hands out a fresh copy (the organs' tables make their geometry anew on each ask). */
export function gutTubes(): Record<'duodenum' | 'bowel' | 'colon', BufferGeometry> {
  if (!made) {
    const { small, colon, duoEnd } = gutCentrelines();
    const t = tubeFrom(small, { ends: ['open', 'cap'], tos: stomachShare }), ring = t.seg + 1, cut = duoEnd * ring, quads = duoEnd * t.seg * 6;
    const last = small[small.length - 1]!;
    capInto(t, last, last[3], t.s[t.s.length - 1]!, 0);
    // (the duodenum: rings 0..duoEnd; the bowel: rings duoEnd.. and the cap, so the shared ring is in both, the same points and normals)
    const duo = geometryOf(t, 0, cut + ring, t.idx.slice(0, quads));
    duo.setAttribute('tos', new Float32BufferAttribute(t.tos.slice(0, cut + ring), 1));
    const bowel = geometryOf(t, cut, t.pos.length / 3, t.idx.slice(quads));
    const c = tubeFrom(colon, { ends: ['cap', 'fade'], haustra: HAUSTRA }), c0 = colon[0]!;
    capInto(c, c0, c.pos.length ? Math.hypot(c.pos[0]! - c0[0], c.pos[1]! - c0[1], c.pos[2]! - c0[2]) : c0[3], 0, 0);
    made = { duodenum: duo, bowel, colon: geometryOf(c) };
  }
  return { duodenum: made.duodenum.clone(), bowel: made.bowel.clone(), colon: made.colon.clone() };
}
