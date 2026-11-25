// How a vessel fades at a free end, as the 2D figure does it (tables copied by scripts/copy-b3-data.mjs): the veins that end in the organ they drain (the splenic hilum, the bowel, the
// colon, the kidney) fade in from nothing over the first part of their length; the hepatic artery fades in at its start and its branches out at their ends, where they turn into
// sinusoids; the veins that run on out of the plate fade out down it. A fading tip is solid to its end while a collateral attaches there (TIP_CONNECT).
import { EDGES } from '../../engine/hales/portal/topology.js';
import { x3, y3 } from '../frame2d.ts';
import { ART_FADE_2D, FADE_DOWN_Y_2D, FADE_IN_2D, FEEDER_FADE_Y_2D, SIN_EDGES_2D, SIN_FADE_C9_2D, SIN_FADE_ROW_2D, TIP_CONNECT_2D, TIP_FADE_2D } from './fades.copied.ts';
import { EDGE_PATH_2D, IVC_EDGES, NODE_POS_2D } from '../anatomy/source.ts';
import { PLACED_EDGE_3D, PLACED_PATH_2D } from '../anatomy/placed-network.ts';
import { alongVein, alongVeinCompanion, alongVeinStretch, originsOf, startInOrganShare, endOn } from './starts.ts';
import { END_JOIN, LIVER_BRANCH_HOSTS, splitShare, treeOf } from './liver-branches.ts';
import { CAUDATE_HOST, CAUDATE_VEIN_ID } from './caudate-veins.ts';

/** The cava is a background vessel too (Mohammad, 20 Nov: "IVC should be faded not prominent"): drawn at this share of its opacity, body, outline and chevrons together, lens colour kept. It rises to whole (1) when the cava is
 *  selected or named (the HVPG catheter, a slide about it: scene.ts stepCava eases it), and its end at the right atrium climbs back to full over its last stretch, where the superior cava arrives whole. */
export const CAVA_RECEDE = 0.45;
/** The opacity a cava vessel's end comes to when the cava is shown whole (selected or named), from its resting opacity `rest` (its own fade times CAVA_RECEDE): the recede is taken away and nothing else, so an end that rests at nothing (the lower cava's
 *  fade down the figure, ILI_IVC) stays nothing and the vessel still fades out there. Before, whole raised every end to 1: the fade was let go and the picked cava ended in a round cap with a hard ink rim (Mohammad, 22 Nov: "when selected the end of the IVC should just be fade"). */
export const cavaWholeAlpha = (rest: number): number => Math.min(1, rest / CAVA_RECEDE);
/** stage-geo.js IVC_NODES, IVC_JOIN_LEN, HEPATIC_VEINS: a vein that ends on the faint cava fades into it over its last 60 units (12 for the portocaval and mesocaval shunts), so the join is seamless. */
const IVC_NODES: ReadonlySet<string> = new Set(['IVCS', 'IVCI', 'RA', 'IVC_D', 'ILI_R']);
export const HEPATIC_VEINS: ReadonlySet<string> = new Set(['RHV_IVC', 'RHV_IVC_1', 'MHV_IVC', 'LHV_IVC', 'LRV_IVC', 'RRV_IVC']);
export const IVC_JOIN_LEN = 60;
/** A hepatic vein that opens into the cava: one of the hepatic veins whose END is on the cava's node. The right hepatic vein is two pieces (RHV_IVC_1 from the liver to the TIPS junction, RHV_IVC from there to the cava), and only the second one opens into
 *  the cava: the rules for "a vein into the cava" (the end eased to the cava's alpha, the ink held back inside the cava, the part inside the lumen cut away) are keyed by where the vein ENDS, never by its name (root cause of the broken outline and the light line
 *  at the join of the two pieces in the Circuit, 20 Nov). */
/** A carried-on start in the placed anatomy (starts.ts START_IN_ORGAN): the share of the placed course before the point where the collaterals that end on its start node land on it (their last points' nearest point of the course), or null with none.
 *  The fade-in covers exactly that, so the vein is whole where they join it. The 2D share (startInOrganShare: the 30 units carried on behind the 2D landing, over the 2D course's length) measured the 2D figure: the placed azygos arch is 0.14 long and
 *  its esophageal collateral (C1b) lands 0.7 of the way along it, so the 2D share (0.37) faded it over 1.6 of its widths and left it solid for half its run before the landing (the arch "should fade to the left", Mohammad 22 Nov). A vessel that runs on
 *  into the start (originsOf: the ascending lumbar into the azygos) is its origin, not a landing. */
function placedLandingShare(id: string): number | null {
  const e = edgeById.get(id), c = PLACED_EDGE_3D[id];
  if (!e || !c || c.length < 2 || startInOrganShare(id, EDGE_PATH_2D[id] ?? []) <= 0) return null;
  const origins = new Set(originsOf(id)), cum = [0];
  for (let i = 1; i < c.length; i++) cum.push(cum[i - 1]! + Math.hypot(c[i]![0] - c[i - 1]![0], c[i]![1] - c[i - 1]![1], c[i]![2] - c[i - 1]![2]));
  const L = cum[cum.length - 1]!;
  let best: number | null = null;
  for (const o of EDGES as { id: string; to: string }[]) {
    if (o.to !== e.from || origins.has(o.id)) continue;
    const oc = PLACED_EDGE_3D[o.id]; if (!oc?.length) continue;
    const q = oc[oc.length - 1]!;
    let bd = Infinity, bs = 0;
    c.forEach((p, i) => { const d = Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); if (d < bd) { bd = d; bs = cum[i]! / L; } });
    best = Math.max(best ?? 0, bs);
  }
  return best != null && best > 0 ? best : null;
}
export function opensIntoCava(id: string): boolean {
  if (id === CAUDATE_VEIN_ID) return true;   // (the caudate lobe's short veins open into the cava's left wall by the same rule: caudate-veins.ts)
  const e = edgeById.get(id);
  return HEPATIC_VEINS.has(id) && !!e && IVC_NODES.has(e.to);
}
/** The cava's piece a vein that opens into it meets: the inferior cava below the hepatic veins' node (the renal veins' side) or above it. */
export const cavaPieceOf = (id: string): string => (id === CAUDATE_VEIN_ID ? CAUDATE_HOST : edgeById.get(id)?.to === 'ILI_R' ? 'ILI_IVC_1' : edgeById.get(id)?.to === 'IVCI' ? 'IVC_IS_1' : 'IVC_IS');
/** THE OSTIUM, read from the topology as drawn (never from the engine's node alone): the vein whose wall vein `id` opens into. The cava's piece for a vein that opens into the cava; null for every other vessel. Each hepatic vein opens into the cava
 *  at its own ostium (Mohammad, 25 Nov 2026: "Move the middle hepatic vein to be separate from left", replacing round 18's common trunk of the middle and left ones). The ostium's cut, colour and opacity (scene.ts setCavaCut), the neighbour data
 *  (neighbour.ts) and the Budd-Chiari clot (disease/host.ts) all read this, and so do the tests that pin them. */
export const ostiumHostOf = (id: string): string | null => (opensIntoCava(id) ? cavaPieceOf(id) : null);
/** The share along `cavaPieceOf(id)` where the vessel joins it: 0 for a piece that starts at the vessel's node (the lower cava's two pieces), else 1. */
export const cavaJoinShare = (id: string): number => (cavaPieceOf(id) === 'IVC_IS_1' || cavaPieceOf(id) === 'ILI_IVC_1' ? 0 : 1);
/** A collateral that fades into the cava (the retroperitoneal veins, C7: `ivcJoinSpan`) is one tube with it like a hepatic vein is (Mohammad, 22 Nov: "retroperitoneal veins aren't welded into the IVC"): it takes the cava's colour and opacity as it nears the wall and is cut at the wall,
 *  so nothing of it lies inside the faint lumen (its strands piled into a translucent wedge there, outlines crossing). Keyed by where the vessel ENDS and what it is, never by its name. A shunt that lands on the cava has a junction skin (the skin carries the same rule). */
export function landsOnCava(id: string): boolean { const e = edgeById.get(id); return !!e && e.kind === 'collateral' && ivcJoinSpan(id) > 0; }
/** The superior cava's two stretches are the cava itself, not a vein that joins it: they run on into the right atrium solid, as the inferior cava does (Mohammad, 20 Nov: "a hard colour step in the IVC at the right atrium": the SVC faded to 0.3 at the atrium where the IVC meets it whole). */
const SVC_STRETCH: ReadonlySet<string> = new Set(['SVC_RA', 'SVC_RA_1']);
/** Its alpha at the cava's wall: the cava's own (2D's IVC_JOIN was 0.3 against its veil of 0.4; the cava here is drawn at CAVA_RECEDE, and a vessel that merges into a faded one comes to the same fade at the junction: Mohammad, 20 Nov). */
export const IVC_JOIN_ALPHA = CAVA_RECEDE;
/** A branching portal vein and its side branch stay whole until the side branch has cleared the vein (a share of the run past the split): fading both over the overlap stacked their alphas into a dark ghost stub at every fork (Mohammad, 20 Nov). */
export const FORK_CLEAR = 0.5;
const edgeById = new Map((EDGES as { id: string; from: string; to: string; kind: string }[]).map((e) => [e.id, e]));
const lenOfPath = (p: readonly (readonly [number, number])[]): number => { let l = 0; for (let i = 1; i < p.length; i++) l += Math.hypot(p[i]![0] - p[i - 1]![0], p[i]![1] - p[i - 1]![1]); return l; };
/** The share of its length over which vessel `id` fades into the faint cava, or 0 for a vessel that does not end on it. */
export function ivcJoinSpan(id: string): number {
  const e = edgeById.get(id), path = EDGE_PATH_2D[id];
  if (!e || !path || IVC_EDGES.has(id) || SVC_STRETCH.has(id) || HEPATIC_VEINS.has(id) || !IVC_NODES.has(e.to) || !NODE_POS_2D[e.to] || !NODE_POS_2D[e.from]) return 0;
  if (e.kind === 'shunt' && id !== 'S_PC' && id !== 'S_MC') return 0;   // (the stents' ends stand as strong as their middle: JOIN_F_NOFADE)
  const l = lenOfPath(path);
  return l > 0 ? Math.min(id === 'S_PC' || id === 'S_MC' ? 12 : IVC_JOIN_LEN, l) / l : 0;
}

export interface TipFade {
  /** 1: along the vessel (0 to 1), 2: down the figure (scene y), 3: along a line across the figure (2D's linear mask: solid from `from` = its offset), 4: along a line, with a dip (faintest at `from`, solid at the end) */
  mode: 1 | 2 | 3 | 4;
  from: number; to: number;
  /** modes 3 and 4: the line, scene (x1, y1, x2, y2) */
  line?: readonly [number, number, number, number];
  /** alpha at `from` and at `to` */
  a0: number; a1: number;
  /** the Circuit does not let go of it (the artery's fades hold in both views) */
  keep: boolean;
  /** the Circuit's own fade (a share of the map course, from to to): only an artery's end lets go of nothing on the map (MAP_ART_FADE) */
  mapFade?: readonly [number, number];
  /** the collaterals whose being open makes the tip solid */
  connect: readonly string[];
  /** a fade into the faint cava: it goes while the cava is drawn whole (selected or named) */
  ivcJoin?: boolean;
}

const sceneLine = (x1: number, y1: number, x2: number, y2: number): readonly [number, number, number, number] => [x3(x1), y3(y1), x3(x2), y3(y2)];
const SIN_SET: ReadonlySet<string> = new Set(SIN_EDGES_2D);
/** stage-geo.js SIN_FADE: a liver bed is faded along its course (the line from its portal node to its venous one), faintest mid-lobe, solid at its end; the ascending lumbar collateral dips behind the liver the same way, down the figure. */
function sinFade(id: string): TipFade | null {
  if (id === 'C9') { const r = SIN_FADE_C9_2D; return { mode: 4, from: r[4]!, to: 1, a0: r[5]!, a1: r[6]!, line: sceneLine(r[0]!, r[1]!, r[2]!, r[3]!), keep: false, connect: [] }; }
  const e = edgeById.get(id), a = e && NODE_POS_2D[e.from], b = e && NODE_POS_2D[e.to];
  if (!SIN_SET.has(id) || !a || !b) return null;
  const r = SIN_FADE_ROW_2D;
  return { mode: 4, from: r[0]!, to: 1, a0: r[1]!, a1: r[2]!, line: sceneLine(a[0], a[1], b[0], b[1]), keep: false, connect: [] };
}
/** stage-geo.js FADE_IN: a vein fades into the vessel it sinks into (the hepatic veins and the renal veins into the cava, the caudate vein, C5 into the renal vein). */
function fadeIn(id: string): TipFade | null {
  const r = FADE_IN_2D[id];
  if (!r) return null;
  return { mode: 3, from: r[4]!, to: 1, a0: 1, a1: r[5] ?? 0.3, line: sceneLine(r[0]!, r[1]!, r[2]!, r[3]!), keep: false, connect: [] };
}

/** The share of the hepatic artery's drawn length it fades in over (2D: 0.28 of its whole run, most of which is not drawn now). */
export const HEP_FADE_IN = 0.85;

/** The portal branches end, and the hepatic veins begin, in the liver's tissue (the sinusoids between are not drawn): the share of each one's length it fades over. */
export const LIVER_FADE_OUT: Readonly<Record<string, number>> = { PVH_R_2: 0.6, PVH_L_1: 0.6 };
/** Placed: the left portal vein runs on into the left lobe as one vessel (round 16) and fades out over this stretch of its second piece [from, to], earlier than LIVER_FADE_OUT's 0.4 to 1, and narrows on the way
 *  (shape.ts LIVER_TAPER): it ran "too far into the left lobe, same caliber" (Mohammad, 25 Nov). It starts past the meso-Rex landing (0.31 along it) and the umbilical vein's root (0.14), so both leave a whole vein. */
export const PLACED_LIVER_FADE: Readonly<Record<string, readonly [number, number]>> = { PVH_L_1: [0.34, 0.74] };
export const LIVER_FADE_IN: Readonly<Record<string, number>> = { RHV_IVC_1: 0.6, MHV_IVC: 0.6, LHV_IVC: 0.6 };

/** The rectal varices run on further down (starts.ts END_ON): they fade out over the new stretch instead of the 2D one. */
const FADE_DOWN_ON: Readonly<Record<string, readonly [number, number]>> = { C4: [940, 1005] };
/** The lobar arteries' ends on the map (2D's circuit lets them run out under the lane tips; here they fade to nothing over the last 70 % of the short course, gone before the lane, so no blunt end can show). */
export const MAP_ART_FADE: readonly [number, number] = [0.3, 0.9];
const ART_OUT_SHARE: Readonly<Record<string, number>> = { A_HR: 0.6, A_HL: 0.5 };

/** The fade of a vessel, or null for one that has none. A tributary fan (`feederHost`, the vein it feeds) fades as its host's FEEDER_FADE_Y says (the azygos's runs out down the figure, never ends in a cap). */
/** The veins that lie deep behind the main plane, not directly in view: they are drawn receded, at this share of their opacity everywhere, blended with whatever fade they already have (Mohammad, 20 Nov: "IVC and renal veins ... faded cuz they're
 *  not directly in view"). The cava itself is already drawn as the organs' veil (vessel-object.ts setBehindOrgans). */
export const RECEDE: Readonly<Record<string, number>> = { V_KID_L: 0.55, V_KID_L_1: 0.55, V_KID_R: 0.55, LRV_IVC: 0.55, RRV_IVC: 0.55 };
/** The vessels drawn as the cava is: behind the liver, receded to CAVA_RECEDE, whole when named. The ascending lumbar collateral is the cava's own collateral, lying behind the liver beside it (Mohammad, 20 Nov: "the ascending lumbar vein
 *  should be faded just like the IVC, and behind the liver"); its 2D dip behind the liver (SIN_FADE.C9) keeps its shape, scaled, and it comes out solid above the dome where it joins the azygos. */
export const CAVA_LIKE: ReadonlySet<string> = new Set([...IVC_EDGES, 'C9']);
const CAVA_RA_RAMP = 0.5;
export const C9_JOIN_RAMP = 0.12;
/** The hepatic veins open into the cava as solid veins, body and outline whole, to its wall (Mohammad, 20 Nov: the last stretch was "a pale, flat, see-through wedge": a vein faded to the cava's alpha over its last 40 units, and
 *  2D's own end alpha 0.5 on top of it, was a cut ribbon, not a round vein opening into the cava): no end ramp any more, so this is 0 for every vein. The vein takes the cava's colour near the wall and feathers out inside the lumen
 *  (shaders.ts cavA). */
export const CAVA_END_LEN = 0;
export function cavaEndSpan(_id: string): number { return 0; }
/** A hepatic vein that opens into the cava (not a renal vein, which is receded to the cava's tone already) keeps its alpha to the wall: 2D's end alpha for it (0.5) is dropped. */
export const keepsAlphaToCava = (id: string): boolean => opensIntoCava(id) && id !== 'LRV_IVC' && id !== 'RRV_IVC';
export function fadeOf(id: string, isArtery: boolean, feederHost?: string): TipFade | null {
  const f = placedFade(id, fadeOf0(id, isArtery, feederHost));
  if (CAVA_LIKE.has(id)) {
    // (the ascending lumbar collateral: the cava's tone along its whole run behind the liver and over the dome, climbing to full only over its last stretch where it joins the azygos arch, as the cava does at the atrium;
    //  2D's dip behind the liver and its solid return above the dome are gone: the part above the dome was a full-strength purple in a faded figure)
    if (id === 'C9') return { mode: 1, from: 1 - C9_JOIN_RAMP, to: 1, a0: CAVA_RECEDE, a1: 1, keep: false, connect: [] };
    if (id === 'IVCS_RA') return { mode: 1, from: 1 - CAVA_RA_RAMP, to: 1, a0: CAVA_RECEDE, a1: 1, keep: false, connect: [] };
    return f ? { ...f, a0: f.a0 * CAVA_RECEDE, a1: f.a1 * CAVA_RECEDE } : { mode: 1, from: 0, to: 1, a0: CAVA_RECEDE, a1: CAVA_RECEDE, keep: false, connect: [] };
  }
  const k = RECEDE[id];
  if (k == null) return f;
  return f ? { ...f, a0: f.a0 * k, a1: f.a1 * k } : { mode: 1, from: 0, to: 1, a0: k, a1: k, keep: false, connect: [] };
}
/** Placed (the approved placement): a fade written in the figure's places (down the figure, mode 2; across a line, modes 3 and 4) moves with the vessel: by how far the end it is nearest moved from the 2D course to the
 *  placed one, so the vessel still fades where it did along itself (the veins into the cava fade at the cava's new wall, the cava down where it leaves the figure). A fade along the vessel (mode 1) needs nothing. */
function placedFade(id: string, f: TipFade | null): TipFade | null {
  if (!f || f.mode === 1) return f;
  const was = EDGE_PATH_2D[id], now = PLACED_EDGE_3D[id];
  if (!was || !now || was.length < 2 || now.length < 2) return f;
  // (a vessel that runs on further than 2D draws it (starts.ts END_ON: the rectal varices) had its fade laid on that carried-on end, so that end is what moved to the placed one; read off 2D's own last
  //  point instead, the rectal varices' band was shifted 82 units too far down, below the placed course's end, and the varices ended solid in mid-belly)
  const last = endOn(id) ?? was[was.length - 1]!;
  const ends = [[x3(was[0]![0]), y3(was[0]![1]), now[0]!] as const, [x3(last[0]), y3(last[1]), now[now.length - 1]!] as const];
  const at = f.line ? [(f.line[0] + f.line[2]) / 2, (f.line[1] + f.line[3]) / 2] : [0, (f.from + f.to) / 2];
  const near = f.line ? ends.reduce((a, b) => (Math.hypot(b[0] - at[0]!, b[1] - at[1]!) < Math.hypot(a[0] - at[0]!, a[1] - at[1]!) ? b : a)) : ends.reduce((a, b) => (Math.abs(b[1] - at[1]!) < Math.abs(a[1] - at[1]!) ? b : a));
  const dx = near[2][0] - near[0], dy = near[2][1] - near[1];
  if (f.mode === 2) return { ...f, from: f.from + dy, to: f.to + dy };
  return f.line ? { ...f, line: [f.line[0] + dx, f.line[1] + dy, f.line[2] + dx, f.line[3] + dy] } : f;
}
/** A lobar artery runs on to its bed's node, past where the portal branch it travels with has faded out into the liver (Mohammad, 20 Nov: "the hepatic artery branches are extending way too much; fade them earlier"; the dotted tip was the dithered end of a fade that
 *  still had alpha where the vein's was gone). Its fade ENDS where its companion's does: the share of the artery's course nearest to the point where the portal branch (the last vein it runs beside) reaches nothing, so both vanish together and the rest of
 *  the artery is fully faded (not drawn). 1 for an artery with no branching companion. */
const COMPANION_END = new Map<string, number>();
/** The artery's course as the network draws it, in the same frame as its companion's tree (treeOf): the placed course itself on the placed anatomy (network.ts basePathOf), the 2D course run on beside the vein
 *  otherwise. (Measured on the 2D course while the tree was the placed one, the fade's end was read off a different figure: A_HR's ended about 40 units from its portal branch's.) */
const drawnArtery = (id: string): readonly (readonly [number, number])[] | null => (PLACED_PATH_2D[id] ?? null);
export function companionEnd(id: string): number {
  const hit = COMPANION_END.get(id); if (hit != null) return hit;
  const host = alongVeinCompanion(id), f = host ? fadeOf0(host, false) : null, tree = host ? treeOf(host) : null, art = drawnArtery(id);
  let u = 1;
  // (the companion's course as drawn: its through branch where it branches; on the placed anatomy a vein the placement draws unbranched (the left portal vein, PVH_L_1) is its own placed course, whose fade
  //  PLACED_LIVER_FADE ends early in the left lobe, so the left hepatic artery goes with it instead of running on to its bed: Mohammad 25 Nov, "the left portal vein ... fade earlier")
  const th = tree?.through ?? (host ? PLACED_PATH_2D[host] ?? null : null);
  if (f && th && th.length > 1 && art && art.length > 1) {
    const k = Math.min(th.length - 1, Math.max(0, f.to * (th.length - 1))), i = Math.floor(k), j = Math.min(th.length - 1, i + 1), w = k - i;
    const px = th[i]![0] + (th[j]![0] - th[i]![0]) * w, py = th[i]![1] + (th[j]![1] - th[i]![1]) * w;
    // (the nearest point on the artery's polyline, as a share of its length)
    let total = 0, best = Infinity, at = 0;
    for (let n = 1; n < art.length; n++) {
      const [ax, ay] = art[n - 1]!, [bx, by] = art[n]!, dx = bx - ax, dy = by - ay, sl = Math.hypot(dx, dy), t = sl > 0 ? Math.min(1, Math.max(0, ((px - ax) * dx + (py - ay) * dy) / (sl * sl))) : 0, d = Math.hypot(ax + dx * t - px, ay + dy * t - py);
      if (d < best) { best = d; at = total + sl * t; }
      total += sl;
    }
    u = total > 0 ? Math.min(1, at / total) : 1;
  }
  COMPANION_END.set(id, u);
  return u;
}
function fadeOf0(id: string, isArtery: boolean, feederHost?: string): TipFade | null {
  // the caudate lobe's veins rise out of the lobe's tissue: faint at their start, whole over their first half (their end takes the cava's fade at its wall by the shader's cava rule, opensIntoCava)
  if (id === CAUDATE_VEIN_ID) return { mode: 1, from: 0, to: 0.5, a0: 0, a1: 1, keep: false, connect: [] };
  // the children that branch off these ends in the liver (liver-branches.ts) fade the way their host does, along each one's own length, to nothing a little before their tip so no cut end is ever seen (a 3x look at the live build saw a flat pale end)
  if (feederHost && LIVER_FADE_OUT[feederHost]) return { mode: 1, from: FORK_CLEAR, to: 0.92, a0: 1, a1: 0, keep: false, connect: [] };
  if (feederHost && LIVER_FADE_IN[feederHost]) return { mode: 1, from: 0.08, to: 0.75, a0: 0, a1: 1, keep: false, connect: [] };
  if (feederHost === 'C3' && id.endsWith('~F:b')) return { mode: 1, from: 0.25, to: 1, a0: 1, a1: 0, keep: false, connect: [] };
  if (feederHost) { const yy = FEEDER_FADE_Y_2D[feederHost]; return yy ? { mode: 2, from: y3(yy[0]), to: y3(yy[1]), a0: 1, a1: 0, keep: false, connect: [] } : null; }
  const art = ART_FADE_2D[id];
  // (a vein that branches is one tube to its tip: it fades out of / in from the liver along its through branch, over the same stretch of the course as its side branch does)
  const sp = isArtery ? null : splitShare(id);
  if (sp != null) return (LIVER_BRANCH_HOSTS.out as readonly string[]).includes(id) ? { mode: 1, from: sp + FORK_CLEAR * (1 - sp), to: sp + 0.92 * (1 - sp), a0: 1, a1: 0, keep: false, connect: [] } : { mode: 1, from: 0.08 * sp, to: 0.75 * sp, a0: 0, a1: 1, keep: false, connect: [] };
  if (!isArtery && PLACED_LIVER_FADE[id]) return { mode: 1, from: PLACED_LIVER_FADE[id]![0], to: PLACED_LIVER_FADE[id]![1], a0: 1, a1: 0, keep: false, connect: [] };
  if (!isArtery && LIVER_FADE_OUT[id] && !END_JOIN.has(id)) return { mode: 1, from: 1 - LIVER_FADE_OUT[id]!, to: 1, a0: 1, a1: 0, keep: false, connect: [] };
  if (!isArtery && LIVER_FADE_IN[id]) return { mode: 1, from: 0, to: LIVER_FADE_IN[id]!, a0: 0, a1: 1, keep: false, connect: [] };
  // (the hepatic artery is cut short beside the portal trunk, starts/stub-free: it grows out of nothing over nearly all of what is drawn: starts.ts TRIM)
  if (art?.in) return { mode: 1, from: 0, to: id === 'A_HEP' ? HEP_FADE_IN : art.in, a0: 0, a1: 1, keep: true, connect: [] };
  // (the lobar arteries fade out with the portal branch they run beside, over the same share of their length: Mohammad, 20 Nov, "the right branch doesn't fade at the end")
  // (the artery runs on to its bed's node now, starts.ts alongVein: the fade starts where it always did along the portal branch)
  if (art?.out) { const from = (1 - (ART_OUT_SHARE[id] ?? art.out)) * alongVeinStretch(id, EDGE_PATH_2D); return { mode: 1, from, to: Math.max(from + 0.1, companionEnd(id)), a0: 1, a1: 0, keep: false, mapFade: MAP_ART_FADE, connect: [] }; }
  const inOrgan = placedLandingShare(id) ?? startInOrganShare(id, EDGE_PATH_2D[id] ?? []);
  if (inOrgan > 0 && !isArtery) return { mode: 1, from: 0, to: inOrgan, a0: 0, a1: 1, keep: false, connect: [...(TIP_CONNECT_2D[id] ?? []), ...originsOf(id)] };   // (the vein a carried-on start runs on from: the start is solid while it is drawn, eased: scene.ts syncTipJoins)
  const tip = TIP_FADE_2D[id];
  if (tip && !isArtery) return { mode: 1, from: 0, to: tip, a0: 0, a1: 1, keep: false, connect: TIP_CONNECT_2D[id] ?? [] };
  const join = isArtery ? 0 : ivcJoinSpan(id);
  if (join > 0) return { mode: 1, from: 1 - join, to: 1, a0: 1, a1: IVC_JOIN_ALPHA, keep: false, connect: [], ivcJoin: true };
  const down = FADE_DOWN_ON[id] ?? FADE_DOWN_Y_2D[id];
  if (down) return { mode: 2, from: y3(down[0]), to: y3(down[1]), a0: 1, a1: 0, keep: false, connect: [] };
  const fi = fadeIn(id);
  return fi && keepsAlphaToCava(id) ? { ...fi, a1: 1 } : (sinFade(id) ?? fi);
}
