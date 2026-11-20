// The vein a clot lies in, AS DRAWN: its pieces' own centrelines (the courses the tubes are built on, vessels/centreline.ts: depth, ends fitted to their trunks, the branching veins' taper),
// the lumen's radius along them (tubes.ts radiusAtU), how opaque the vein is there (vessels/fade-alpha.ts) and which piece each place belongs to, so the live width of that piece
// (vessels/live-width.ts) can scale it. A clot is sized from THIS and nothing else (Mohammad, 20 Nov: "the clots don't fill inside the blood vessels at all"). The root cause was that it was
// sized from the vein's 2D course and the radius it was built at: a hepatic vein the engine narrows, tapers into the liver and fades there was drawn thin and faint, and its clot a thick solid
// capsule lying over and beyond it.
import { Vector3 } from 'three';
import { JUNCTION_PIECES } from '../../engine/hales/portal/topology.js';
import { indexOf } from '../../engine/vessel-data.ts';
import { NETWORK_BY_ID } from '../vessels/network.ts';
import { centrelineOf } from '../vessels/centreline.ts';
import { vesselAlphaAt } from '../vessels/fade-alpha.ts';
import { widthSwell } from '../vessels/live-width.ts';
import { neighbourAttr } from '../vessels/neighbour.ts';
import { CAVA_RECEDE, cavaPieceOf, opensIntoCava } from '../vessels/fades.ts';
import { cavaRamp } from '../vessels/fade-alpha.ts';

/** Samples along each piece (the clot reads its place between them). */
export const HOST_SAMPLES = 48;

export interface HostPiece { id: string; lens: number; baseD: number; widthKind: 0 | 1 | 2 }
export interface Host {
  id: string;
  pieces: HostPiece[];
  pts: Vector3[];
  /** the lumen's radius at each point at the diameter the tube was built at, scene units */
  R: number[];
  /** the vein's resting opacity at each point */
  A: number[];
  /** the piece each point is on */
  piece: number[];
  /** the arc length at each point, and the whole */
  s: number[];
  length: number;
}

const cache = new Map<string, Host | null>();

/** The drawn vein of host `id` (a vein cut in pieces is one vein), or null for an id with no drawn course. */
export function drawnHost(id: string): Host | null {
  if (cache.has(id)) return cache.get(id)!;
  const ids = ((JUNCTION_PIECES as Record<string, string[]>)[id] ?? [id]).filter((q) => NETWORK_BY_ID.has(q));
  const pieces: HostPiece[] = [], pts: Vector3[] = [], R: number[] = [], A: number[] = [], piece: number[] = [];
  for (const q of ids) {
    const v = NETWORK_BY_ID.get(q)!, c = centrelineOf(q);
    if (!c) continue;
    const k = pieces.length, from = pts.length;
    pieces.push({ id: q, lens: indexOf(v.lensId), baseD: v.baseD, widthKind: v.widthKind });
    for (let i = 0; i < HOST_SAMPLES; i++) {
      const u = i / (HOST_SAMPLES - 1), p = c.pointAt(u), at = new Vector3(p[0], p[1], p[2]);
      if (pts.length && pts[pts.length - 1]!.distanceTo(at) < 1e-6) continue;   // (the pieces share their joint)
      pts.push(at); R.push(c.radiusAt(u)); A.push(vesselAlphaAt(q, u, p[0], p[1])); piece.push(k);
    }
    if (opensIntoCava(q)) {
      // (a vein that merges into the faded cava comes to the cava's opacity at its wall, by its distance from the wall, as the shader does it: shaders.ts fadeHere)
      const flat = new Float32Array((pts.length - from) * 3);
      for (let i = from; i < pts.length; i++) { flat[(i - from) * 3] = pts[i]!.x; flat[(i - from) * 3 + 1] = pts[i]!.y; flat[(i - from) * 3 + 2] = pts[i]!.z; }
      const nb = neighbourAttr(q, flat);
      if (nb) for (let i = from; i < pts.length; i++) {
        const Rc = nb[(i - from) * 2 + 1]!, cd = Rc - Math.abs(nb[(i - from) * 2]!);
        if (Rc > 0) A[i] = A[i]! + (CAVA_RECEDE - A[i]!) * cavaRamp(cd / Rc);
      }
    }
  }
  let out: Host | null = null;
  if (pts.length >= 2) {
    const s = [0];
    for (let i = 1; i < pts.length; i++) s.push(s[i - 1]! + pts[i]!.distanceTo(pts[i - 1]!));
    out = { id, pieces, pts, R, A, piece, s, length: s[s.length - 1]! };
  }
  cache.set(id, out);
  return out;
}

/** Each piece's live swell (its drawn width over the width it was built at) for the engine's diameters `D` (per edge, mm); 1 each where `D` is not known. */
export type Swells = number[] & { /** the swell of the cava piece a vein that opens into the cava meets (1 for any other vein) */ cava?: number };
export function swellsOf(h: Host, D: ArrayLike<number> | null | undefined): Swells {
  const out: Swells = h.pieces.map((p) => widthSwell(p.widthKind, p.baseD, D ? D[p.lens] : undefined));
  const last = h.pieces[h.pieces.length - 1], cm = last && opensIntoCava(last.id) ? NETWORK_BY_ID.get(cavaPieceOf(last.id)) : undefined;
  if (cm) out.cava = widthSwell(cm.widthKind, cm.baseD, D ? D[indexOf(cm.lensId)] : undefined);
  return out;
}

export interface HostPoint { p: Vector3; t: Vector3; /** the live lumen radius */ r: number; a: number }

/** The vein at shares `shares` (0 to 1) of its arc length: the point, its heading, the lumen's live radius there (the piece's swell applied) and the vein's opacity. */
export function hostAt(h: Host, swells: readonly number[], shares: readonly number[]): HostPoint[] {
  const out: HostPoint[] = [];
  let k = 1;
  for (const sh of shares) {
    const d = Math.min(1, Math.max(0, sh)) * h.length;
    k = 1; while (k < h.s.length - 1 && h.s[k]! < d) k++;
    const a = h.s[k - 1]!, span = h.s[k]! - a || 1, w = Math.min(1, Math.max(0, (d - a) / span));
    const p = h.pts[k - 1]!.clone().lerp(h.pts[k]!, w), t = h.pts[k]!.clone().sub(h.pts[k - 1]!);
    if (t.lengthSq() < 1e-14) t.set(1, 0, 0);
    // (the swell of the piece the place is on; across a joint the two pieces' swells blend over the one step, as the shader's smooth joins do)
    const s0 = swells[h.piece[k - 1]!] ?? 1, s1 = swells[h.piece[k]!] ?? 1;
    out.push({ p, t: t.normalize(), r: (h.R[k - 1]! + (h.R[k]! - h.R[k - 1]!) * w) * (s0 + (s1 - s0) * w), a: h.A[k - 1]! + (h.A[k]! - h.A[k - 1]!) * w });
  }
  return out;
}

const nbCache = new Map<string, Float32Array | null>();
/** Where a vein that opens into the cava meets the cava's wall, as a share (0 to 1) of the drawn vein's arc length: the last place at which the vein's centre is still outside the cava's lumen (the tube is cut away inside it, shaders.ts cavaCut), the
 *  lumen at the radius the cava is DRAWN at (`cavaSwell`: its live width over the width it was built at). Null for a vein that does not open into the cava. A clot in such a vein runs to here, so it reaches the junction as the vein does. */
export function cavaWallShare(h: Host, cavaSwell = 1): number | null {
  const last = h.pieces[h.pieces.length - 1];
  if (!last || !opensIntoCava(last.id)) return null;
  if (!nbCache.has(h.id)) {
    const flat = new Float32Array(h.pts.length * 3);
    h.pts.forEach((p, i) => { flat[i * 3] = p.x; flat[i * 3 + 1] = p.y; flat[i * 3 + 2] = p.z; });
    nbCache.set(h.id, neighbourAttr(last.id, flat));
  }
  const nb = nbCache.get(h.id);
  if (!nb) return null;
  const wall = (i: number): number => Math.abs(nb[i * 2]!) - nb[i * 2 + 1]! * cavaSwell;   // (> 0 outside the lumen)
  let k = h.pts.length - 1;
  while (k > 0 && wall(k) < 0) k--;
  if (k >= h.pts.length - 1) return 1;
  const d0 = wall(k), d1 = wall(k + 1), w = d1 === d0 ? 0 : Math.min(1, Math.max(0, -d0 / (d1 - d0)));
  return (h.s[k]! + (h.s[k + 1]! - h.s[k]!) * w) / h.length;
}
