// Where a braid's strands land on the wall of a host (Mohammad, 22 Nov: the retroperitoneal veins "aren't welded into the IVC ... they should just fan out with smooth gradient and seamless joint and each fan fades").
// The 2D braid (coil.ts braid) brings every strand back to its trunk's one point at each end, and a strand sewn onto a host (shunt-ends.ts) sinks to the host's AXIS: the three strands piled into one pointed wedge inside the
// host, their outlines crossing in it. A strand end that lands on a host (and does not leave a node as one bundle, which a junction skin welds: braid-arm.ts) now fans out instead: over its last stretch each strand is moved
// along the host's own axis so it lands beside its neighbours, side by side in the order it already lay (no crossing), and the host's wall takes it from there (the cava's cut and colour rule, neighbour.ts `cavaMateOf`).
// Pure: points in, points out.
type Vec3 = [number, number, number];

/** How far apart (in the strand's own end radii, centre to centre) neighbouring strands land. */
export const FAN_PITCH = 2.7;
/** Over how many end radii from the landing the fan opens (smooth: no kink), and the most of the strand's own length it may take. */
export const FAN_REACH = 12;
/** Where (end radii back from the landing) the order the strands lie across the host is read: close, so the fan adds no crossing of its own. */
export const FAN_ORDER_AT = 5;
export const FAN_MAX_SHARE = 0.3;
/** The bundle test of braid-arm.ts (`BUNDLE_REACH_R` radii from the end, strands within `BUNDLE_TOL_R` radii of one another), written on points so it can be asked of the strands before they are fanned. */
export const BUNDLE_REACH = 4;
export const BUNDLE_TOL = 0.15;

const sub = (a: readonly number[], b: readonly number[]): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: readonly number[], b: readonly number[]): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a: Vec3): Vec3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
/** The points of `pts` in order from the end asked for (end 0: the start). */
const fromEnd = <T,>(pts: readonly T[], end: 0 | 1): T[] => (end ? [...pts].reverse() : [...pts]);
/** The cumulative chord length from the end, per point. */
function arcs(p: readonly Vec3[]): number[] { const a = [0]; for (let i = 1; i < p.length; i++) a.push(a[i - 1]! + Math.hypot(...sub(p[i]!, p[i - 1]!))); return a; }
function atArc(p: readonly Vec3[], a: readonly number[], d: number): Vec3 {
  for (let i = 1; i < p.length; i++) if (a[i]! >= d || i === p.length - 1) { const l = a[i]! - a[i - 1]!, t = l > 0 ? Math.min(1, Math.max(0, (d - a[i - 1]!) / l)) : 0; return [p[i - 1]![0] + (p[i]![0] - p[i - 1]![0]) * t, p[i - 1]![1] + (p[i]![1] - p[i - 1]![1]) * t, p[i - 1]![2] + (p[i]![2] - p[i - 1]![2]) * t]; }
  return p[0]!;
}

/** Whether the strands (point lists, all running between the same two ends) leave end `end` as one bundle: within BUNDLE_TOL trunk radii of one another over the first BUNDLE_REACH radii (braid-arm.ts braidRootEnds, on points). */
export function leaveAsBundle(strands: readonly (readonly Vec3[])[], end: 0 | 1, trunkR: number): boolean {
  const ps = strands.map((s) => fromEnd(s, end)), as = ps.map(arcs);
  for (let s = 1; s <= BUNDLE_REACH; s++) {
    const at = ps.map((p, i) => atArc(p, as[i]!, s * trunkR));
    for (const p of at) for (const q of at) if (Math.hypot(...sub(p, q)) > BUNDLE_TOL * trunkR) return false;
  }
  return true;
}

/** The strands with their end `end` fanned along `hostDir` (the host's axis there): strand k of n lands at (rank - (n-1)/2) x pitch from the landing point, rank being its order across the host as it comes in, so none crosses another; the move is zero
 *  FAN_REACH end radii back and eases in (smoothstep), so the strand never kinks. `endR` is a strand's own radius at the end. Returns the strands unchanged (the same arrays) when the host runs along the way in, or there is one strand. */
export function fanEnd(strands: readonly (readonly Vec3[])[], end: 0 | 1, hostDir: readonly [number, number, number], endR: number): Vec3[][] {
  const n = strands.length;
  if (n < 2 || !(endR > 0)) return strands.map((s) => [...s]);
  const ps = strands.map((s) => fromEnd(s, end)), as = ps.map(arcs);
  const reach = Math.min(FAN_REACH * endR, FAN_MAX_SHARE * Math.min(...as.map((a) => a[a.length - 1]!)));
  // the way in (from a little back to the end) and the host's axis across it: the fan opens along that
  const e = ps[0]![0]!, back = atArc(ps[0]!, as[0]!, reach * 0.5), inDir = norm(sub(e, back));
  const along = dot(hostDir, inDir), lat0: Vec3 = [hostDir[0] - along * inDir[0], hostDir[1] - along * inDir[1], hostDir[2] - along * inDir[2]];
  if (Math.hypot(...lat0) < 0.3) return strands.map((s) => [...s]);
  const lat = norm(lat0);
  // the order each strand comes in across the host, read where the fan starts
  const side = ps.map((p, i) => dot(sub(atArc(p, as[i]!, Math.min(reach, FAN_ORDER_AT * endR)), e), lat));
  const order = side.map((_, i) => i).sort((a, b) => side[a]! - side[b]!), rank = new Map(order.map((k, r) => [k, r]));
  const out = ps.map((p, i): Vec3[] => {
    const d = (rank.get(i)! - (n - 1) / 2) * FAN_PITCH * endR;
    return p.map((q, k): Vec3 => {
      const t = 1 - as[i]![k]! / reach;
      if (!(t > 0)) return q;
      const w = t * t * (3 - 2 * t);
      return [q[0] + lat[0] * d * w, q[1] + lat[1] * d * w, q[2] + lat[2] * d * w];
    });
  });
  return out.map((p) => fromEnd(p, end));
}
