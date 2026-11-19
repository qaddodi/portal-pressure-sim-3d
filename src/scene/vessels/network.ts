// Every vessel the 2D anatomy draws, as a 3D course named by its hales-engine topology edge ID (the artist's anatomy will replace the courses and
// keep the names). Fourteen veins are hand-composed in anatomy/vessels.ts (the HVPG slice); the rest are made here from the 2D app's own courses:
//   1. the 2D node places are carried into the body by a smooth warp fitted to the nodes the hand-composed veins already fix (an affine fit plus a
//      distance-weighted residual, exact at those nodes), so a new vessel meets the old ones at the same point;
//   2. each 2D course keeps its shape between its two end nodes (its offsets are re-expressed in the chord of the 3D ends);
//   3. in front of the organs a vessel is lifted onto their near surface, behind them (the cava, the azygos, the lumbar collateral) it stays behind.
// Frontal view, the patient's right on the viewer's left, scene units (the body plate is about 4.6 wide).
import { Vector3 } from 'three';
import { EDGES, JUNCTION_PIECES, PORTAL_TERRITORY, dMinOf } from '../../engine/hales/portal/topology.js';
import { ANAT_HIDDEN, BACK_EDGES, CONTEXT_EDGES, EDGE_PATH_2D, HIDDEN_EDGES, IVC_EDGES, NEEDS_C3, NODE_POS_2D } from './paths.copied.ts';
import { HOSTS, VESSELS as HAND_MADE, type Vec3, type VesselDef } from '../anatomy/vessels.ts';

export type NetTone = 'portal' | 'sys' | 'artery';
export type Tier = 'front' | 'back' | 'context';
export interface NetVessel extends Omit<VesselDef, 'tone'> {
  tone: NetTone;
  kind: string;
  tier: Tier;
  /** the hand-composed slice vessels keep their courses */
  handMade: boolean;
}

interface Edge { id: string; from: string; to: string; kind: string; d?: number; dMax?: number; share?: number; label?: string; zone?: string; shunt?: string }
const edges = EDGES as Edge[];
const edgeById = new Map(edges.map((e) => [e.id, e]));
const portal = PORTAL_TERRITORY as Set<string>;

/** Scene radius from the engine's diameter (mm): PV_TRUNK 12 mm is 0.095 in the hand-composed set. */
export const RADIUS_PER_MM = 0.0078;
export const MIN_RADIUS = 0.014, MAX_RADIUS = 0.16;
export const radiusOf = (dmm: number) => Math.min(MAX_RADIUS, Math.max(MIN_RADIUS, dmm * RADIUS_PER_MM));

// ---- the warp from the 2D anatomy to the body ----
const flip = (p: readonly [number, number]): [number, number] => [p[0], -p[1]];   // (2D y runs down)

function anchors(): { p2: [number, number]; p3: Vec3 }[] {
  const seen = new Map<string, Vec3[]>();
  const note = (node: string, at: Vec3) => { (seen.get(node) ?? seen.set(node, []).get(node)!).push(at); };
  for (const v of HAND_MADE) { note(v.from, v.pts[0]!); note(v.to, v.pts[v.pts.length - 1]!); }
  const out: { p2: [number, number]; p3: Vec3 }[] = [];
  for (const [node, list] of seen) {
    const pos = NODE_POS_2D[node];
    if (!pos) continue;   // a junction node: it has no place of its own in the 2D anatomy
    const m: Vec3 = [0, 0, 0];
    for (const q of list) for (let i = 0; i < 3; i++) m[i]! += q[i]! / list.length;
    out.push({ p2: flip(pos), p3: m });
  }
  return out;
}
const ANCHORS = anchors();

/** Least-squares affine map (x, y) -> a x + b y + c for one output coordinate. */
function affine(coord: 0 | 1): [number, number, number] {
  // normal equations of [x y 1] w = target
  const A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], r = [0, 0, 0];
  for (const { p2, p3 } of ANCHORS) {
    const row = [p2[0], p2[1], 1];
    for (let i = 0; i < 3; i++) { for (let j = 0; j < 3; j++) A[i]![j]! += row[i]! * row[j]!; r[i]! += row[i]! * p3[coord]; }
  }
  // Cramer's rule for the 3 x 3
  const det = (m: number[][]) => m[0]![0]! * (m[1]![1]! * m[2]![2]! - m[1]![2]! * m[2]![1]!) - m[0]![1]! * (m[1]![0]! * m[2]![2]! - m[1]![2]! * m[2]![0]!) + m[0]![2]! * (m[1]![0]! * m[2]![1]! - m[1]![1]! * m[2]![0]!);
  const d = det(A);
  return [0, 1, 2].map((c) => det(A.map((row, i) => row.map((v, j) => (j === c ? r[i]! : v)))) / d) as [number, number, number];
}
const AX = affine(0), AY = affine(1);

/** A point of the 2D anatomy (y flipped) in the body's frontal plane. Exact at every anchor; between them the affine fit plus a 1/d^2-weighted residual. */
export function warp(p: readonly [number, number]): [number, number] {
  const bx = AX[0] * p[0] + AX[1] * p[1] + AX[2], by = AY[0] * p[0] + AY[1] * p[1] + AY[2];
  let wsum = 0, rx = 0, ry = 0;
  for (const a of ANCHORS) {
    const dx = p[0] - a.p2[0], dy = p[1] - a.p2[1], d2 = dx * dx + dy * dy;
    if (d2 < 1e-6) return [a.p3[0], a.p3[1]];
    const w = 1 / (d2 * d2 / 1e4 + d2 * 0.02);   // (falls faster than 1/d^2 far away, so a distant anchor does not drag a near vessel)
    wsum += w;
    rx += w * (a.p3[0] - (AX[0] * a.p2[0] + AX[1] * a.p2[1] + AX[2]));
    ry += w * (a.p3[1] - (AY[0] * a.p2[0] + AY[1] * a.p2[1] + AY[2]));
  }
  return [bx + rx / wsum, softFloor(by + ry / wsum)];
}

/** The lower body is squeezed into the plate: below the knee a y keeps its order but runs into an asymptote just past the plate's foot (-2.7), so
 *  the iliac and rectal veins fade off the bottom as the 2D figure's do, never far outside the body. */
export const FLOOR_KNEE = -2.3, FLOOR_ASYMPTOTE = -3.2;
export function softFloor(y: number): number {
  if (y >= FLOOR_KNEE) return y;
  const span = FLOOR_KNEE - FLOOR_ASYMPTOTE;
  return FLOOR_KNEE - span * (1 - Math.exp(-(FLOOR_KNEE - y) / span));
}

// ---- organ surfaces the front-tier vessels ride on (mirrors anatomy/placeholder.ts: centre, radii, turn about z) ----
const SURFACES: { c: Vec3; r: Vec3; rot: number }[] = [
  { c: [-0.8, 1.05, -0.15], r: [1.35, 0.95, 0.85], rot: -0.16 },   // liver, right lobe
  { c: [0.5, 1.28, 0], r: [0.95, 0.5, 0.55], rot: -0.28 },         // liver, left lobe
  { c: [1.9, 1.0, -0.45], r: [0.38, 0.62, 0.3], rot: 0.5 },        // spleen
];
/** The z of the nearest organ surface in front at (x, y), or null when no organ is there. */
export function organFront(x: number, y: number): number | null {
  let best: number | null = null;
  for (const s of SURFACES) {
    const dx = x - s.c[0], dy = y - s.c[1], cs = Math.cos(-s.rot), sn = Math.sin(-s.rot);
    const lx = (dx * cs - dy * sn) / s.r[0], ly = (dx * sn + dy * cs) / s.r[1], q = 1 - lx * lx - ly * ly;
    if (q <= 0) continue;
    const z = s.c[2] + s.r[2] * Math.sqrt(q);
    if (best == null || z > best) best = z;
  }
  return best;
}

const BACK_Z = -0.58;
/** Where a vessel of a tier sits in depth at (x, y): front ones ride the organ surface (a hair off it), back ones stay behind the liver. */
function depthAt(tier: Tier, x: number, y: number, base: number): number {
  if (tier === 'back') return BACK_Z + base * 0.1;
  const front = organFront(x, y);
  return front == null ? base : Math.max(base, front + 0.05);
}

// ---- the courses ----
const hostOfPiece = new Map<string, string>();
for (const [host, pieces] of Object.entries(JUNCTION_PIECES as Record<string, string[]>)) for (const p of pieces) hostOfPiece.set(p, host);
const handIds = new Set(HAND_MADE.map((v) => v.id));
void HOSTS;

const NODE_FIT = 3.5;   // 2D units: a course end this near a node is that node

function endPoint(p: readonly [number, number], node: string): [number, number] {
  const n = NODE_POS_2D[node];
  if (n) { const f = flip(n); if (Math.hypot(f[0] - p[0], f[1] - p[1]) < NODE_FIT) return warp(f); }
  return warp(p);
}

/** The vessel's whole course (its host's, when the engine cuts the vein in pieces), in flow order, in the frontal plane with depth added. */
function hostCourse(hostId: string, tier: Tier, baseZ: number): Vec3[] {
  const pieces = (JUNCTION_PIECES as Record<string, string[]>)[hostId] ?? [hostId];
  const first = edgeById.get(pieces[0]!)!, last = edgeById.get(pieces[pieces.length - 1]!)!;
  const n0 = NODE_POS_2D[first.from], n1 = NODE_POS_2D[last.to];
  const path2 = EDGE_PATH_2D[hostId] ?? (n0 && n1 ? [n0, n1] : null);
  if (!path2) throw new Error(`no 2D course for ${hostId}`);
  const pts = path2.map(flip);
  const A2 = pts[0]!, B2 = pts[pts.length - 1]!;
  const A3 = endPoint(A2, first.from), B3 = endPoint(B2, last.to);
  const dx2 = B2[0] - A2[0], dy2 = B2[1] - A2[1], L2 = Math.hypot(dx2, dy2) || 1;
  const u2 = [dx2 / L2, dy2 / L2], v2 = [-u2[1]!, u2[0]!];
  const dx3 = B3[0] - A3[0], dy3 = B3[1] - A3[1], L3 = Math.hypot(dx3, dy3) || 1e-6;
  const u3 = [dx3 / L3, dy3 / L3], v3 = [-u3[1]!, u3[0]!];
  return pts.map((p): Vec3 => {
    const s = ((p[0] - A2[0]) * u2[0]! + (p[1] - A2[1]) * u2[1]!) / L2, t = ((p[0] - A2[0]) * v2[0]! + (p[1] - A2[1]) * v2[1]!) / L2;
    const x = A3[0] + u3[0]! * s * L3 + v3[0]! * t * L3, y = A3[1] + u3[1]! * s * L3 + v3[1]! * t * L3;
    return [x, y, depthAt(tier, x, y, baseZ)];
  });
}

/** A piece of a cut vein is in its host's tier. */
const tierOf = (e: Edge): Tier => { const id = hostOfPiece.get(e.id) ?? e.id; return BACK_EDGES.has(id) || IVC_EDGES.has(id) ? 'back' : CONTEXT_EDGES.has(id) ? 'context' : 'front'; };
const toneOf = (e: Edge): NetTone => (e.kind === 'artery' || e.kind === 'arteriole' ? 'artery' : portal.has(e.from) || portal.has(e.to) ? 'portal' : 'sys');
const baseZOf = (e: Edge) => (e.kind === 'artery' || e.kind === 'arteriole' ? 0.58 : e.kind === 'collateral' ? 0.45 : e.kind === 'liver' ? 0.3 : 0.5);

/** The edges the figure draws as vessels (kinds the engine models but the anatomy never draws are left out: the catheter wedge beds, the one-way
 *  diode, the gut-side arterioles; surgical shunts and the stents belong to the procedures (B5)). */
export function isDrawnEdge(e: Edge): boolean {
  if (HIDDEN_EDGES.has(e.id) || ANAT_HIDDEN.has(e.id) || e.id === 'CAUD' || e.id === 'V_UP') return false;
  if (e.kind === 'wedge' || e.kind === 'diode') return false;
  if (e.kind === 'shunt') return e.id === 'AP_R' || e.id === 'AP_L';
  return true;
}

function build(): NetVessel[] {
  const out: NetVessel[] = HAND_MADE.map((v) => ({ ...v, tone: v.tone, kind: edgeById.get(v.id)!.kind, tier: tierOf(edgeById.get(v.id)!), handMade: true }));
  const courses = new Map<string, Vec3[]>();
  for (const e of edges) {
    if (!isDrawnEdge(e) || handIds.has(e.id)) continue;
    const host = hostOfPiece.get(e.id) ?? e.id;
    const tier = tierOf(e);
    if (!courses.has(host)) courses.set(host, hostCourse(host, tier, baseZOf(e)));
    const pieces = (JUNCTION_PIECES as Record<string, string[]>)[host] ?? [host];
    const whole = courses.get(host)!;
    let pts: Vec3[];
    if (pieces.length === 1) pts = whole;
    else {
      // cut the host's course by the pieces' shares of its length
      const curve = whole.map((p) => new Vector3(...p));
      const lens = [0]; for (let i = 1; i < curve.length; i++) lens.push(lens[i - 1]! + curve[i]!.distanceTo(curve[i - 1]!));
      const total = lens[lens.length - 1]!;
      const shares = pieces.map((id) => edgeById.get(id)!.share ?? 1 / pieces.length);
      const idx = pieces.indexOf(e.id);
      const c0 = shares.slice(0, idx).reduce((a, b) => a + b, 0), c1 = c0 + shares[idx]!;
      const at = (f: number): Vec3 => {
        const target = Math.min(1, Math.max(0, f)) * total;
        let i = 1; while (i < lens.length - 1 && lens[i]! < target) i++;
        const t = (target - lens[i - 1]!) / Math.max(1e-9, lens[i]! - lens[i - 1]!);
        const a = whole[i - 1]!, b = whole[i]!;
        return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
      };
      const n = Math.max(3, Math.round((c1 - c0) * 18));
      pts = Array.from({ length: n + 1 }, (_, i) => at(c0 + ((c1 - c0) * i) / n));
    }
    const d = IVC_EDGES.has(e.id) ? edgeById.get('IVC_IS')!.d! : e.d ?? e.dMax ?? (dMinOf(e) || 3);
    out.push({ id: e.id, host, from: e.from, to: e.to, tone: toneOf(e), radius: radiusOf(d) * (e.kind === 'liver' ? 0.8 : 1), label: e.label ?? e.id, pts, kind: e.kind, tier, handMade: false });
  }
  return out;
}

/** Every drawn vessel: the hand-composed slice veins first, then the rest in topology order. */
export const NETWORK: readonly NetVessel[] = build();
export const NETWORK_BY_ID: ReadonlyMap<string, NetVessel> = new Map(NETWORK.map((v) => [v.id, v]));
/** Edge IDs the anatomy draws as vessels: what a parity row counts. */
export const DRAWN_EDGE_IDS: readonly string[] = edges.filter(isDrawnEdge).map((e) => e.id);
/** Drawn only once the paraumbilical collateral has opened (the 2D rule). */
export const NEEDS_C3_IDS = NEEDS_C3;

// ---- presence ----
export type Presence = 'shown' | 'ghost' | 'hidden';
export interface PresenceFrame { Q: ArrayLike<number>; Qf?: ArrayLike<number>; D: ArrayLike<number> }
export interface PresenceOptions { /** Blood menu: Potential collaterals (dotted routes that open with pressure) */ collaterals: boolean }
const OPEN_FRAC = 0.12, OPEN_Q = 0.3, C3_FRAC = 0.15, AP_Q = 0.3;
const indexOf = new Map(edges.map((e, i) => [e.id, i]));

/** How far a collateral has opened, 0 to 1, from its diameter between its closed and open ones (stage-frame.js recruitFrac). */
export function recruitFrac(id: string, f: PresenceFrame): number {
  const k = indexOf.get(id)!, e = edges[k]!, lo = dMinOf(e) as number, hi = e.dMax ?? lo;
  return hi > lo ? Math.min(1, Math.max(0, (f.D[k]! - lo) / (hi - lo))) : 0;
}
/** Whether a collateral is drawn open: it has grown past an eighth, or carries 0.3 mL/s. */
export function collateralOpen(id: string, f: PresenceFrame): boolean {
  const k = indexOf.get(id)!;
  return recruitFrac(id, f) > OPEN_FRAC || Math.abs((f.Qf ?? f.Q)[k]!) > OPEN_Q;
}

/** The 2D rules of stage-frame.js edgeVisible: a collateral is solid once open, a dotted thread while closed when potential collaterals are on, and nothing
 *  otherwise; the epigastric veins appear with the paraumbilical collateral; an arterioportal shunt only while it carries flow. */
export function presenceOf(v: Pick<NetVessel, 'id' | 'kind'>, f: PresenceFrame, o: PresenceOptions): Presence {
  const k = indexOf.get(v.id);
  if (k == null) return 'hidden';
  if (NEEDS_C3.has(v.id)) return recruitFrac('C3', f) > C3_FRAC ? 'shown' : 'hidden';
  if (v.kind === 'collateral') return collateralOpen(v.id, f) ? 'shown' : o.collaterals ? 'ghost' : 'hidden';
  if (v.kind === 'shunt') return (f.Qf ?? f.Q)[k]! > AP_Q ? 'shown' : 'hidden';
  return 'shown';
}
