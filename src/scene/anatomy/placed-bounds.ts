// Where things are in the APPROVED placement (docs/approved/anatomy-placement.md), by name: the 3D bounds a camera frames and the points a label stands on. A camera region is a list of
// names (organs and their parts, vessels by engine edge id or whole-vessel key, stations), never a box of numbers, so a slide frames its subject wherever the placement puts it. Read
// through source.ts. Pure data and arithmetic, built once at load; nothing here runs per frame.
//
// The placement describes WHOLE vessels (placement.generated.ts PLACED_COURSES: ivc, pv, sv, ...); the app draws engine PIECES (ILI_IVC, IVC_IS_1, ...). A piece is the stretch of its
// whole vessel between the points where today's piece ends lie on today's whole course (TODAY_COURSES, the mock's copy of today's app, within 0.013): the same share of the way along
// the placed course. A collateral or shunt is its own key. Anything the placement does not describe (the sinusoid beds, a hidden artery) moves with the nearest placed vessels.
import { PLACED_COURSES, PLACED_VESSELS, TODAY_COURSES, type P3 } from './placement.generated.ts';
import { PLACED_ORGAN_BOX } from './placed-organs.generated.ts';
import { EDGE_PATH_2D, NODE_POS_2D } from '../vessels/paths.copied.ts';
import { ORGAN_BOX_2D } from '../../decks/rw/copied/plate.ts';
import { REGIONS_2D } from '../../decks/ag/regions.generated.ts';
import { EDGES } from '../../engine/hales/portal/topology.js';

/** A 3D box in scene units: [x0, y0, z0, x1, y1, z1]. */
export type Box3 = readonly [number, number, number, number, number, number];
/** A 2D figure box in its world units: [x0, y0, x1, y1] (y down). */
export type Box2 = readonly [number, number, number, number];
type V3 = readonly [number, number, number];

const X3 = (x: number): number => (x - 700) / 300, Y3 = (y: number): number => -(y - 556) / 300;
const X2 = (x: number): number => x * 300 + 700, Y2 = (y: number): number => -y * 300 + 556;

/** Each engine edge that is a stretch of a whole placed vessel (the brief's table: the app's pieces of each vessel the mock draws whole). */
export const WHOLE_OF: Readonly<Record<string, string>> = {
  ILI_IVC: 'ivc', ILI_IVC_1: 'ivc', IVC_IS_1: 'ivc', IVC_IS: 'ivc', IVCS_RA: 'ivc', V_UP: 'svc', SVC_RA_1: 'svc', SVC_RA: 'svc', C9: 'azygos', AZY_SVC: 'azygos',
  RHV_IVC_1: 'rhv', RHV_IVC: 'rhv', MHV_IVC: 'mhv', LHV_IVC: 'lhv', V_KID_L: 'lrv', V_KID_L_1: 'lrv', LRV_IVC: 'lrv', PV_TRUNK_1: 'pv', PV_TRUNK: 'pv',
  PVH_R: 'rpv', PVH_R_1: 'rpv', PVH_R_2: 'rpv', PVH_L: 'lpv', PVH_L_1: 'lpv', V_SPL: 'sv', SV_MID: 'sv', SV_CONF: 'sv', V_INT: 'smv', V_INT_1: 'smv', SMV_CONF: 'smv',
  V_COL: 'imv', V_IMV: 'imv', LGV_CONF: 'lgv', A_HEP: 'ha', A_HR: 'rha', A_HL: 'lha',
};

const cum = (pts: readonly (readonly number[])[]): number[] => { const s = [0]; for (let i = 1; i < pts.length; i++) s.push(s[i - 1]! + Math.hypot(pts[i]![0]! - pts[i - 1]![0]!, pts[i]![1]! - pts[i - 1]![1]!, (pts[i]![2] ?? 0) - (pts[i - 1]![2] ?? 0))); return s; };
/** The share of the way along `line` (0 at its start, 1 at its end) of the point of it nearest (x, y), in the front view. */
function shareOf(line: readonly P3[], x: number, y: number): number {
  const s = cum(line), L = s[s.length - 1] || 1;
  let best = 0, bd = Infinity;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1]!, b = line[i]!, ex = b[0] - a[0], ey = b[1] - a[1], t = Math.max(0, Math.min(1, ((x - a[0]) * ex + (y - a[1]) * ey) / (ex * ex + ey * ey || 1)));
    const d = Math.hypot(x - a[0] - ex * t, y - a[1] - ey * t);
    if (d < bd) { bd = d; best = (s[i - 1]! + t * (s[i]! - s[i - 1]!)) / L; }
  }
  return best;
}
/** The point `u` of the way along `line` (by length). */
function pointAt(line: readonly P3[], u: number): V3 {
  const s = cum(line), at = Math.max(0, Math.min(1, u)) * s[s.length - 1]!;
  for (let i = 1; i < line.length; i++) if (s[i]! >= at || i === line.length - 1) { const t = s[i]! - s[i - 1]! > 0 ? Math.min(1, (at - s[i - 1]!) / (s[i]! - s[i - 1]!)) : 0, a = line[i - 1]!, b = line[i]!; return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  return line[0]!;
}
/** The stretch of `line` from share u0 to u1, as at least `n` points (with the line's own corners in between). */
function stretch(line: readonly P3[], u0: number, u1: number, n = 8): V3[] {
  const lo = Math.min(u0, u1), hi = Math.max(u0, u1), s = cum(line), L = s[s.length - 1] || 1, at: { u: number; p: V3 }[] = [];
  for (let k = 0; k <= n; k++) { const u = lo + ((hi - lo) * k) / n; at.push({ u, p: pointAt(line, u) }); }
  for (let i = 0; i < line.length; i++) { const u = s[i]! / L; if (u > lo && u < hi) at.push({ u, p: line[i]! }); }
  const out = at.sort((a, b) => a.u - b.u).map((q) => q.p);
  return u0 <= u1 ? out : out.reverse();
}

// ---- the morph: a point of today's figure, carried with the placed vessels nearest it (for what the placement does not describe) ----
let samples: { t: V3; d: V3 }[] | null = null;   // (built the first time a placed reader asks: today's figure never pays for it)
function morphSamples(): { t: V3; d: V3 }[] {
  if (samples) return samples;
  samples = [];
  for (const [k, T] of Object.entries(TODAY_COURSES)) {
    const A = PLACED_COURSES[k];
    if (!A || k.startsWith('cv')) continue;   // (the caudate's veins are shown only when called for: they carry nothing else)
    for (let i = 0; i <= 12; i++) { const u = i / 12, t = pointAt(T, u), a = pointAt(A, u); samples.push({ t, d: [a[0] - t[0], a[1] - t[1], a[2]] }); }
  }
  return samples;
}
/** Where a point of today's 2D figure (world units) lies in the placement: moved as the placed vessels nearest it moved (inverse-distance weights of the nearest), at their depth. */
export function placedMorph(x2d: number, y2d: number): V3 {
  const x = X3(x2d), y = Y3(y2d);
  const near = morphSamples().map((s) => ({ s, d: Math.hypot(s.t[0] - x, s.t[1] - y) })).sort((a, b) => a.d - b.d).slice(0, 6);
  let w = 0, dx = 0, dy = 0, z = 0;
  for (const { s, d } of near) { const k = 1 / (d * d + 1e-4); w += k; dx += k * s.d[0]; dy += k * s.d[1]; z += k * s.d[2]; }
  return [x + dx / w, y + dy / w, z / w];
}

const edgeCache = new Map<string, readonly V3[] | null>();
/** An engine edge's course in the placement (scene units, flow order), or null where the edge draws nothing (no 2D course and no placed one). */
export function placedEdge(id: string): readonly V3[] | null {
  if (edgeCache.has(id)) return edgeCache.get(id)!;
  let out: readonly V3[] | null = null;
  const own = PLACED_COURSES[id], whole = WHOLE_OF[id], path = EDGE_PATH_2D[id];
  if (own) out = own;
  else if (whole && path?.length && TODAY_COURSES[whole] && PLACED_COURSES[whole]) {
    const T = TODAY_COURSES[whole]!, a = path[0]!, b = path[path.length - 1]!;
    out = stretch(PLACED_COURSES[whole]!, shareOf(T, X3(a[0]), Y3(a[1])), shareOf(T, X3(b[0]), Y3(b[1])));
  } else if (path?.length) out = path.filter((_, i) => i % 4 === 0 || i === path.length - 1).map(([x, y]) => placedMorph(x, y));
  edgeCache.set(id, out);
  return out;
}

let ends: Map<string, V3[]> | null = null;
/** Where each node's placed vessels end, by node (built the first time it is asked). */
function nodeEnds(): Map<string, V3[]> {
  if (ends) return ends;
  ends = new Map();
  for (const e of EDGES as readonly { id: string; from: string; to: string }[]) {
    if (!WHOLE_OF[e.id] && !PLACED_COURSES[e.id]) continue;
    const c = placedEdge(e.id);
    if (!c?.length) continue;
    for (const [n, p] of [[e.from, c[0]!], [e.to, c[c.length - 1]!]] as const) { const l = ends.get(n) ?? []; l.push(p); ends.set(n, l); }
  }
  return ends;
}
/** A topology node's place in the placement: where the placed vessels that end there end (their mean), or its 2D place carried by the morph. Null for a node with neither. */
export function placedNode(id: string): V3 | null {
  const at = nodeEnds().get(id);
  if (at?.length) { const m = (k: 0 | 1 | 2) => at.reduce((s, p) => s + p[k], 0) / at.length; return [m(0), m(1), m(2)]; }
  const p = NODE_POS_2D[id];
  return p ? placedMorph(p[0], p[1]) : null;
}

const boxOfPts = (pts: readonly V3[]): Box3 | null => {
  if (!pts.length) return null;
  let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
  for (const p of pts) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); z0 = Math.min(z0, p[2]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); z1 = Math.max(z1, p[2]); }
  return [x0, y0, z0, x1, y1, z1];
};
export const unionBox3 = (boxes: readonly (Box3 | null)[]): Box3 | null => {
  const bs = boxes.filter((b): b is Box3 => !!b);
  if (!bs.length) return null;
  const lo = (k: number) => Math.min(...bs.map((b) => b[k]!)), hi = (k: number) => Math.max(...bs.map((b) => b[k]!));
  return [lo(0), lo(1), lo(2), hi(3), hi(4), hi(5)];
};
/** A vessel's box, with its radius round its centreline. */
const tubeBox = (pts: readonly V3[], r: number): Box3 | null => { const b = boxOfPts(pts); return b && [b[0] - r, b[1] - r, b[2] - r, b[3] + r, b[4] + r, b[5] + r]; };
const radiusOf = (id: string): number => PLACED_VESSELS[PLACED_COURSES[id] ? id : WHOLE_OF[id] ?? '']?.r ?? 0.01;

/** The placed 3D box of one name: an organ or organ part (PLACED_ORGAN_BOX), an engine edge, a whole-vessel key (rhvb, rpva, cv1, ...), or a topology node. Null: no such name. */
export function placedBoxOfName(n: string): Box3 | null {
  const organ = PLACED_ORGAN_BOX[n];
  if (organ) return organ;
  const course = PLACED_COURSES[n] ?? (EDGE_PATH_2D[n] || WHOLE_OF[n] ? placedEdge(n) : null);
  if (course?.length) return tubeBox(course, radiusOf(n));
  if (NODE_POS_2D[n] || nodeEnds().has(n)) { const p = placedNode(n); return p ? [p[0], p[1], p[2], p[0], p[1], p[2]] : null; }
  return null;
}
/** Today's box of one name, in scene units (z 0: today's figure is a plate): the 2D course, organ box or node, or the mock's copy of today for a draw-only branch. */
export function todayBoxOfName(n: string): Box3 | null {
  const o = ORGAN_BOX_2D[n];
  if (o) return [X3(o[0]), Y3(o[3]), 0, X3(o[2]), Y3(o[1]), 0];
  const path = EDGE_PATH_2D[n];
  if (path?.length) return boxOfPts(path.map(([x, y]) => [X3(x), Y3(y), 0] as const));
  const t = TODAY_COURSES[n];
  if (t) return boxOfPts(t.map((p) => [p[0], p[1], 0] as const));
  const p = NODE_POS_2D[n];
  return p ? [X3(p[0]), Y3(p[1]), 0, X3(p[0]), Y3(p[1]), 0] : null;
}
/** The union of the names' boxes (placed, or today's), and the names that are none of them. */
export function boxOfNames(names: readonly string[], placed = true): { box: Box3 | null; unknown: string[] } {
  const unknown: string[] = [], boxes: (Box3 | null)[] = [];
  for (const n of names) { const b = placed ? placedBoxOfName(n) : todayBoxOfName(n); if (b) boxes.push(b); else unknown.push(n); }
  return { box: unionBox3(boxes), unknown };
}

/** Room round a named subject, as the 2D camera leaves it round named things (cam-frame.js growBox: 8 % of the larger side), at least `floor` scene units. */
export const GROW = 0.08, GROW_FLOOR = 0.1;
export function growBox3(b: Box3, floor = GROW_FLOOR): Box3 {
  const m = Math.max(GROW * Math.max(b[3] - b[0], b[4] - b[1]), floor);
  return [b[0] - m, b[1] - m, b[2], b[3] + m, b[4] + m, b[5]];
}
/** A scene box as the 2D figure's world box [x0, y0, x1, y1] (what the deck plans carry as `box`). */
export const box2Of = (b: Box3): Box2 => [X2(b[0]), Y2(b[4]), X2(b[3]), Y2(b[1])];
export const centreOf = (b: Box3): V3 => [(b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2];

/**
 * What each camera region of the decks shows, by name (the 2D app's REGIONS boxes, read once: what each box was drawn round). Placed, a region frames today's box moved as what it
 * shows moved (carriedBox2), grown only where these names would reach past it, so every slide that names a region frames its subject wherever the placement put it, at today's zoom.
 * A name here is one today's box shows at least half of (tests/anatomy-placed-frames.test.ts): a vessel the box only touches (the neck's V_UP above the route box) would pull the frame to it.
 */
export const REGION_SUBJECTS: Readonly<Record<string, readonly string[]>> = {
  // the catheter's way: the SVC from the neck's root, the right atrium, the IVC through the liver to the hepatic veins, and the portal vein below (DEFAULT_CAM of the procedure decks;
  // the box starts at y 30, below the neck's V_UP, so V_UP is not its subject)
  route: ['SVC_RA_1', 'SVC_RA', 'heart', 'heart-ra', 'IVCS_RA', 'IVC_IS', 'RHV_IVC', 'RHV_IVC_1', 'rhva', 'rhvb', 'MHV_IVC', 'LHV_IVC', 'liver', 'PV_TRUNK', 'PV_TRUNK_1'],
  liver: ['liver', 'RHV_IVC', 'MHV_IVC', 'LHV_IVC', 'PVH_R', 'PVH_L', 'PV_TRUNK'],
  portal: ['PV_TRUNK', 'PV_TRUNK_1', 'SV_CONF', 'SV_MID', 'SMV_CONF', 'PVH_R', 'PVH_L', 'A_HEP'],
  gut: ['duodenum', 'bowel', 'colon', 'V_INT', 'V_INT_1', 'SMV_CONF', 'V_COL', 'V_IMV'],
  hepatic: ['RHV_IVC', 'RHV_IVC_1', 'rhva', 'rhvb', 'MHV_IVC', 'LHV_IVC', 'IVCS_RA', 'IVC_IS', 'heart-ra'],
  dips: ['DIPS', 'IVC_IS', 'PVH_R', 'PVH_L', 'PV_TRUNK', 'MHV_IVC'],
  heart: ['heart', 'heart-ra', 'SVC_RA', 'IVCS_RA'],
  varices: ['esophagus', 'C1a', 'C1b', 'AZY_SVC', 'gej'],
  bleed: ['stomach', 'gej', 'C1a', 'C2', 'LGV_CONF'],
  gej: ['gej', 'C1a'],
  feeder: ['LGV_CONF', 'C1a', 'SV_CONF', 'PV_TRUNK', 'gej', 'stomach'],
  spleen: ['spleen', 'V_SPL', 'C2'],
  rectum: ['rectum', 'C4'],
  wall: ['C3', 'EPI_ILI'],
  fundus: ['stomach', 'spleen', 'C2', 'C5', 'C6'],
  splenic: ['V_SPL', 'SV_MID', 'SV_CONF', 'spleen'],
};

// ---- a 2D camera box carried onto the placement: today's box, moved as what it SHOWS moved (the stretches of the healthy figure's vessels inside it, the organs it holds whole) ----
// A 2D slide box frames a piece of the figure with room round it, at a zoom. Placed, it frames the same piece wherever the placement moved it, at the same zoom: the box keeps its size and
// moves by the mean move of the points it shows, and sits at their depth. Whole names would not do: a vessel that only enters the box (the neck's vein above the route box, a collateral
// crossing a raw box) pulled the frame out to its far end, so the subject the slide is about was drawn small and pushed under a card (24 Nov, the Circulation talk on the iPhone: the
// route frame rose 0.31 units to hold the neck, and the portal vein and the gut went under the story card). The slide's named subject is then taken in whole (placedRegionBox).
const VESSEL_STEPS = 48;
/** Whether a point lies in today's box `b` (scene units, [x0, y0, x1, y1]). */
const inBox = (b: readonly number[], x: number, y: number): boolean => x >= b[0]! - 1e-9 && x <= b[2]! + 1e-9 && y >= b[1]! - 1e-9 && y <= b[3]! + 1e-9;
/** What a 2D box shows of the healthy figure, as pairs of points (today's, scene units at depth 0, and where the placement put it): the vessels' points inside it (each placed by its share
 *  of the way along the whole placed course) and the corners of the organs it holds whole. Empty: the box holds none of the figure. */
export function shownByBox2(b: Box2): { today: V3; placed: V3 }[] {
  const B = [X3(b[0]), Y3(b[3]), X3(b[2]), Y3(b[1])] as const, out: { today: V3; placed: V3 }[] = [];
  for (const n of FIGURE_NAMES) {
    const T = TODAY_COURSES[n], A = PLACED_COURSES[n];
    if (T && A) {
      for (let i = 0; i <= VESSEL_STEPS; i++) { const u = i / VESSEL_STEPS, t = pointAt(T, u); if (inBox(B, t[0], t[1])) out.push({ today: [t[0], t[1], 0], placed: pointAt(A, u) }); }
      continue;
    }
    const o = ORGAN_BOX_2D[n], P = PLACED_ORGAN_BOX[n];
    if (!o || !P) continue;
    // (an organ counts where the box holds it whole, as a raw box's subject does (subjectOfBox2); one the box only cuts into is the room round the subject)
    const ix = Math.max(0, Math.min(o[2], b[2]) - Math.max(o[0], b[0])), iy = Math.max(0, Math.min(o[3], b[3]) - Math.max(o[1], b[1]));
    if (ix * iy < SUBJECT_INSIDE * (o[2] - o[0]) * (o[3] - o[1])) continue;
    out.push({ today: [X3(o[0]), Y3(o[3]), 0], placed: [P[0], P[1], P[2]] }, { today: [X3(o[2]), Y3(o[1]), 0], placed: [P[3], P[4], P[5]] });
  }
  return out;
}
/** A 2D box carried onto the placement: today's box (scene units), its size kept, moved by the mean move of what it shows, at the depth of what it shows. A box that shows none of the
 *  figure moves as the figure round its middle moved (placedMorph). */
export function carriedBox2(b: Box2): Box3 {
  const B = [X3(b[0]), Y3(b[3]), X3(b[2]), Y3(b[1])] as const, s = shownByBox2(b);
  let dx: number, dy: number, z0: number, z1: number;
  if (!s.length) { const c = placedMorph((b[0] + b[2]) / 2, (b[1] + b[3]) / 2); dx = c[0] - (B[0] + B[2]) / 2; dy = c[1] - (B[1] + B[3]) / 2; z0 = z1 = c[2]; }
  else {
    dx = s.reduce((a, q) => a + q.placed[0] - q.today[0], 0) / s.length; dy = s.reduce((a, q) => a + q.placed[1] - q.today[1], 0) / s.length;
    z0 = Math.min(...s.map((q) => q.placed[2])); z1 = Math.max(...s.map((q) => q.placed[2]));
  }
  return [B[0] + dx, B[1] + dy, z0, B[2] + dx, B[3] + dy, z1];
}
/** The placed box a region frames: today's region box carried onto the placement (carriedBox2), grown only where the region's named subject would reach past it.
 *  Null for a name that is no region. */
export function placedRegionBox(region: string): Box3 | null {
  const names = REGION_SUBJECTS[region];
  if (!names) return null;
  const { box, unknown } = boxOfNames(names);
  if (unknown.length || !box) throw new Error(`region ${region}: no placed ${unknown.join(', ')}`);
  return unionBox3([carriedBox2(REGIONS_2D[region]!), box])!;
}

/** Everything a raw 2D box was drawn round: the drawn edges whose whole course (all but a tenth) lies inside it, and the organs whose box does (the box's centre's nearest vessel when it holds
 *  neither). A vessel that only crosses the box is not its subject: the box shows a stretch of it, and carriedBox2 frames that stretch. */
export const SUBJECT_INSIDE = 0.9;
export function subjectOfBox2(b: Box2, hidden: ReadonlySet<string> = new Set()): string[] {
  const inside = (x: number, y: number) => x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3];
  const out: string[] = [];
  for (const [id, p] of Object.entries(EDGE_PATH_2D)) if (!hidden.has(id) && p.length && p.filter(([x, y]) => inside(x, y)).length >= SUBJECT_INSIDE * p.length) out.push(id);
  for (const [id, o] of Object.entries(ORGAN_BOX_2D)) {
    if (!PLACED_ORGAN_BOX[id]) continue;
    const ix = Math.max(0, Math.min(o[2], b[2]) - Math.max(o[0], b[0])), iy = Math.max(0, Math.min(o[3], b[3]) - Math.max(o[1], b[1]));
    if (ix * iy >= SUBJECT_INSIDE * (o[2] - o[0]) * (o[3] - o[1])) out.push(id);
  }
  if (!out.length) {
    const cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
    let best = '', bd = Infinity;
    for (const [id, p] of Object.entries(EDGE_PATH_2D)) if (!hidden.has(id)) for (const [x, y] of p) { const d = Math.hypot(x - cx, y - cy); if (d < bd) { bd = d; best = id; } }
    if (best) out.push(best);
  }
  return out;
}
/** The placed box a raw 2D slide box frames: the box carried onto the placement (carriedBox2), grown only where its subject would reach past it. */
export function placedBoxOfBox2(b: Box2, hidden?: ReadonlySet<string>): Box3 {
  const { box } = boxOfNames(subjectOfBox2(b, hidden));
  return unionBox3([carriedBox2(b), box])!;
}

/** What the whole figure shows at rest, placed: every organ and the gut, and every vessel drawn on a healthy figure (no collateral, shunt or stent; no caudate). */
export const FIGURE_NAMES: readonly string[] = [
  'liver', 'stomach', 'esophagus', 'spleen', 'kidney-l', 'heart', 'heart-ra', 'duodenum', 'bowel', 'colon',
  ...Object.keys(PLACED_COURSES).filter((k) => !PLACED_VESSELS[k]?.extra && !PLACED_VESSELS[k]?.aOnly),
];

/** What the whole figure shows as its body, placed: the organs (the esophagus down to the colon), without the vessels. The whole-figure frames (free play, a talk's overview, the Fit button) are framed on this, centred on it: the thin vein ends that stand a little past it
 *  (the superior vena cava's top, 0.11 units above the esophagus) need no room of their own (Mohammad, 25 Nov: "it doesn't look centered", measured by tests/camera-fit-margin.test.ts on the organs' silhouette). */
export const VISIBLE_FIGURE_NAMES: readonly string[] = ['liver', 'stomach', 'esophagus', 'spleen', 'kidney-l', 'heart', 'duodenum', 'bowel', 'colon'];
