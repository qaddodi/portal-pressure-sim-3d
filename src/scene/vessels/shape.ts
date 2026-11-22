// A vessel's tubes at its present shape: its own course (coiled as it opens), the strands of a braided collateral, or a fan of tributaries. Built from the 2D
// figure's own courses and rules (coil.ts, coil.copied.ts); the scene rewrites a vessel's positions in place when the shape moves (VesselObject.reshape).
import { CatmullRomCurve3, Vector3 } from 'three';
import { FAN_TIP_FROM, fanCaps, fanLensRanges, fanTips } from './feeder-fan.ts';
import type { Vec3 } from '../anatomy/vessels.ts';
import { len3, x3, y3 } from '../frame2d.ts';
import { TIER_Z } from '../frame2d.ts';
import { WEAVE, coilCourses, type Pin } from './coil.ts';
import { NETWORK, NETWORK_BY_ID, NODE_Z, SEGMENT_OF, SVC_TRIBUTARY_IDS, cutEnd, type NetVessel } from './network.ts';
import { LIVER_BRANCH_HOSTS, SPLIT_AT, TIP } from './liver-branches.ts';
import { CAV, cavChannels, cavGrowth } from './cav.ts';
import { BEAD_LAMBDA_FUNDAL, BEAD_SITE, beadLambda } from './varix-bead.copied.js';
import { STRAND_FROM_2D } from './coil.copied.ts';
import { setSmoothJoins, smoothJoinsOn } from './join-mode.ts';
import { ATTACH_REACH, BURY, CEIL, END_SHARE, SMOOTH, endDepth, isPlain } from './smooth-joins.ts';
import { fadeOf } from './fades.ts';
import { PHASE_2_NODES } from './skin/nodes.ts';
import { endShare, shuntEnds } from './shunt-ends.ts';
import { DIVIDED } from './divide.ts';
import { fanEnd, leaveAsBundle } from './strand-fan.ts';
import { clearAt, clearances, type ClearProfile } from './clearance.ts';
const DIVIDED_IDS: ReadonlySet<string> = new Set(DIVIDED.map(([, v]) => v));

const len2d = (pts: readonly (readonly [number, number])[]): number => { let l = 0; for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]); return l; };
/** the vessels the bands strangle (topology code C1: the coronary vein to the varices, and the varices to the azygos) */
const BANDED = new Set(['C1a', 'C1b']);
/** A collateral meets other vessels at its ends: where the vessel it runs into is thinner than it is, it narrows to that vessel's calibre over its end (Mohammad, 20 Nov: "coronary vein into EV is not smoothly connected": the varices'
 *  strands ended as wide as their own trunk on a thinner vein, a blunt shoulder; the same step stood where the azygos collateral meets the azygos and where the paraumbilical vein meets the epigastric vein). Where it runs into a wider one it is a branch off a wall and keeps its own. */
const NARROWS_INTO_NEIGHBOUR = (v: NetVessel): boolean => v.kind === 'collateral' && v.id !== 'C8' && v.id !== 'C5';
/** The varices' strands part over this share of the course (the strands' own braid starts at 0.22): the easing from the vein's calibre to the columns' takes as long as they take to part, so no pinch shows between. */
const FAN_SPAN: readonly [number, number] = [0.42, 0.3];
const FAN_IDS: ReadonlySet<string> = new Set(['C1a']);
/** The share of `v`'s own radius it narrows to at `end`, 1 where it does not. */
const narrowTo = (v: NetVessel, end: 0 | 1): number => {
  if (!NARROWS_INTO_NEIGHBOUR(v)) return 1;
  const node = end ? v.to : v.from;
  let r = 0;
  for (const o of NETWORK) if (o !== v && !o.feeder && (o.from === node || o.to === node)) r = Math.max(r, o.radius);
  return r > 0 && r < 0.9 * v.radius ? r / v.radius : 1;
};
/** The varices are drawn thicker than the 2D figure's strands, so they read at fit zoom on a phone (Mohammad, 20 Nov: "esophageal varices should be more prominent in anatomy view"); the banding and the beads work on top. */
export const VARIX_THICK = 1.22;
/** What a banded strand keeps of its width: a closed varix is a thin sclerosed cord, never gone (Mohammad, 20 Nov: banding left "stumps" and floating bands). The varices shrink as each band closes one, and the path from the coronary vein to the azygos stays one tube end to end. */
export const BANDED_CORD = 0.28;
/** Whether end `e` of vessel `id` is the outer end of its segment (it meets another vessel, not its own other half): true for a vessel that is not in a segment. */
export const outerEnd = (id: string, e: 0 | 1): boolean => { const seg = SEGMENT_OF.get(id); return !seg || (e === 0 ? seg[0] === id : seg[seg.length - 1] === id); };
/** How far strand `i` of `n` has opened at the varix's spread `spr` (coil.ts varixSpreadK: 0.55 for a resting vein to 1 for a full varix), 0 to 1: the strands open one after another (V2, Mohammad 22 Nov), the last of the list first (the bands close the first), each over
 *  45% of the growth, and never all at once; a full varix has them all open, as at rest. */
export const strandOpen = (i: number, n: number, spr: number): number => {
  const size = Math.min(1, Math.max(0, (spr - 0.55) / 0.45)), start = n > 1 ? 0.55 * (1 - i / (n - 1)) : 0;
  return smooth((size - start) / 0.45);
};
/** whether a vessel beads (varix-bead.js BEAD_SITE): its strands do, and the gastrorenal shunt itself does */
export const beadsOn = (id: string): boolean => !!(BEAD_SITE as Record<string, string>)[id];
import { type Buried, type Course, radiusAtU, sewnAt, tubularFor } from './tubes.ts';

export interface ShapeState { wig: number; spr: number; /** how far the collaterals are recruited, 0 to 1 (the cavernoma's channels grow with it) */ rec: number; /** the varix's beading, 0 to 0.35 (varix-bead.js) */ bead: number; /** the bands on the esophageal varices, eased (band-ease.js) */ bands: number; /** strands drawn (a closed, dotted collateral has none) */ strandsOn: boolean; /** a feeder group's 0 to 1 live share */ live: number; /** the stretch at each end (share of the course, from its start and from its end) that stays as at rest, because a junction skin stands on it: coil.ts `pinCourse`; absent: none */ pin?: Pin }
export const REST: ShapeState = { wig: 0, spr: 1, rec: 1, bead: 0, bands: 0, strandsOn: true, live: 1 };
/** The shape a junction skin is meshed on at a vessel's end: for a vessel whose seam is held (`pin`), the rest shape with only what still reaches the seam, and its live share (the bands are held off it too: the tube keeps its rest width inside the held stretch, `held` r0, and thins past it); coil, spread, bead, the strands being on or off and the recruitment never do (they are held off the seam, or the end is the same tube whether or not they are on). So the skin neither plans nor rebuilds for them. A vessel with no pin is meshed on its own shape. */
export const seamState = (s: ShapeState | undefined): ShapeState => (!s || !s.pin ? (s ?? REST) : { ...REST, live: s.live, pin: s.pin });

const smooth = (u: number) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
/** The course in the scene: x and y by the one linear map; depth is the vessel's tier between, easing over its first and last quarter to the depth of the node it meets, so
 *  joined vessels meet at one depth (a vessel in front and one behind it would otherwise stand apart in a turned view). */
/** The steepest a vessel's depth may change along its course (rise per unit run, about 50 degrees at the steepest point of the ease): a tube diving at the camera is shaded by its normals, not by its colour. */
export const DEPTH_SLOPE_CAP = 1.2;
const to3 = (pts: readonly (readonly [number, number])[], z: number, from?: number, to?: number, shareFrom = 0.25, shareTo = 0.25, through = false, clear?: ClearProfile, along?: readonly (readonly [number, number])[]): Vec3[] => {
  // (the easing runs over the share of the course's LENGTH, not of its point count: a course whose points are bunched (the umbilical vein's leave-the-wall bend) would otherwise climb to its tier within the bend, a tube
  //  diving at the camera, whose shading is a dark patch (20 Nov, the eyes' crops of 4089d1a))
  // (`along`: the course the depth is spread over, when it is not `pts` itself: a coiling vessel's depth runs along its course AT REST, so a point of it keeps its depth as the course lengthens. Otherwise the coil moved every point's depth, and the held end
  //  of a skinned collateral with it)
  const lenOn = along ?? pts, cum = [0]; for (let i = 1; i < lenOn.length; i++) cum.push(cum[i - 1]! + Math.hypot(lenOn[i]![0] - lenOn[i - 1]![0], lenOn[i]![1] - lenOn[i - 1]![1]));
  const total = cum[cum.length - 1]! || 1;
  // (and a change of depth never runs steeper than DEPTH_SLOPE_CAP: a short course between far tiers eases over more of itself than a quarter)
  const wide = (dz: number, share: number): number => Math.min(0.5, Math.max(share, (1.5 * Math.abs(dz)) / (DEPTH_SLOPE_CAP * len3(total))));
  const sf = from == null ? shareFrom : wide(from - z, shareFrom), st = to == null ? shareTo : wide(to - z, shareTo);
  return pts.map(([x, y], i): Vec3 => {
    const u = cum[i]! / total;
    // (`through`: smooth joins, a vessel that ends in the right atrium: no level of its own, one gentle slope from the depth it starts at to the atrium's)
    if (through && to != null) { const z0 = from ?? z; return [x3(x), y3(y), z0 + (to - z0) * smooth(u) + clearAt(clear, u)]; }
    const zz = clearAt(clear, u) + z + (from == null ? 0 : (from - z) * (1 - smooth(u / sf))) + (to == null ? 0 : (to - z) * (1 - smooth((1 - u) / st)));
    return [x3(x), y3(y), zz];
  });
};

/** Smooth joins: the depth each end eases to. Most nodes are the network's own (NODE_Z, a quarter of the course); a vessel that ends in the right atrium (smooth-joins.ts NODE_RISE) runs on a
 *  single slope to the atrium's back wall, so the cava and the SVC meet the heart at one depth and, turned, enter it (`through`). */
function depthEnds(v: NetVessel): { zf: number | undefined; zt: number | undefined; sf: number; st: number; through: boolean } {
  let zf = NODE_Z.get(v.from), zt = NODE_Z.get(v.to), through = false;
  if (smoothJoinsOn()) { const r = endDepth(v.to, zt); if (r.rise) { zt = r.z; through = true; } }
  if (smoothJoinsOn() && SVC_TRIBUTARY_IDS.has(v.id) && zf != null && zt != null) through = true;   // (the azygos arch: one slope from its node's depth to the cava's, network.ts SVC_TRIBUTARY_IDS)
  // (the end of a vein that branches is its split, not a node: it stays on its own plane, where its children begin)
  if (SPLIT_AT[v.id] != null) { if ((LIVER_BRANCH_HOSTS.out as readonly string[]).includes(v.id)) zt = undefined; else zf = undefined; }
  return { zf, zt, sf: END_SHARE, st: END_SHARE, through };
}

/** The 3D course of an edge with every end's depth, before any end is fitted to a trunk: what a branch ends on (smooth joins). */
const baseCache = new Map<string, Vec3[]>();
function baseCourse(v: NetVessel): Vec3[] {
  let c = baseCache.get(v.id);
  if (!c) {
    const plan = v.plan!;
    const base = plan.kind === 'coil' ? plan.base : [];
    const d = depthEnds(v);
    c = to3(base, TIER_Z[v.tier], d.zf, d.zt, d.sf, d.st, d.through);
    baseCache.set(v.id, c);
  }
  return c;
}
const nearestOn = (p: Vec3, poly: readonly Vec3[]): { at: Vec3; d: number } => {
  let best = Infinity, at: Vec3 = poly[0]!;
  for (let i = 1; i < poly.length; i++) {
    const a = poly[i - 1]!, b = poly[i]!;
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ap = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
    const t = Math.max(0, Math.min(1, (ap[0]! * ab[0]! + ap[1]! * ab[1]! + ap[2]! * ab[2]!) / (ab[0]! ** 2 + ab[1]! ** 2 + ab[2]! ** 2 || 1)));
    const q: Vec3 = [a[0] + t * ab[0]!, a[1] + t * ab[1]!, a[2] + t * ab[2]!], d = Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
    if (d < best) { best = d; at = q; }
  }
  return { at, d: best };
};

/** What a branch's end is fitted to: where it ends, and the trunk's radius, so the tube's collar and cap stay inside it. */
export type { Buried } from './tubes.ts';
/** Smooth joins: a branch's end moves onto the centreline of the trunk it ends on (the nearest of its candidates, if within `ATTACH_REACH` of that trunk's radii), easing back to its course over
 *  its first or last quarter, so no gap shows between its last ring and the trunk's wall; the radius its collar and cap may take is returned, so they never stand out of the trunk's far side. */
export function fitEnds(v: NetVessel, pts: Vec3[]): { pts: Vec3[]; buried: readonly [Buried | null, Buried | null] } {
  const sm = SMOOTH.get(v.id), buried: [Buried | null, Buried | null] = [null, null];
  if (!sm) return { pts, buried };
  if (!isPlain(v)) {
    // a collateral or a shunt keeps its own course (its strands braid along it), but its fillet is never wider than the trunk it ends on
    for (const end of [0, 1] as const) { const r = sm.hostR[end]; if (r && v.flare?.[end]) buried[end] = { max: CEIL * r, d0: 0.5 * r, d1: 0.85 * r, ceil: CEIL * r }; }
    return { pts, buried };
  }
  const out = pts.map((p): Vec3 => [p[0], p[1], p[2]]), n = out.length;
  for (const end of [0, 1] as const) {
    const cands = sm.attach[end];
    if (!cands) continue;
    const p = end ? out[n - 1]! : out[0]!;
    let best: { at: Vec3; d: number; r: number } | null = null;
    for (const id of cands) {
      const h = NETWORK_BY_ID.get(id);
      if (!h || !isPlain(h)) continue;
      const hit = nearestOn(p, baseCourse(h));
      if (!best || hit.d / h.radius < best.d / best.r) best = { at: hit.at, d: hit.d, r: h.radius };
    }
    if (!best || best.d > ATTACH_REACH * best.r) continue;
    // THE JUNCTION IS A FORK (the one construction every junction has, liver-branches.ts): the branch ends on the host's centreline at its OWN width, a little behind the host so the host's wall covers its start, and leaves at its angle. No collar, no
    // buried ring: the outline of the two together is the outline of their union (neighbour.ts), exactly, so there is no pad, knot or broken line where they meet (Mohammad, 20 Nov: "the coronary vein and the SMV SV junctions still suck").
    // (a THIN branch ending at a skinned node is not tucked: the skin owns that join and judges an arm's depth against the host's axis, so a branch tucked two of its own radii behind it was held out of the skin's outline at the host's front wall and the host's ink ran across its mouth: the epigastric vein into the superior cava, Mohammad 22 Nov)
    const skinned = PHASE_2_NODES.has(end ? v.to : v.from) && v.radius < THIN_ARM * best.r;
    const tuck = skinned ? JUNCTION_TUCK_MIN : best.r > v.radius ? Math.max(JUNCTION_TUCK_MIN, Math.min(JUNCTION_TUCK, 0.8 * (best.r - v.radius))) : JUNCTION_TUCK_MIN;
    const delta = [best.at[0] - p[0], best.at[1] - p[1], best.at[2] - p[2] - tuck];
    for (let i = 0; i < n; i++) {
      const u = end ? (n - 1 - i) / Math.max(1, n - 1) : i / Math.max(1, n - 1), w = 1 - smooth(u / END_SHARE);
      if (w <= 0) continue;
      out[i]![0] += delta[0]! * w; out[i]![1] += delta[1]! * w; out[i]![2] += delta[2]! * w;
    }
    buried[end] = null;
  }
  return { pts: out, buried };
}
/** How far behind its host's axis a branch ends (scene units): the host's wall covers the branch's start, as a side branch's does (liver-branches.ts Z_TUCK), but never more than the room the host's width leaves, so the branch's end ball stays inside it. */
export const JUNCTION_TUCK = 0.02;
export const JUNCTION_TUCK_MIN = 0.002;
/** A branch under this share of its host's radius is a thin arm of the host's skin (see fitEnds). */
export const THIN_ARM = 0.5;
const minR = len3(0.35);
const CAV_MEET = 1 / 7;

/** The depth each crossing asks of a vessel (clearance.ts), made once from the courses with none, per smooth-joins setting (the courses differ at the ends). Undefined for a vessel that gives way nowhere. */
const CLEAR = new Map<boolean, Map<string, ClearProfile>>();
let clearing = false;
/** Every vessel's clearance profile (the ones that give way somewhere), for the current smooth-joins setting. */
export function clearanceProfiles(): ReadonlyMap<string, ClearProfile> { return clearanceTable(); }
function clearanceOf(v: NetVessel): ClearProfile | undefined { return clearing ? undefined : clearanceTable().get(v.id); }
function clearanceTable(): Map<string, ClearProfile> {
  const on = smoothJoinsOn();
  let m = CLEAR.get(on);
  if (!m) {
    clearing = true;
    try { m = clearances({ network: NETWORK, course: (n) => coursesOf(n, REST)[0]?.pts as Vec3[] | undefined }); } finally { clearing = false; }
    CLEAR.set(on, m);
  }
  return m;
}

const restCoils = new Map<string, ReturnType<typeof coilCourses>>();
/** A coiling vessel's 2D courses at rest (no coil, no spread, no pin). */
function restCoil(v: NetVessel): ReturnType<typeof coilCourses> {
  let r = restCoils.get(v.id);
  if (!r) { const p = v.plan as unknown as { base: [number, number][]; coils: boolean }; r = coilCourses(v.id, p.base, p.coils, 0, 1); restCoils.set(v.id, r); }
  return r;
}
const restLens = new Map<string, number[]>();
/** The courses' lengths with the vessel at rest (no coil, no pin), by course: what the held rings of a pinned course are spaced by (tubes.ts `hold`). */
function restLensOf(v: NetVessel, s: ShapeState): number[] {
  const key = `${v.id}|${s.strandsOn ? 1 : 0}|${s.rec.toFixed(2)}`;
  let l = restLens.get(key);
  if (!l) {
    l = coursesOf(v, { ...s, wig: 0, spr: 1, bead: 0, pin: undefined }).map((c) => new CatmullRomCurve3(c.pts.map((p) => new Vector3(p[0], p[1], p[2]))).getLength());
    restLens.set(key, l);
  }
  return l;
}
/** A pinned vessel's courses carry their rest length and the held share at each end, so the tube spaces its rings from the ends as at rest (tubes.ts `hold`). */
function held(v: NetVessel, s: ShapeState, cs: Course[]): Course[] {
  const lens = restLensOf(v, s), [a, b] = s.pin!;
  // (the bands thin a course everywhere, so inside the held stretch the width stays as at rest: the seam, and the skin on it, never see a band)
  const r0 = BANDED.has(v.id) && s.bands > 0 ? coursesOf(v, { ...s, bands: 0, pin: undefined }).map((c) => c.radius) : null;
  return cs.map((c, i) => ({ ...c, hold: { len: lens[i] ?? lens[0]!, a, b, ...(r0 && r0[i] != null ? { r0: r0[i] } : {}) } }));
}

/** The courses (the vessel's own first) at `s`. */
export function coursesOf(v: NetVessel, s: ShapeState): Course[] {
  const plan = v.plan!, z = TIER_Z[v.tier];
  if (plan.kind === 'coil') {
    const coiled = coilCourses(v.id, plan.base as [number, number][], plan.coils, s.wig, s.spr, s.pin);
    const { main } = coiled;
    let { strands } = coiled;
    if (v.id === 'C8') {
      // the cavernoma: channels in the frame of the clotted trunk (its two pieces), grown with the recruitment, each whole and joined at both ends
      const trunk = ['PV_TRUNK_1', 'PV_TRUNK'].map((id) => (NETWORK_BY_ID.get(id)!.plan as unknown as { base: [number, number][] }).base);
      const ch = cavChannels(trunk, main);
      // (each channel is drawn in the frame of the trunk, so its ends lay across the trunk's width and their round caps stood out of its side as a knot: they ease onto the vessel's own course over the last
      // seventh at each end, where the channels meet the portal vein and the hepatic hilum, so all of them run into the trunk's centre there and the trunk covers the joins; Mohammad, 20 Nov: "a knotted, capped lump")
      const meet = (pts: readonly (readonly [number, number])[]): [number, number][] => pts.map((p, j): [number, number] => {
        const u = j / Math.max(1, pts.length - 1), e = Math.min(u, 1 - u) / CAV_MEET, w = e >= 1 ? 1 : smooth(e), m = main[Math.min(main.length - 1, j)]!;
        return [m[0] + (p[0] - m[0]) * w, m[1] + (p[1] - m[1]) * w];
      });
      strands = ch.map((pts, i) => { const g = cavGrowth(i, s.rec); return { pts: meet(pts), k: CAV[i]!.k * g, ph: 0, live: Math.min(1, g * 4) }; });   // (grown whole and joined at both ends; its opacity over its first quarter: here its width)
    }
    const de = depthEnds(v), zf = de.zf, zt = de.zt;
    const atRest = restCoil(v);
    let m = to3(main, z, zf, zt, de.sf, de.st, de.through, clearanceOf(v), atRest.main);
    // smooth joins: a branch's end onto its trunk, the ends' widths and caps by the pairs (smooth-joins.ts); off, the course is the 2D rule's own
    const sj = smoothJoinsOn() ? SMOOTH.get(v.id) : undefined;
    let buried: readonly [Buried | null, Buried | null] | undefined;
    if (sj) { const f = fitEnds(v, m); m = f.pts; buried = f.buried; }
    // the bands: each one closes a channel of the varices' plexus (strand i is live while the count is under i + 1) and the rest shrink (stage-tubes.js widthWrites: 0.14 a band, to four)
    const banded = BANDED.has(v.id), rad = banded ? v.radius * (1 - 0.14 * Math.min(4, s.bands)) : v.radius;
    // the varices bead by their size: every strand, and the gastrorenal shunt itself (varix-bead.js)
    const lambda = beadLambda(v.id) as number, beads = s.bead > 0 && beadsOn(v.id);
    // (a vein that branches is one tube from its root to the tip of its through branch: it narrows gently to TIP of its width over its whole length, has no cap at its tip and fades to nothing there; its side branch starts inside it)
    const cut = cutEnd(v.id);
    let taper = sj ? sj.taper : v.taper, taperSpan = sj?.taper ? sj.span : undefined, capless = sj ? sj.joined : v.joined;
    if (cut != null) {
      const t: [number, number] = [taper?.[0] ?? 1, taper?.[1] ?? 1], sp: [number, number] = [taperSpan?.[0] ?? 0.3, taperSpan?.[1] ?? 0.3];
      t[cut] = TIP; sp[cut] = 1; taper = t; taperSpan = sp;
      if (capless) { const cl: [boolean, boolean] = [capless[0], capless[1]]; cl[cut] = false; capless = cl; }
    }
    // (a surgical shunt sewn onto a vein narrows to the host's caliber at that end, sinks inside its wall and flares at its heel: 2D SIDE_HOSTS / SINK / FLARED)
    if (sj && NARROWS_INTO_NEIGHBOUR(v) && !sj.taper) { const n0 = narrowTo(v, 0), n1 = narrowTo(v, 1); if (n0 < 1 || n1 < 1) taper = [Math.min(taper?.[0] ?? 1, n0), Math.min(taper?.[1] ?? 1, n1)]; }
    const sewn = shuntEnds(v.id);
    if (sewn) taper = [Math.min(taper?.[0] ?? 1, endShare(sewn[0], rad)), Math.min(taper?.[1] ?? 1, endShare(sewn[1], rad))];
    // (the paraumbilical vein ends in the caput's hub, where the fan's roots start: it narrows over its last stretch to the widest root, so one round hub of their width, not a ball wider than every tube that leaves it)
    if (v.id === 'C3') { const hub = hubRootRadius(s); if (hub > 0 && rad > 0) taper = [taper?.[0] ?? 1, Math.min(taper?.[1] ?? 1, Math.min(1, hub / rad))]; }
    // (THE BANDS NARROW THE SEGMENT, NOT ITS HANDOVERS: the coronary vein and the azygos are not banded, so the end of the segment that meets one keeps the width it meets it at, however many bands there are, and the strands' ends too: a band-narrowed end
    //  met the coronary vein at 0.44 of its width and left its square cut end showing, Mohammad, 22 Nov: "coronary vein into varices look not welded". The station inside the segment narrows with both halves, as before.)
    if (banded && rad > 0 && rad < v.radius) for (const e of [0, 1] as const) if (outerEnd(v.id, e) && !(s.pin && s.pin[e] > 0)) {   // (a held end, under a skin, already keeps its rest width: `held`)
      const t: [number, number] = [taper?.[0] ?? 1, taper?.[1] ?? 1]; t[e] *= v.radius / rad; taper = t; }
    const own: Course = { pts: m, radius: rad, taper, taperSpan, flare: sj && isPlain(v) && v.flare ? ([sj.attach[0] ? null : v.flare[0], sj.attach[1] ? null : v.flare[1]] as const) : v.flare, ...(sewn ? { sewn } : {}), capless, clamp: buried, point: sj && !fadeOf(v.id, v.tone === 'artery') ? (cut != null ? ([sj.free?.[0] && cut !== 0, sj.free?.[1] && cut !== 1] as unknown as typeof sj.free) : sj.free) : undefined, bead: beads && v.id === 'C5' ? { b: s.bead, ph: 0.9, u0: 0, lambda: BEAD_LAMBDA_FUNDAL as number, len: len2d(main) } : undefined };
    // a varix is its few strands, each running whole from the vessel that feeds it to the one that drains it: the trunk's own tube, a solid fill the width of the bundle, is not drawn while
    // they are (Mohammad, 20 Nov: "what's that red mesh"); each strand widens to the trunk's width at its two ends, so it meets the vessels there without a step
    const bundle = s.strandsOn && strands.length > 0 && v.kind === 'collateral';   // (the cavernoma too: its trunk tube showed as a hard violet block where the clot does not cover the portal vein)
    if (bundle) own.radius = 0;
    // (strands that wind round one axis meet on it: their union at a gathered end is one strand wide, so each is the trunk's whole width there; strands that part at once share it, coil.ts WEAVE)
    const gathered = WEAVE[v.id] ? 1 : strands.length;
    const fit = bundle && FAN_IDS.has(v.id), thick = BANDED.has(v.id) ? VARIX_THICK : 1;
    const out = [own, ...strands.map((c, i) => {
      if (!s.strandsOn) return own;
      // (the strands open one after another as the varix grows and close one after another as it shrinks: the strand the bands close first is the last to open; a banded one stays a cord, whatever its size)
      const open = fit ? strandOpen(i, strands.length, s.spr) : 1;
      const live = (banded ? Math.max(BANDED_CORD, Math.min(1, Math.max(0, i + 1 - s.bands)) * open) : 1) * (c.live ?? 1);
      return {
        pts: to3(c.pts, z, zf, zt, de.sf, de.st, de.through, undefined, atRest.strands[i]?.pts).map((p, j): Vec3 => (c.dz ? [p[0], p[1], p[2] + len3(c.dz[j] ?? 0)] : p)), radius: Math.max(minR, rad * c.k * thick) * live,   // (0: a channel not yet grown draws none of it; a strand a band has closed is a thin cord, BANDED_CORD)
        // THE CAVERNOMA'S CHANNELS end in a tip, not in a widened, collared, round-capped end: six channels each opened out to the whole C8 width (and a collar, and a ball) where they all meet at the node stood as a faceted star of overlapping
        // ends, a hub the trunk did not cover once it was narrowed or clotted (Mohammad, 20 Nov: "the collaterals fan out from faceted star hubs"). Each narrows to a fine point over its last few radii, so the bundle runs together into the vein
        // at the node (the same free-end taper every other tube's end has, tubes.ts `point`), and nothing is a ball.
        // each strand's two ends are sewn onto the host as the trunk's would be (shunt-ends.ts: narrowed to the host's width above, sunk and flared here); the cavernoma's channels end in a point instead
        ...(bundle && v.id !== 'C8' && own.sewn ? { sewn: own.sewn } : {}),
        ...(bundle && v.id === 'C8' ? { taper: undefined, taperSpan: undefined, flare: undefined, capless: [false, false] as const, clamp: undefined, point: [true, true] as const } : {}),
        // (the ends keep the trunk's calibre however far a strand has closed (banded, or not yet open): a cord that met its trunk at the cord's own width left a step at the station of the one segment, where the azygos' drain begins at its full width)
        ...(bundle && v.id !== 'C5' && v.id !== 'C8' ? { taper: [(own.taper?.[0] ?? 1) / (c.k * thick * Math.max(live, 0.05)) * bundleShare(own.sewn?.[0], gathered), (own.taper?.[1] ?? 1) / (c.k * thick * Math.max(live, 0.05)) * bundleShare(own.sewn?.[1], gathered)] as const, taperSpan: fit ? FAN_SPAN : own.taperSpan ?? ([0.3, 0.3] as const), flare: own.flare, capless: own.capless, clamp: own.clamp } : {}),
        bead: beads && v.id !== 'C5' ? { b: s.bead, ph: c.ph * 1.7, u0: (STRAND_FROM_2D as Record<string, number>)[v.id] ?? 0, lambda, len: len2d(c.pts) } : undefined,
      };
    })];
    // a strand end that lands on a host's wall and does not leave the node as one bundle (which a junction skin welds) fans out along the host (strand-fan.ts): the strands no longer pile into one point inside it
    if (bundle && v.id !== 'C8' && v.id !== 'C5' && strands.length > 1) fanStrandEnds(v, out);
    return s.pin && (s.pin[0] > 0 || s.pin[1] > 0) ? held(v, s, out) : out;
  }
  // a fan: each tributary's width is the host's times the group's share and its own (at least 1.2 units), thinner while the group is only part on
  const fan = plan.list.map((f) => ({ ...(f.taper ? { taper: f.taper, taperSpan: f.taperSpan ?? ([0.3, 0.9] as const) } : {}), ...(f.join != null ? { capless: (f.join === 0 ? [true, false] : [false, true]) as readonly [boolean, boolean] } : {}), pts: f.dz ? to3(f.pts, z).map((p, i): Vec3 => [p[0], p[1], p[2] + f.dz![i]!]) : to3(f.pts, z), radius: len3(Math.max(0.35, Math.max(1.2, plan.hostW * plan.cfgK * f.k * (f.atEnd && smoothJoinsOn() ? SMOOTH.get(v.host)?.taper?.[1] ?? 1 : 1) * (plan.when ? 0.5 + 0.5 * s.live : 1)) / 2)) }));
  return withFanJoints(fan);
}

/** The strands (courses 1.. of `out`) of a braid fanned at each end that lands on a host and is no bundle: the width a strand has at the host's wall sets how far apart they land. Rewrites the courses' points. */
function fanStrandEnds(v: NetVessel, out: Course[]): void {
  const cs = out.slice(1);
  for (const end of [0, 1] as const) {
    const e = out[0]!.sewn?.[end];
    if (!e?.dir || leaveAsBundle(cs.map((c) => c.pts as Vec3[]), end, v.radius)) continue;
    let r = 0;
    for (const c of cs) {
      let len = 0; for (let i = 1; i < c.pts.length; i++) len += Math.hypot(c.pts[i]![0] - c.pts[i - 1]![0], c.pts[i]![1] - c.pts[i - 1]![1], c.pts[i]![2] - c.pts[i - 1]![2]);
      const d = Math.min(len * 0.5, e.hostR), u = end ? 1 - d / len : d / len;
      r = Math.max(r, radiusAtU(c, u, len) * sewnAt(e, end, d));
    }
    const fanned = fanEnd(cs.map((c) => c.pts as Vec3[]), end, e.dir, r);
    cs.forEach((c, i) => { c.pts = fanned[i]!; });
  }
}

/** The share of the trunk's width each of `n` strands takes at an end that is sewn onto a host: they all land on one point, so together (not each) they make the trunk's width there (n strands of 1/sqrt(n) of it have its area); at an end that is not sewn each still meets the vessel at the trunk's full width, as before. */
export const bundleShare = (sewn: unknown, n: number): number => (sewn && n > 1 ? 1 / Math.sqrt(n) : 1);

/** The widest root of the caput's fan at full growth (the courses that start where no other ends): what the paraumbilical vein narrows to at the hub. */
function hubRootRadius(s: ShapeState): number {
  const fan = NETWORK_BY_ID.get('C3~F:caput');
  if (!fan) return 0;
  const cs = coursesOf(fan, { ...s, live: 1 });
  let r = 0;
  cs.forEach((c) => { if (c.lens && c.lens[0] === 0) r = Math.max(r, c.radius); });
  return r;
}

/** A tree of tributaries (the caput's fan): each course wears the stretch of the host's colour ramp its place gives it (no colour step at a fork), and only the widest end at a point keeps its cap (one round hub). */
function withFanJoints(courses: Course[]): Course[] {
  if (courses.length < 2) return courses;
  const lens = fanLensRanges(courses), caps = fanCaps(courses), tips = fanTips(courses);
  return courses.map((c, i) => {
    const cl = c.capless, capless: readonly [boolean, boolean] = [(cl?.[0] ?? false) || !caps[i]![0], (cl?.[1] ?? false) || !caps[i]![1]];
    // (a free tip narrows to a point and eases to transparent over the last of its course: it thins out of sight, it never ends in a stub)
    return { ...c, ...(lens[i] ? { lens: lens[i]! } : {}), ...(capless[0] || capless[1] ? { capless } : {}), ...(tips[i] && lens[i] ? { tipFade: FAN_TIP_FROM, point: [false, true] as const } : {}) };
  });
}

/** A collateral is drawn by its STRANDS (the trunk's own tube is not drawn while they are), and on the Circuit's map every strand is carried by the ONE map course: three tubes laid over one another. Built with the few rings the body needs (a strand of C4: 77 on 1250 map units) each cut the
 *  corner of that course (a 16 unit arc) its own way, three different zig-zags over one bend with stray ink where their chords crossed (Mohammad, 22 Nov: the rectal and retroperitoneal bends). A strand is built with this many times the rings the map asks of the trunk (24 to a scene unit, circuit/geometry.ts
 *  slicesFor, 6.4 map units a ring): a ring every 3 map units or less, so a corner is 8 rings or more of arc. The trunk's own count is left as it was: the junction skins are meshed on it (the meshes depend on where its rings lie), and a skin's strand arms (braid-arm.ts) take the strands' count from here. */
export const STRAND_RING_K = 2.2;
/** The most rings a strand is built with. */
export const STRAND_RINGS_MAX = 600;

/** The tube segments each course is built with, fixed at rest so a coil changes positions and never the vertex count. */
export function tubularOf(v: NetVessel, minFirst = 0): number[] {
  // (always counted on the 2D rule's courses, so the vertex count never depends on the smooth-joins switch: a toggle rewrites the tubes in place, VesselObject.reshape)
  const was = smoothJoinsOn();
  setSmoothJoins(false);
  const rest = (() => { try { return coursesOf(v, REST); } finally { setSmoothJoins(was); } })(), plan = v.plan!;
  return rest.map((c, i) => {
    let len = 0;
    for (let i = 1; i < c.pts.length; i++) len += Math.hypot(c.pts[i]![0] - c.pts[i - 1]![0], c.pts[i]![1] - c.pts[i - 1]![1], c.pts[i]![2] - c.pts[i - 1]![2]);
    return Math.max(i === 0 ? minFirst : Math.min(STRAND_RINGS_MAX, Math.ceil(minFirst * STRAND_RING_K)), tubularFor(len, (plan.kind === 'coil' && !(plan.coils || plan.strands) ? 1 : 2) * (DIVIDED_IDS.has(v.id) ? 3 : 1)));   // (a divided vein's round stump is built from rings a third as far apart: vessels/divide.ts)
  });
}
