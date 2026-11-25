// The vein and the side branch that leaves it, each seen from the other (20 Nov: eyes crops of 4089d1a to 73cbe44, "one outline rule at every junction"). The outline of the two tubes together is the outline of their UNION: a vessel draws no
// line, and no fill past its own lumen, where that pixel lies inside the other's lumen. So every vertex of each tube carries where it stands against the other's axis: `nbr` = (signed distance to that axis, the other's radius there), both in scene
// units, and the fragment shader (shaders.ts) takes the pixel's depth inside the other lumen from it, exactly, at every point of the fork, with no windows or distances to line up. Beyond the other tube's ends there is none (its ends are open cuts, not round).
import { NETWORK, NETWORK_BY_ID } from './network.ts';
import { SMOOTH, isPlain } from './smooth-joins.ts';
import { smoothJoinsOn } from './join-mode.ts';
import { REST, coursesOf, type ShapeState } from './shape.ts';
import { radiusAtU } from './tubes.ts';
import { cavaPieceOf, landsOnCava, opensIntoCava, trunkMateOf } from './fades.ts';

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
  const f = forkMateOf(id) ?? cavaMateOf(id) ?? trunkMateOf(id);   // (the middle hepatic vein sees the common trunk it opens into: fades.ts trunkMateOf)
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

/** Floats per vertex of the `nbr` attribute: (distance from the mate's axis, the mate's radius there, how far past the mate's nearer end). */
export const NBR_STRIDE = 3;
/** `z` of a vertex against the cava, which carries on past its pieces' ends: "far inside its length" for the shader. */
export const NBR_NO_END = -1e3;

/** `nbr` for every vertex of vessel `id`'s tube (`positions`: its xyz, as built), NBR_STRIDE floats each: (x, y, z).
 *  x: the distance of the vertex from its fork mate's axis in the figure's plane, signed (positive left of the mate's heading) with ONE mate and unsigned with several (see below).
 *  y: the mate's radius at the nearest point of its axis, never 0 (past the mate's end it is the radius there).
 *  z: how far the vertex lies past the mate's NEARER END, along the end segment's own line, in scene units: negative inside the mate's length, 0 on its end plane, positive past it. It is LINEAR in the vertex position (the larger of the two ends' planes), so the GPU's
 *  blend of it is exact; the radius is not (it ramps from its value to 0 past an end in the old encoding, and the blend read "inside the lumen" a whole triangle past the end: the pale stepped line in a vein's shade band, Mohammad 22 Nov). The shader cuts the ink drop and the shade pull
 *  by z (shaders.ts nbrK, nbrT). Against the cava (it goes on past its pieces' ends, into the next piece) z is NBR_NO_END.
 *  With several mates (a trunk with branches on it, a branch on a trunk of two pieces) each vertex takes the one it lies deepest in. Null for a vessel with no mate. */
export function neighbourAttr(id: string, positions: ArrayLike<number>, state: ShapeState = REST): Float32Array | null {
  const cava = forkMateOf(id) == null && cavaMateOf(id) != null;
  const axes = nbrMatesOf(id).map((m) => axisOf(m, state)).filter((a): a is MateAxis => !!a);
  if (!axes.length) return null;
  const count = positions.length / 3, out = new Float32Array(count * NBR_STRIDE);
  for (let v = 0; v < count; v++) {
    const x = positions[v * 3]!, y = positions[v * 3 + 1]!;
    let bestDepth = Infinity, bd = 0, br = 0, bz = NBR_NO_END, first = true;
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
      // (the cava goes on past its piece's ends, into the next piece: past an end its axis is the end segment's own line carried on, not the end point. Measured to the end point, the signed distance flipped sign across that line's extension, +d on one
      //  vertex and -d on the next, and the GPU's blend read "on the cava's axis" between them: the placed hepatic and renal veins open at the very end of their cava piece (LHV_IVC at IVC_IS's top, LRV_IVC at IVC_IS_1's foot), and a band of their mouth
      //  read inside the lumen. On the carried-on line the distance is linear in the vertex, so the blend is exact.)
      const pd = past && cava ? Math.abs(dx * (y - ay) - dy * (x - ax)) / (Math.hypot(dx, dy) || 1e-12) : Math.sqrt(best);
      const dist = side * pd, rad = R[i]! + (R[i + 1]! - R[i]!) * bt;
      const depth = past && !cava ? Infinity : Math.abs(dist) - rad;   // (how far inside this mate's lumen: negative is inside; the cava goes on past its piece's ends, a vein that opens near one is inside it there too)
      // how far past the nearer end, on each end's own segment line: the larger of the two
      let z = NBR_NO_END;
      if (!cava) {
        const f0x = P[1]![0]! - P[0]![0]!, f0y = P[1]![1]! - P[0]![1]!, l0 = Math.hypot(f0x, f0y) || 1e-12;
        const eX = P[n - 1]![0]! - P[n - 2]![0]!, eY = P[n - 1]![1]! - P[n - 2]![1]!, l1 = Math.hypot(eX, eY) || 1e-12;
        z = Math.max(-((x - P[0]![0]!) * f0x + (y - P[0]![1]!) * f0y) / l0, ((x - P[n - 1]![0]!) * eX + (y - P[n - 1]![1]!) * eY) / l1);
      }
      if (first || depth < bestDepth) { bestDepth = depth; bd = dist; br = rad; bz = z; first = false; }
    }
    // (with several mates the vertices of one triangle can read different mates, whose signs (sides of their headings) differ: the GPU's blend of a +0.02 and a -0.6 passes through 0 between them, "on the other tube's axis", deep inside a lumen that is not there, and the tube
    //  dropped a dotted row of pixels along its edge (Mohammad, 22 Nov, splenic vein; simulated on the real tubes: SV_CONF, PV_TRUNK_1). The shader only reads |x|, so such a vertex carries it unsigned and the blend never crosses zero. One mate keeps the sign: it is the same
    //  mate over the whole tube, so its blend is exact where a mate's lumen lies between a triangle's vertices.)
    out[v * NBR_STRIDE] = axes.length > 1 ? Math.abs(bd) : bd; out[v * NBR_STRIDE + 1] = br; out[v * NBR_STRIDE + 2] = bz;
  }
  return out;
}
