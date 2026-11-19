// The figure's named places: which stations carry a label in the 3D scene, where each one's dot stands (the middle of the vessel it
// names, as in the 2D app: LABEL_VESSEL), what it is called (the 2D app's own words, names.copied.ts) and how important it is.
// Words and priorities are copied; only the 3D anchors are written here. The vessels are the scene's (anatomy/vessels.ts), named by
// topology edge, so a station whose vessel is not drawn yet simply has no label (a test lists them).
import { CatmullRomCurve3, Vector3 } from 'three';
import { VESSELS, vesselPoints } from '../anatomy/vessels.ts';
import { NODE_POS_2D } from '../vessels/paths.copied.ts';
import { TIER_Z, x3, y3 } from '../frame2d.ts';
import { LABEL_NAMES as N } from './names.copied.ts';
import type { Dir } from './geometry.ts';

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
  /** The vessel family's colour on the pill's dot. */
  tone: 'portal' | 'sys' | null;
}

const names = N.SHORT as Record<string, string>;
const abbrs = N.ABBR as Record<string, string>;
const lv = N.LABEL_VESSEL as Record<string, string>;
const pri = N.ANAT_PRI as Record<string, number>;
const extra = new Set<string>(N.ANAT_EXTRA);
const chips = new Set<string>(N.CHIP_NODES);

const curves = new Map<string, CatmullRomCurve3>();
const curveOf = (edge: string): CatmullRomCurve3 | null => {
  let c = curves.get(edge);
  if (!c) {
    const def = VESSELS.find((v) => v.id === edge);
    if (!def) return null;
    curves.set(edge, c = new CatmullRomCurve3(vesselPoints(def)));
  }
  return c;
};

/** Fixed scene points for stations that are not one vessel: the right atrium, the right liver's sinusoids, the varices. Where each stands is the 2D
 *  figure's own place for it (NODE_POS_2D), carried onto the scene by the one map (frame2d.ts), on the front vessel tier; an organ's name stands where
 *  the 2D app puts it (ORGAN_LABELS, copied), on the organ's front face. */
const at2d = (x: number, y: number, z: number): [number, number, number] => [x3(x), y3(y), z];
const nodeAt = (id: string): [number, number, number] => { const p = NODE_POS_2D[id]; if (!p) throw new Error(`the 2D map has no place for ${id}`); return at2d(p[0], p[1], TIER_Z.front); };
const POINTS: Record<string, [number, number, number]> = { RA: nodeAt('RA'), SIN_R: nodeAt('SIN_R'), VAR: nodeAt('VAR') };
/** The plane of an organ's front face (frame2d.ts: organs lie behind z = 0.26). */
export const ORGAN_FRONT = 0.26;
/** Every organ the 2D app names (ORGAN_LABELS): its id here, and the word the 2D plate writes. */
const ORGAN_WORD: Record<string, string> = { liver: 'Liver', spleen: 'Spleen', stomach: 'Stomach', colon: 'Colon', kidney: 'Kidney', bowel: 'Small bowel', esophagus: 'Esophagus', heart: 'Right atrium' };
const ORGAN_POINTS: Record<string, [number, number, number]> = Object.fromEntries(Object.entries(ORGAN_WORD).map(([id, word]) => {
  const p = (N.ORGAN_AT as Record<string, readonly [number, number]>)[word];
  if (!p) throw new Error(`the 2D app has no organ name "${word}"`);
  return [id, at2d(p[0], p[1], ORGAN_FRONT)];
}));

const DIRS: Record<string, readonly Dir[]> = {
  CONF: ['W', 'SW', 'E'], SV: ['S', 'SE', 'E'], SMV: ['E', 'SE', 'W'], SIN_R: ['W', 'SW', 'NW'], RHV: ['W', 'NW', 'N'], IVCS: ['E', 'NE', 'SE'],
  IVCI: ['E', 'SE', 'NE'], RA: ['E', 'NE', 'SE'], VAR: ['E', 'NE', 'SE'], MHV: ['S', 'SW', 'W'], LHV: ['S', 'SE', 'E'], RPV: ['N', 'NW', 'W'], LPV: ['N', 'NE', 'E'],
  LGV: ['E', 'NE', 'SE'],
};

function vesselStation(id: string): Station | null {
  const edge = lv[id];
  const c = edge ? curveOf(edge) : null;
  if (!edge || !c) return null;
  return {
    id, kind: 'vessel', name: names[id] ?? id, abbr: abbrs[id] ?? null, vessel: edge, pri: pri[id] ?? 5, core: chips.has(id) && !extra.has(id),
    node: id, dirs: DIRS[id] ?? [], at: (u, out) => c.getPointAt(Math.min(1, Math.max(0, u)), out), slides: true,
    tone: VESSELS.find((v) => v.id === edge)!.tone,
  };
}

function pointStation(id: string): Station | null {
  const p = POINTS[id];
  if (!p) return null;
  return {
    id, kind: 'point', name: names[id] ?? id, abbr: abbrs[id] ?? null, vessel: null, pri: pri[id] ?? 5, core: chips.has(id) && !extra.has(id),
    node: id, dirs: DIRS[id] ?? [], at: (_u, out) => out.set(p[0], p[1], p[2]), slides: false,
    tone: id === 'RA' ? 'sys' : 'portal',
  };
}

function organStation(id: string): Station {
  const p = ORGAN_POINTS[id];
  // the 2D app's own word for the organ (ORGAN_LABELS), so the name is copied, not typed
  const word = (N.ORGAN_NAMES as readonly string[]).find((w) => w === ORGAN_WORD[id]) ?? ORGAN_WORD[id];
  return { id: `organ:${id}`, kind: 'organ', at2d: (N.ORGAN_AT as Record<string, readonly [number, number]>)[word] as readonly [number, number], name: word, abbr: null, vessel: null, pri: 2, core: false, node: null, dirs: [], at: (_u, out) => out.set(p[0], p[1], p[2]), slides: false, tone: null };
}

/** Every station the 3D scene can label now, in the 2D app's order of importance. */
export const STATIONS: readonly Station[] = [
  ...Object.keys(lv).map(vesselStation).filter((s): s is Station => !!s),
  ...['RA', 'SIN_R', 'VAR'].map(pointStation).filter((s): s is Station => !!s),
  ...Object.keys(ORGAN_POINTS).map(organStation),
].sort((a, b) => b.pri - a.pri || (a.id < b.id ? -1 : 1));

export const stationById = (id: string): Station | undefined => STATIONS.find((s) => s.id === id);

/** The station a drawn vessel's label belongs to (a vessel is picked by edge ID; its station is the one whose label hangs from it). */
export const stationOfVessel = (edge: string): string | null => STATIONS.find((s) => s.vessel === edge)?.id ?? null;

/** Which stations a deck term points at (the deck's `terms` field names figure parts by these ids). Stations are in the 2D app's vocabulary;
 *  the table grows as decks come over (a test fails on a term it does not know, so none is silently ignored). */
export const TERM_STATIONS: Readonly<Record<string, readonly string[]>> = {
  ra: ['RA'], ivc: ['IVCS', 'IVCI'], hv: ['RHV'], fhvp: ['RHV'], whvp: ['SIN_R'], pv: ['CONF'], sv: ['SV'], smv: ['SMV'], var: ['VAR'],
};

export function stationsOfTerms(terms: readonly string[]): Set<string> {
  const out = new Set<string>();
  for (const t of terms) {
    const s = TERM_STATIONS[t];
    if (!s) throw new Error(`no figure station for the term "${t}": add it to TERM_STATIONS`);
    for (const id of s) out.add(id);
  }
  return out;
}
