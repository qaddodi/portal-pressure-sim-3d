// The vein and the side branch that leaves it, each seen from the other (20 Nov: eyes crops of 4089d1a to 73cbe44, "one outline rule at every junction"). The outline of the two tubes together is the outline of their UNION: a vessel draws no
// line, and no fill past its own lumen, where that pixel lies inside the other's lumen. So every vertex of each tube carries where it stands against the other's axis: `nbr` = (signed distance to that axis, the other's radius there), both in scene
// units, and the fragment shader (shaders.ts) takes the pixel's depth inside the other lumen from it, exactly, at every point of the fork, with no windows or distances to line up. Beyond the other tube's ends there is none (its ends are open cuts, not round).
import { NETWORK, NETWORK_BY_ID } from './network.ts';
import { SMOOTH, isPlain } from './smooth-joins.ts';
import { smoothJoinsOn } from './join-mode.ts';
import { REST, coursesOf, type ShapeState } from './shape.ts';
import { radiusAtU } from './tubes.ts';
import { cavaPieceOf, landsOnCava, opensIntoCava } from './fades.ts';

/** The side branches (feeders that join into a vein and leave it as one more tube) of each vein: host id to its branch ids. */
export const SIDE_BRANCHES: ReadonlyMap<string, readonly string[]> = (() => {
  const m = new Map<string, string[]>();
  for (const v of NETWORK) {
    const p = v.plan;
    if (p?.kind !== 'feeder' || !v.feeder || p.list.length !== 1 || p.list[0]!.join == null) continue;
    const l = m.get(v.feeder.host) ?? []; l.push(v.id); m.set(v.feeder.host, l);
  }
  return m;
})();

/** The vessel `id` forms a fork with (a vein's side branch; a side branch's vein), or null. */
export function forkMateOf(id: string): string | null {
  const kids = SIDE_BRANCHES.get(id);
  if (kids) return kids[0]!;
  const host = NETWORK_BY_ID.get(id)?.feeder?.host;
  return host && SIDE_BRANCHES.get(host)?.includes(id) ? host : null;
}

/** The cava is the "other tube" of a hepatic vein that opens into it: the vein is cut away where it lies inside the cava's lumen (shaders.ts cavaCut), exactly at the wall, so it opens into the cava with a clean edge. */
export const cavaMateOf = (id: string): string | null => (opensIntoCava(id) || landsOnCava(id) ? cavaPieceOf(id) : null);

/** THE JUNCTIONS: a plain vessel that ends on a trunk (smooth-joins.ts `attach`: the coronary vein and the splenic vein on the portal vein, the left portal vein on the hilum, the inferior mesenteric vein, the epigastric vein, the left hepatic artery) is a fork like every other:
 *  the branch and the trunk's pieces it ends on each see the others, so the outline of the whole is the outline of the union, exactly, and no collar or pad is needed to hide a seam. Vessel id to the ids it forks with. */
export const JUNCTION_MATES: ReadonlyMap<string, readonly string[]> = (() => {
  const m = new Map<string, string[]>();
  const add = (a: string, b: string): void => { const l = m.get(a) ?? []; if (!l.includes(b)) l.push(b); m.set(a, l); };
  for (const [id, sj] of SMOOTH) {
    const v = NETWORK_BY_ID.get(id);
    if (!v || !isPlain(v)) continue;
    for (const end of [0, 1] as const) for (const h of sj.attach[end] ?? []) { if (!NETWORK_BY_ID.has(h)) continue; add(id, h); add(h, id); }
  }
  return m;
})();

/** Every vessel `id` is a fork mate of (its side branch or vein, the cava it opens into, or the vessels it meets at a junction), first the one its live width is read against. */
export function nbrMatesOf(id: string): readonly string[] {
  const f = forkMateOf(id) ?? cavaMateOf(id);
  return f ? [f] : smoothJoinsOn() ? JUNCTION_MATES.get(id) ?? [] : [];   // (the junctions are forks only with Smooth vessel joins on: off, the figure is the 2D rule's own)
}

interface MateAxis { P: readonly (readonly number[])[]; R: number[]; n: number }
function axisOf(id: string, state: ShapeState): MateAxis | null {
  const md = NETWORK_BY_ID.get(id);
  if (!md) return null;
  const c = coursesOf(md, state).reduce((a, b) => (b.radius > a.radius ? b : a));
  const P = c.pts, n = P.length;
  if (n < 2) return null;
  const cum = [0];
  for (let i = 1; i < n; i++) cum.push(cum[i - 1]! + Math.hypot(P[i]![0] - P[i - 1]![0], P[i]![1] - P[i - 1]![1], P[i]![2] - P[i - 1]![2]));
  const L = cum[n - 1]!;
  if (L <= 0) return null;
  return { P, R: P.map((_, i) => radiusAtU(c, cum[i]! / L, L)), n };
}

/** `nbr` for every vertex of vessel `id`'s tube (`positions`: its xyz, as built): (signed distance of the vertex from its fork mate's axis in the figure's plane, positive left of the mate's heading; the mate's radius there; 0 where the vertex lies past the mate's ends).
 *  With several mates (a trunk with branches on it, a branch on a trunk of two pieces) each vertex takes the one it lies deepest in. Null for a vessel with no mate. */
export function neighbourAttr(id: string, positions: ArrayLike<number>, state: ShapeState = REST): Float32Array | null {
  const cava = forkMateOf(id) == null && cavaMateOf(id) != null;
  const axes = nbrMatesOf(id).map((m) => axisOf(m, state)).filter((a): a is MateAxis => !!a);
  if (!axes.length) return null;
  const count = positions.length / 3, out = new Float32Array(count * 2);
  for (let v = 0; v < count; v++) {
    const x = positions[v * 3]!, y = positions[v * 3 + 1]!;
    let bestDepth = Infinity, bd = 0, br = 0, first = true;
    for (const { P, R, n } of axes) {
      let best = Infinity, bs = 0, bt = 0, braw = 0;
      for (let i = 0; i < n - 1; i++) {
        const ax = P[i]![0]!, ay = P[i]![1]!, dx = P[i + 1]![0]! - ax, dy = P[i + 1]![1]! - ay, dl = dx * dx + dy * dy || 1e-12;
        const raw = ((x - ax) * dx + (y - ay) * dy) / dl, t = Math.min(1, Math.max(0, raw));
        const d = (x - (ax + dx * t)) ** 2 + (y - (ay + dy * t)) ** 2;
        if (d < best) { best = d; bs = i; bt = t; braw = raw; }
      }
      const i = bs, ax = P[i]![0]!, ay = P[i]![1]!, dx = P[i + 1]![0]! - ax, dy = P[i + 1]![1]! - ay;
      const side = dx * (y - ay) - dy * (x - ax) >= 0 ? 1 : -1;
      const past = (i === 0 && braw < 0) || (i === n - 2 && braw > 1);
      const dist = side * Math.sqrt(best), rad = past && !cava ? 0 : R[i]! + (R[i + 1]! - R[i]!) * bt;   // (the cava goes on past its piece's ends, into the next piece: a vein that opens near one is inside it there too)
      const depth = rad > 0 ? Math.abs(dist) - rad : Infinity;   // (how far inside this mate's lumen: negative is inside)
      if (first || depth < bestDepth) { bestDepth = depth; bd = dist; br = rad; first = false; }
    }
    out[v * 2] = bd; out[v * 2 + 1] = br;
  }
  return out;
}
