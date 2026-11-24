// The figure's named places: which stations carry a label in the 3D scene, where each one's dot stands (the middle of the vessel it
// names, as in the 2D app: LABEL_VESSEL), what it is called (the 2D app's own words, names.copied.ts) and how important it is.
// Words and priorities are copied; only the 3D anchors are written here. The vessels are the scene's (anatomy/vessels.ts), named by
// topology edge, so a station whose vessel is not drawn yet simply has no label (a test lists them).
import { CatmullRomCurve3, Vector3 } from 'three';
import { NETWORK_BY_ID, NODE_Z, MAPPED, type NetVessel } from '../vessels/network.ts';
import { REST, coursesOf } from '../vessels/shape.ts';
import { NODE_POS_2D, PLACED, placedNode, placedEdge, PLACED_ORGAN_NAMES } from '../anatomy/source.ts';
import { x3, y3 } from '../frame2d.ts';
import { LABEL_NAMES as N } from './names.copied.ts';
import type { Dir } from './geometry.ts';
import { TARGETS_FIG } from './figure2d.copied.ts';

export type StationKind = 'vessel' | 'point' | 'organ';

export interface Station {
  id: string;
  kind: StationKind;
  /** Full name and short form, from the 2D app. */
  name: string;
  abbr: string | null;
  /** The topology edge whose middle carries the dot (a vessel station). */
  vessel: string | null;
  /** 2D priority (higher wins when space is short). */
  pri: number;
  /** Shown from the start (the 2D CHIP_NODES) rather than only when the slide or the viewer names it (ANAT_EXTRA). */
  core: boolean;
  /** A reading: the topology node whose pressure the label carries (none for an organ's name). */
  node: string | null;
  dirs: readonly Dir[];
  /** An organ's name: where the 2D plate puts it (ORGAN_LABELS), in 2D world units. */
  at2d?: readonly [number, number];
  /** The dot's course in the scene (a vessel) or its fixed point. */
  at: (u: number, out: Vector3) => Vector3;
  /** Whether the dot may slide along a course. */
  slides: boolean;
  /** Where along the course the dot stands at rest (0..1): the middle (the 2D app's LABEL_VESSEL), or the nearest clear place to it where the middle is within `DOT_UNITS` of a more important
   *  station's dot. Fixed here, in scene units, so it never depends on the screen or the zoom (it was spread in px at solve time: at the default zoom "Lower IVC" slid down the cava off the
   *  portal confluence it passes, zoomed in the dots stood far enough apart in px and it jumped back to its middle, beside the confluence; Mac play-test, 20 Nov). */
  u0: number;
  /** Where along its course the dot may stand (0..1): on the approved placement, only where its own vessel is the one seen there (`seenAt`); absent, anywhere. The solver slides a dot only within it. */
  rests?: (u: number) => boolean;
  /** The vessel family's colour on the pill's dot. */
  tone: 'portal' | 'sys' | null;
  /** A TIPS or DIPS stent's own label (stent-labels.ts): the stent itself, or one of its three Doppler points. Not one of STATIONS. */
  stent?: { sid: string; pt: 'proximal' | 'mid' | 'distal' | 'geo' };
}

const names = N.SHORT as Record<string, string>;
const abbrs = Object.fromEntries(Object.entries(N.ABBR as Record<string, string>).filter(([id, a]) => !Object.entries(names).some(([o, n]) => o !== id && n === a))) as Record<string, string>;   // (2D's short forms, except one that is another station's own name: "Lower IVC" never shortens to "IVC", which is the IVC above it, with another number)
const lv = N.LABEL_VESSEL as Record<string, string>;
const pri = N.ANAT_PRI as Record<string, number>;
const extra = new Set<string>(N.ANAT_EXTRA);
const chips = new Set<string>(N.CHIP_NODES);

const curves = new Map<string, CatmullRomCurve3>();
export const curveOf = (edge: string): CatmullRomCurve3 | null => {
  let c = curves.get(edge);
  if (!c) {
    // (the course the scene draws, as it is drawn: the 2D figure's own x and y, and the depth the tube has, which eases from its tier to its end node's depth over each end (shape.ts to3), so the
    // dots of a vessel that rises toward a junction (the cava, at the hepatic veins) stay on the tube in a turned view. Until 19 Nov 2026 this read the first slice's hand-placed courses
    // (anatomy/vessels.ts), 100 to 500 2D units from the drawn vessels ("Lower IVC" hung on the portal vein), then the tier's flat depth, which left the dot 8 to 16 px off the cava's rising end.)
    const def = NETWORK_BY_ID.get(edge);
    if (!def || def.feeder) return null;
    curves.set(edge, c = new CatmullRomCurve3(coursesOf(def, REST)[0]!.pts.map((p) => new Vector3(p[0], p[1], p[2]))));
  }
  return c;
};

/** Fixed scene points for stations that are not one vessel: the right atrium, the right liver's sinusoids, the varices and the fundal varices. Where each stands is the 2D
 *  figure's own place for it (NODE_POS_2D), carried onto the scene by the one map (frame2d.ts), at the depth the vessels that meet there are drawn at (nodeZ): a
 *  dot put on the front tier hung 0.4 to 0.8 of a unit in front of the atrium's back-tier cava, which a turned camera shows as a dot off its vessel. An organ's name stands where the 2D app puts it (ORGAN_LABELS, copied), on the organ's front face. */
const at2d = (x: number, y: number, z: number): [number, number, number] => [x3(x), y3(y), z];
/** The depth of a topology node: where the drawn vessels that meet there stand (NODE_Z: each course eases to it over its end, shape.ts), so the dot sits on the tubes in a turned view. */
export function nodeZ(id: string): number {
  const z = NODE_Z.get(id);
  if (z === undefined) throw new Error(`no drawn vessel ends at ${id}`);
  return z;
}
/** Where a topology node stands in the scene, as the figure draws it now (the approved placement's node, or the 2D place at its vessels' depth). Every reader of a node's place reads it here. */
export const nodeAt = (id: string): [number, number, number] => {
  if (PLACED) { const p = placedNode(id); if (!p) throw new Error(`no placed node ${id}`); return [p[0], p[1], p[2]]; }   // (the approved placement: where its vessels that meet there end, anatomy/placed-bounds.ts)
  return at2d(NODE_POS_2D[id]![0], NODE_POS_2D[id]![1], nodeZ(id));
};
/** A point station's place: its node, and on the approved placement the nearest point of the drawn vessels the 2D app lights for it (TARGETS), so the dot is on a tube: the placed fundal varices' node is
 *  the mean of the ends that meet there, 0.042 off the gastric varix drawn through it (2.2 px off its edge on a phone). */
const ON_PLACED = 0.015;
function pointAt(id: string): [number, number, number] {
  const p = nodeAt(id);
  if (!PLACED) return p;
  let best: [number, number, number] = p, bd = Infinity;
  for (const e of TARGETS_FIG[id]?.edges ?? []) {
    const def = NETWORK_BY_ID.get(e);
    if (!def || def.feeder) continue;
    // (the drawn course's point nearest the node among those that also lie on the approved course: the drawn varix ends on the arch's wall, short of the placed end)
    const placed = placedEdge(e) ?? [];
    for (const q of coursesOf(def, REST)[0]!.pts) {
      if (placed.length && Math.min(...placed.map((r) => Math.hypot(q[0]! - r[0], q[1]! - r[1], q[2]! - r[2]))) > ON_PLACED) continue;
      const d = Math.hypot(q[0]! - p[0], q[1]! - p[1], q[2]! - p[2]);
      if (d < bd) { bd = d; best = [q[0]!, q[1]!, q[2]!]; }
    }
  }
  return best;
}
const POINTS: Record<string, [number, number, number]> = { RA: pointAt('RA'), SIN_R: pointAt('SIN_R'), VAR: pointAt('VAR'), GV: pointAt('GV') };
/** The plane of an organ's front face (frame2d.ts: organs lie behind z = 0.26). */
export const ORGAN_FRONT = 0.26;
/** Every organ the 2D app names (ORGAN_LABELS): its id here, and the word the 2D plate writes. */
const ORGAN_WORD: Record<string, string> = { liver: 'Liver', spleen: 'Spleen', stomach: 'Stomach', colon: 'Colon', kidney: 'Kidney', bowel: 'Small bowel', esophagus: 'Esophagus', heart: 'Right atrium' };
/** Where an organ's name stands, 2D world units: the 2D plate's place, or on the approved placement a point inside the placed organ's front silhouette nearest it (or beside the organ as the
 *  2D name stands beside it), measured once by scripts/gen-placed-organs.mjs. */
const organAt = (word: string): readonly [number, number] | undefined => {
  if (PLACED) { const p = PLACED_ORGAN_NAMES[word]; return p && [p[0], p[1]]; }
  return (N.ORGAN_AT as Record<string, readonly [number, number]>)[word];
};
const ORGAN_POINTS: Record<string, [number, number, number]> = Object.fromEntries(Object.entries(ORGAN_WORD).map(([id, word]) => {
  const p = organAt(word);
  if (!p) throw new Error(`the 2D app has no organ name "${word}"`);
  return [id, at2d(p[0], p[1], PLACED ? PLACED_ORGAN_NAMES[word]![2] : ORGAN_FRONT)];   // (placed: on the organ's own front face, which has real depth now)
}));

const DIRS: Record<string, readonly Dir[]> = {
  CONF: ['W', 'SW', 'E'], SV: ['S', 'SE', 'E'], SMV: ['E', 'SE', 'W'], SIN_R: ['W', 'SW', 'NW'], RHV: ['W', 'NW', 'N'], IVCS: ['E', 'NE', 'SE'],
  IVCI: ['E', 'SE', 'NE'], RA: ['E', 'NE', 'SE'], VAR: ['E', 'NE', 'SE'], MHV: ['S', 'SW', 'W'], LHV: ['S', 'SE', 'E'], RPV: ['N', 'NW', 'W'], LPV: ['N', 'NE', 'E'],
  LGV: ['E', 'NE', 'SE'], GV: ['N', 'W', 'S'],
};

function vesselStation(id: string): Station | null {
  const edge = lv[id];
  const c = edge ? curveOf(edge) : null;
  if (!edge || !c) return null;
  return {
    id, kind: 'vessel', name: names[id] ?? id, abbr: abbrs[id] ?? null, vessel: edge, pri: pri[id] ?? 5, core: chips.has(id) && !extra.has(id),
    node: id, dirs: DIRS[id] ?? [], at: (u, out) => c.getPointAt(Math.min(1, Math.max(0, u)), out), slides: true, u0: 0.5,
    tone: NETWORK_BY_ID.get(edge)!.tone === 'portal' ? 'portal' : 'sys',
  };
}

function pointStation(id: string): Station | null {
  const p = POINTS[id];
  if (!p) return null;
  return {
    id, kind: 'point', name: names[id] ?? id, abbr: abbrs[id] ?? null, vessel: null, pri: pri[id] ?? 5, core: chips.has(id) && !extra.has(id),
    node: id, dirs: DIRS[id] ?? [], at: (_u, out) => out.set(p[0], p[1], p[2]), slides: false, u0: 0.5,
    tone: id === 'RA' ? 'sys' : 'portal',
  };
}

function organStation(id: string): Station {
  const p = ORGAN_POINTS[id];
  // the 2D app's own word for the organ (ORGAN_LABELS), so the name is copied, not typed
  const word = (N.ORGAN_NAMES as readonly string[]).find((w) => w === ORGAN_WORD[id]) ?? ORGAN_WORD[id];
  return { id: `organ:${id}`, kind: 'organ', at2d: organAt(word) as readonly [number, number], name: word, abbr: null, vessel: null, pri: 2, core: false, node: null, dirs: [], at: (_u, out) => out.set(p[0], p[1], p[2]), slides: false, u0: 0.5, tone: null };
}

/** Every station the figure has (before the rest places are chosen: a placed station whose vessel is nowhere seen is left out below). */
/** (the approved placement: the right sinusoids' dot rests on their drawn bed, as the left sinusoids' does, not at the node where the bed's pieces meet, which nothing drawn marks: "Right sinusoids" on
 *  the liver with a leader ending nowhere, Circulation slides 8 and 10, 24 Nov) */
const ON_VESSEL: ReadonlySet<string> = new Set(PLACED ? ['SIN_R'] : []);
const ALL_STATIONS: Station[] = [
  ...Object.keys(lv).filter((id) => (!(id in POINTS) || ON_VESSEL.has(id)) && !!names[id]).map(vesselStation).filter((s): s is Station => !!s),
  ...['RA', 'SIN_R', 'VAR', 'GV'].filter((id) => !ON_VESSEL.has(id)).map(pointStation).filter((s): s is Station => !!s),
  ...Object.keys(ORGAN_POINTS).map(organStation),
].sort((a, b) => b.pri - a.pri || (a.id < b.id ? -1 : 1));

/** The least distance between two stations' dots at rest, scene units (about 40 px on a phone: solver.ts DOT_ROOM; a laptop's figure is larger, so its dots are farther apart still). */
export const DOT_UNITS = 0.3;
const U_TRIES = [0.5, 0.42, 0.58, 0.34, 0.66, 0.26, 0.74, 0.18, 0.82, 0.1, 0.9];

/** SEEN (the approved placement, `?anatomy=new`): a dot rests only where its own vessel is the one the eye sees there. The placed vessels cross in depth (the hepatic artery runs behind the
 *  portal vein along its whole trunk, 0.034 from its centreline where the two radii make 0.033; the lower cava passes behind the left portal vein, the hepatic veins' mouths and the portal trunk;
 *  the IVC's first tenth is the hepatic veins' mouth), so a dot chosen only by its distance from the other dots stood under another vessel and its leader pointed at that one ("Lower IVC" on the
 *  left portal vein, "Hepatic artery" on the portal vein, "IVC" at the veins' mouth; owner's iPhone, 24 Nov). In the front view (the plane the figure is read in) the dot keeps clear of every other
 *  vessel's centreline by both radii and SEEN_MARGIN: first of every vessel the figure can draw (the collaterals and shunts a preset adds), else of the ones always drawn. A station with no such
 *  spot on its vessel rests on the next vessel the 2D app lights for it (the hepatic artery's trunk is nowhere seen: its name stands on its right branch), and with none has no label, as a vessel
 *  not drawn has none. Today's flat figure keeps its approved rest places (its crossings are lifted by the clearance table, shape.ts). */
export const SEEN_MARGIN = 0.012;
const SEEN_US = Array.from({ length: 45 }, (_, i) => 0.06 + i * 0.02).sort((a, b) => Math.abs(a - 0.5) - Math.abs(b - 0.5) || a - b);
interface Seg { ax: number; ay: number; az: number; bx: number; by: number; bz: number; r: number; base: boolean; host: string }
let segs: Seg[] | null = null;
function vesselSegs(): Seg[] {
  if (segs) return segs;
  segs = [];
  for (const v of MAPPED) {
    const pts = coursesOf(v, REST)[0]!.pts, base = v.kind !== 'collateral' && v.kind !== 'shunt';
    for (let i = 1; i < pts.length; i++) segs.push({ ax: pts[i - 1]![0]!, ay: pts[i - 1]![1]!, az: pts[i - 1]![2]!, bx: pts[i]![0]!, by: pts[i]![1]!, bz: pts[i]![2]!, r: v.radius, base, host: v.host });
  }
  return segs;
}
/** A vessel this much behind the dot (scene units, toward the back) is under it, not over it: the dot's own vessel is the one seen there (the portal vein over the cava). Nearer than that, or in front,
 *  it covers the dot (two vessels meeting at one depth are one blot to the eye: the hepatic veins' mouth on the cava). */
export const SEEN_BEHIND = 0.02;
/** Where along a segment the front view's nearest point to (x, y) lies, and how far it is. */
const segNear = (x: number, y: number, g: Seg): [number, number] => {
  const dx = g.bx - g.ax, dy = g.by - g.ay, t = Math.max(0, Math.min(1, ((x - g.ax) * dx + (y - g.ay) * dy) / (dx * dx + dy * dy || 1)));
  return [Math.hypot(g.ax + dx * t - x, g.ay + dy * t - y), t];
};
/** How clear a dot on the vessel `host` (its whole vein; radius `r`) at (x, y, z) is, front view: 2 clear of every vessel, 1 clear of the always-drawn ones, 0 under another. The other pieces of the
 *  same vein (it runs on through them) never cover it. */
export function seenAt(host: string, r: number, x: number, y: number, z: number): 0 | 1 | 2 {
  let all = true;
  for (const g of vesselSegs()) {
    if (g.host === host) continue;
    const lim = g.r + r + SEEN_MARGIN;
    if (Math.abs(x - (g.ax + g.bx) / 2) > lim + Math.abs(g.bx - g.ax) / 2 || Math.abs(y - (g.ay + g.by) / 2) > lim + Math.abs(g.by - g.ay) / 2) continue;
    const [d, t] = segNear(x, y, g);
    if (d >= lim || g.az + (g.bz - g.az) * t < z - SEEN_BEHIND) continue;
    if (g.base) return 0;
    all = false;
  }
  return all ? 2 : 1;
}
const unseen = new Set<string>();
const REST_STEPS = 100;
(function spreadAtRest() {
  const dots: Vector3[] = [], tmp = new Vector3();
  // (the names the figure shows from the start first: a name only the slide or the viewer asks for keeps clear of them, never the other way round)
  for (const s of [...ALL_STATIONS.filter((x) => x.core), ...ALL_STATIONS.filter((x) => !x.core)]) {
    if (s.kind === 'organ') continue;
    const apart = (p: Vector3) => dots.every((q) => Math.hypot(q.x - p.x, q.y - p.y) >= DOT_UNITS);
    const nearest = (p: Vector3) => (dots.length ? Math.min(...dots.map((q) => Math.hypot(q.x - p.x, q.y - p.y))) : Infinity);
    if (s.slides && PLACED) {
      // its own vessel, else the other vessels the 2D app lights for it (TARGETS: the hepatic artery's are its trunk and its right and left branches), where it is seen
      let best = -1, bestK = -1, bestEdge = s.vessel!;
      // (its own vessel first; failing that, the seen spot of the others nearest the middle of its own, where the 2D app puts the name)
      const mid = s.at(0.5, new Vector3());
      for (const [own, edges] of [[true, [s.vessel!]], [false, (TARGETS_FIG[s.id]?.edges ?? []).filter((e) => e !== s.vessel)]] as const) for (const edge of best < 0 ? edges : []) {
        const v = NETWORK_BY_ID.get(edge), c = curveOf(edge);
        if (!v || !c) continue;
        for (const u of SEEN_US) {
          c.getPointAt(u, tmp);
          const seen = seenAt(v.host, v.radius, tmp.x, tmp.y, tmp.z);
          if (!seen) continue;
          // (on its own vessel: seen by every vessel first, then apart from the dots, then the farthest from them; on another: seen, then nearest its own vessel's middle)
          const k = seen * 10 + (!own ? 5 - Math.min(4.9, tmp.distanceTo(mid)) : apart(tmp) ? 5 : Math.min(4.9, nearest(tmp) / DOT_UNITS * 4.9));
          if (k > bestK + 1e-9) { best = u; bestK = k; bestEdge = edge; }
        }
      }
      if (best < 0) { unseen.add(s.id); continue; }
      if (bestEdge !== s.vessel) { const c = curveOf(bestEdge)!; s.vessel = bestEdge; s.at = (u, out) => c.getPointAt(Math.min(1, Math.max(0, u)), out); }
      s.u0 = best;
      // (where else the solver may slide it: the seen stretches, sampled every hundredth of the course)
      const v = NETWORK_BY_ID.get(s.vessel!)!, ok: boolean[] = [];
      for (let i = 0; i <= REST_STEPS; i++) { s.at(i / REST_STEPS, tmp); ok.push(seenAt(v.host, v.radius, tmp.x, tmp.y, tmp.z) > 0); }
      s.rests = (u) => ok[Math.round(Math.min(1, Math.max(0, u)) * REST_STEPS)]!;
    } else if (s.slides) {
      let best = s.u0, bestD = -1;
      for (const u of U_TRIES) {
        s.at(u, tmp);
        if (apart(tmp)) { best = u; bestD = Infinity; break; }
        const d = nearest(tmp);
        if (d > bestD) { best = u; bestD = d; }
      }
      s.u0 = best;
    }
    dots.push(s.at(s.u0, new Vector3()));
  }
})();

/** Every station the 3D scene can label now, in the 2D app's order of importance. */
export const STATIONS: readonly Station[] = ALL_STATIONS.filter((s) => !unseen.has(s.id));
/** The stations the approved placement leaves without a label because none of their vessels is seen anywhere in the front view. Empty today. */
export const UNSEEN_STATIONS: ReadonlySet<string> = unseen;

export const stationById = (id: string): Station | undefined => STATIONS.find((s) => s.id === id);

/** The station a drawn vessel's label belongs to (a vessel is picked by edge ID; its station is the one whose label hangs from it). */
export const stationOfVessel = (edge: string): string | null => STATIONS.find((s) => s.vessel === edge)?.id ?? null;

/** Which stations a deck term points at (the deck's `terms` field names figure parts by these ids). The words are the 2D app's own (TARGETS, figure2d.copied.ts: each term's station, vessels, organ
 *  and colour); a term with no station of its own (an organ, the Circuit's resistors, a lobule part) answers with no station, and what it lights is the figure link's (ui/deck/figure-plan.ts). The first
 *  lines are the ones that light more than the 2D target's one station (the cava's two stretches). */
const ALSO: Readonly<Record<string, readonly string[]>> = { ivc: ['IVCS', 'IVCI'] };
export const TERM_STATIONS: Readonly<Record<string, readonly string[]>> = Object.fromEntries(
  Object.entries(TARGETS_FIG).map(([k, t]) => [k, ALSO[k] ?? (t.node ? [t.node] : [])]),
);

export function stationsOfTerms(terms: readonly string[]): Set<string> {
  const out = new Set<string>();
  for (const t of terms) {
    const s = TERM_STATIONS[t];
    if (!s) throw new Error(`no figure station for the term "${t}": add it to TERM_STATIONS`);
    for (const id of s) out.add(id);
  }
  return out;
}

/** Every vessel the figure draws, as a polyline of at most `FIGURE_SAMPLES` points (the course as drawn, REST): what a name keeps off. Until 20 Nov the solver knew only the courses of the named
 *  vessels, so a name stood across a vessel with no station (the hepatic artery, a collateral, the gut's branches; phone play-test: strokes through "Portal vein", "SMV", "Right hepatic vein"). */
export const FIGURE_SAMPLES = 24;
let drawnCourses: { v: NetVessel; pts: Vector3[] }[] | null = null;
export function figureCourses(): readonly { v: NetVessel; pts: readonly Vector3[] }[] {
  return (drawnCourses ??= MAPPED.map((v) => {
    const all = coursesOf(v, REST)[0]!.pts, n = Math.min(FIGURE_SAMPLES, all.length);
    const pts: Vector3[] = [];
    for (let i = 0; i < n; i++) { const p = all[Math.round((i * (all.length - 1)) / Math.max(1, n - 1))]!; pts.push(new Vector3(p[0], p[1], p[2])); }
    return { v, pts };
  }));
}
