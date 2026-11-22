// The Lobule's bile, laid out as the 2D app lays it (lobule-bile.js addBile at the pinned 2D commit; Mohammad, 20 Nov 2026: "check the 2D version to see how the bile
// ducts are laid ... and try to mimick"). Bile runs against the blood, central vein to portal tract: one channel per hepatocyte plate starts against its sinusoid, in the
// space of Disse, about a quarter of the way out from the central vein, tapering in from nothing, and runs beside the sinusoid (never into or under it), thickening outward.
// At the limiting plate it crosses under the inlet venule and the lymphatic as a short canal of Hering and meets, square, the duct that runs along the lobule's edge just
// outside the lymphatic. Each half of an edge has one such duct, from the middle of the edge to its corner's bile ductule. The duct on the ductule's own side curves in from
// below; the one on the far side curves down between the portal venule and the lymphatic's disc into the top of the ductule.
// Pure numbers, in lobule radii (R = 1, the 2D app's y-down plane), like geometry.ts. 2D's pixel floors (a 2 px gap, a 0.9 px radius) are dropped: here R is 1.
import { type Course, type LobuleNet, type P2, N, at, curve } from './geometry.ts';

export interface BileCourse {
  /** 'bs': a plate's channel with its canal of Hering; 'bh': a half edge's duct into the ductule. */
  kind: 'bs' | 'bh';
  /** N points, evenly spaced, in the bile's own direction (toward the ductule). */
  pts: P2[];
  /** The radius at each point (lobule radii). */
  radius: number[];
  /** The tract it drains to (ducts only). */
  tri?: number;
}

const N0 = 8;
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (a: number, b: number, x: number) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const unit = (x: number, y: number): P2 => { const L = Math.hypot(x, y) || 1; return [x / L, y / L]; };
const smoothPoly = (P: P2[], n = 1): P2[] => { let Q = P; for (let k = 0; k < n; k++) { const R = Q; Q = R.map((q, i) => (i === 0 || i === R.length - 1 ? q : [(R[i - 1]![0] + 2 * q[0] + R[i + 1]![0]) / 4, (R[i - 1]![1] + 2 * q[1] + R[i + 1]![1]) / 4] as P2)); } return Q; };
const nearIdx = (pts: readonly P2[], x: number, y: number) => { let b = 0, bd = Infinity; for (let i = 0; i < pts.length; i++) { const d = Math.hypot(pts[i]![0] - x, pts[i]![1] - y); if (d < bd) { bd = d; b = i; } } return b; };
const RS_K: Record<string, number> = { s0: 1, s1: 1.15, s2: 1.3 };
const distToPath = (q: readonly number[], P: readonly P2[]): number => { let best = Infinity; for (let i = 0; i + 1 < P.length; i++) { const a = P[i]!, b = P[i + 1]!, bx = b[0] - a[0], by = b[1] - a[1], bb = bx * bx + by * by, t = bb ? Math.min(1, Math.max(0, ((q[0]! - a[0]) * bx + (q[1]! - a[1]) * by) / bb)) : 0; best = Math.min(best, Math.hypot(q[0]! - a[0] - t * bx, q[1]! - a[1] - t * by)); } return best; };
const rhoOf = (pts: readonly P2[]) => pts.map(([x, y]) => Math.hypot(x, y));

type LanePt = P2 & { bx?: number; by?: number; hug?: number };

const bileMemo = new WeakMap<LobuleNet, BileCourse[]>();
/** The bile's courses for a lobule (2D's addBile, the same rules and numbers). Worked out once per net: the flat view, the 3D lobule's unwelded build and the weld courses all ask for it, and each time was
 *  about 30 ms of the vessels' steps (L4, 21 Nov). The result is read only. */
export function buildBile(net: LobuleNet): BileCourse[] {
  let out = bileMemo.get(net);
  if (!out) { out = layBile(net); bileMemo.set(net, out); }
  return out;
}
function layBile(net: LobuleNet): BileCourse[] {
  const R = 1, cx = 0, cy = 0, rsN = net.rsN, rs0 = net.rs0, tubes = net.courses, triads = net.triads, C = net.corners;
  const L0 = tubes.filter((c) => c.kind === 's0'), inlets = tubes.filter((c) => c.kind === 'in');
  const out: BileCourse[] = [];
  const sideOf = (ch: Course, par: Course) => { const dP = unit(par.pts[0]![0] - par.pts[1]![0], par.pts[0]![1] - par.pts[1]![1]), dC = unit(ch.pts[N - 2]![0] - ch.pts[N - 1]![0], ch.pts[N - 2]![1] - ch.pts[N - 1]![1]); return dP[0] * dC[1] - dP[1] * dC[0] >= 0 ? 1 : -1; };
  const lanePts = (T: Course, side: number, from: number): LanePt[] => {
    const P = T.pts, res: LanePt[] = [], off = rsN * (RS_K[T.kind] ?? 1) * 1.25 + rs0 * 0.62 + R * 0.008, hug = (rsN * (RS_K[T.kind] ?? 1) + rs0 * 0.35) / off;
    for (let i = N - 1 - from; i >= 0; i--) {
      const a = P[Math.min(N - 1, i + 1)]!, b = P[Math.max(0, i - 1)]!, [tx, ty] = unit(b[0] - a[0], b[1] - a[1]);
      res.push(Object.assign([P[i]![0] - ty * side * off, P[i]![1] + tx * side * off] as P2, { bx: P[i]![0], by: P[i]![1], hug }));
    }
    return res;
  };
  const outN = (inl: Course, i: number): P2 => { const a = inl.pts[Math.max(0, i - 1)]!, b = inl.pts[Math.min(N - 1, i + 1)]!, [tx, ty] = unit(b[0] - a[0], b[1] - a[1]); let nx = -ty, ny = tx; if (nx * (inl.pts[i]![0] - cx) + ny * (inl.pts[i]![1] - cy) < 0) { nx = -nx; ny = -ny; } return [nx, ny]; };
  const rIn = R * 0.012, start = R * 0.25;
  const taken: P2[][] = [];
  const halves = new Map<number, { inl: Course; conn: { pts: P2[]; P: P2; nO: P2; ic: number }[] }>();
  L0.forEach((leaf, li) => {
    const e = leaf.edge!, k = li % N0, h = k < N0 / 2 ? 0 : 1, jj = h === 0 ? k : N0 - 1 - k;
    const inl = h === 0 ? inlets[e * 2]! : inlets[((e + 1) % 6) * 2 + 1]!;
    const A = C[e]!, B = C[(e + 1) % 6]!, ed = unit(B[0] - A[0], B[1] - A[1]), want = h === 0 ? 1 : -1;
    const P1 = leaf.parent != null ? tubes[leaf.parent]! : null, P2c = P1 && P1.parent != null ? tubes[P1.parent]! : null;
    const q0 = leaf.pts[0]!, q1 = leaf.pts[1]!, [tx, ty] = unit(q0[0] - q1[0], q0[1] - q1[1]);
    const side = (-ty * ed[0] + tx * ed[1]) * want >= 0 ? 1 : -1;
    const far = (q: P2) => Math.hypot(q[0] - cx, q[1] - cy) > start;
    let poly: LanePt[] = [];
    if (P1 && sideOf(leaf, P1) === side) {
      const chain = [P1, leaf]; if (P2c && sideOf(P1, P2c) === side) chain.unshift(P2c);
      chain.forEach((T, ci) => { const Q = lanePts(T, side, 0).filter(far); poly = poly.concat(ci === 0 || !poly.length ? Q : Q.slice(1)); });
    } else poly = lanePts(leaf, side, Math.ceil(0.14 * N)).filter(far);
    if (poly.length < 3) return;
    // it starts against its sinusoid, in the space of Disse, and eases out to its lane over the first stretch
    let eased: P2[];
    { let s = 0; eased = poly.map((q, i) => { if (i) s += Math.hypot(q[0] - poly[i - 1]![0], q[1] - poly[i - 1]![1]); if (q.bx == null) return [q[0], q[1]] as P2; const f = lerp(q.hug!, 1, smooth(0, R * 0.14, s)); return [q.bx + (q[0] - q.bx) * f, q.by! + (q[1] - q.by!) * f] as P2; }); }
    // it never starts inside another blood vessel: the lane begins where it first stands clear of every sinusoid and cross-link but its own chain (Mohammad, 20 Nov 2026: bile went through blood vessels)
    { const own = new Set<number>([leaf.id, ...(P1 ? [P1.id] : []), ...(P2c ? [P2c.id] : [])]), others = tubes.filter((t) => (t.kind === 's0' || t.kind === 's1' || t.kind === 's2' || t.kind === 'an') && !own.has(t.id));
      const clear = (q: P2) => others.every((o) => distToPath(q, o.pts) >= rsN * (o.kind === 'an' ? 0.68 : (RS_K[o.kind] ?? 1)) + R * 0.0005);
      let k = 0; while (k < eased.length - 3 && !clear(eased[k]!)) k++;
      // (two lanes that share a stretch of the chain run on one path: the later one begins where it parts from the earlier, not on it, so no two hairlines lie on each other or end on each other)
      while (k < eased.length - 3 && taken.some((L) => distToPath(eased[k]!, L) < R * 0.004)) k++;
      if (k > 0) eased = eased.slice(k);
      taken.push(eased); }
    // near the edge it leaves its sinusoid for the plate's centre line and ends just inside the inlet venule
    const nb = L0[li + (h === 0 ? 1 : -1)], mid = jj === N0 / 2 - 1 || !nb || nb.edge !== e ? inl.pts[N - 1]! : nb.pts[0]!;
    const ic = nearIdx(inl.pts, (q0[0] + mid[0]) / 2, (q0[1] + mid[1]) / 2), P = inl.pts[ic]!, nO = outN(inl, ic), dEnd = rIn + R * 0.012;
    const pts: P2[] = [];
    for (const q of eased) {
      const d = (P[0] - q[0]) * nO[0] + (P[1] - q[1]) * nO[1];
      if (d <= dEnd) break;
      const w = 1 - smooth(R * 0.035, R * 0.1, d);
      pts.push([q[0] + w * (P[0] - nO[0] * d - q[0]), q[1] + w * (P[1] - nO[1] * d - q[1])]);
    }
    if (pts.length < 3) return;
    pts.push([P[0] - nO[0] * dEnd, P[1] - nO[1] * dEnd]);
    if (!halves.has(inl.id)) halves.set(inl.id, { inl, conn: [] });
    halves.get(inl.id)!.conn.push({ pts, P, nO, ic });
  });
  // one duct per half edge, just outside the lymphatic, from the middle of the edge to the corner's ductule; the canals join it square
  for (const { inl, conn } of halves.values()) {
    const tr = triads[inl.tri!]!, o = R * 0.055, leg: P2[] = [], D = tr.bd;
    const icMin = Math.min(...conn.map((c) => c.ic)), iEnd = Math.max(Math.round(0.1 * (N - 1)), icMin - Math.round(0.06 * (N - 1)));
    const outAt = (i: number): P2 => { const n = outN(inl, i), q = inl.pts[i]!; return [q[0] + n[0] * o, q[1] + n[1] * o]; };
    for (let i = N - 1; i >= iEnd; i--) leg.push(outAt(i));
    const legS = smoothPoly(leg, 2), Pe = legS[legS.length - 1]!, Pp = legS[legS.length - 3]!, tc = unit(Pe[0] - Pp[0], Pe[1] - Pp[1]);
    const bis: P2 = [Math.cos(tr.a), Math.sin(tr.a)], dd: P2 = [D[0] - tr.x, D[1] - tr.y], pd = dd[0] * bis[0] + dd[1] * bis[1], pp = unit(dd[0] - bis[0] * pd, dd[1] - bis[1] * pd);
    const sk = (sx: number, sy: number): P2 => [tr.x + (-bis[0] * sx + pp[0] * sy) * R / 1000, tr.y + (-bis[1] * sx + pp[1] * sy) * R / 1000];
    const bez = (A: P2, a1: P2, b1: P2, B2: P2) => { for (let k = 1; k <= 14; k++) { const u = k / 14, v = 1 - u; legS.push([v * v * v * A[0] + 3 * v * v * u * a1[0] + 3 * v * u * u * b1[0] + u * u * u * B2[0], v * v * v * A[1] + 3 * v * v * u * a1[1] + 3 * v * u * u * b1[1] + u * u * u * B2[1]]); } };
    if (inl === inlets[tr.i * 2]) {
      // the far side: down between the portal venule and the lymphatic's disc, under the lymphatics, into the top of the ductule
      const c2 = sk(-52, -28), M = sk(-58, 8), d1 = Math.hypot(M[0] - Pe[0], M[1] - Pe[1]);
      bez(Pe, [Pe[0] + tc[0] * d1 * 0.4, Pe[1] + tc[1] * d1 * 0.4], c2, M);
      bez(M, [2 * M[0] - c2[0], 2 * M[1] - c2[1]], sk(-58, 52), D);
    } else {
      // the ductule's own side: along its edge, then into the ductule from below
      const d1 = Math.hypot(D[0] - Pe[0], D[1] - Pe[1]);
      bez(Pe, [Pe[0] + tc[0] * d1 * 0.4, Pe[1] + tc[1] * d1 * 0.4], sk(-28, 98), D);
    }
    const legPts = curve((u) => at(legS, u)).pts;
    out.push({ kind: 'bh', pts: legPts, radius: legPts.map((_, i) => R * lerp(0.004, 0.0078, i / (N - 1))), tri: tr.i });
    for (const c of conn) {
      const tgt = outAt(c.ic), Lp = legPts[nearIdx(legPts, tgt[0], tgt[1])]!;
      const cp: P2[] = [...c.pts, [c.P[0], c.P[1]], [c.P[0] + c.nO[0] * R * 0.03, c.P[1] + c.nO[1] * R * 0.03], Lp];
      const pts = curve((u) => at(smoothPoly(cp, 1), u)).pts, rho = rhoOf(pts);
      out.push({ kind: 'bs', pts, radius: pts.map((_, i) => R * lerp(0.0004, 0.0036, smooth(0.22, 1, rho[i]!)) * smooth(0, 0.3, i / (N - 1)) ** 1.5) });
    }
  }
  return out;
}
