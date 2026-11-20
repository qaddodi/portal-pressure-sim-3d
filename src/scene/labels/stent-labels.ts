// A TIPS or DIPS stent's own labels, a copy of the 2D app's geomItem and velItem (stage-label-items.js 289-335, stage-label-solve.js 587-620):
//   the stent's label says what the stent is (Mohammad, 17 Nov: "show the diameter and the waist and length"): "TIPS 10 mm", under it its waist "6.3 mm × 3.0 cm" and its end stenosis
//   "distal stenosis 5.0 mm" where it has them, a line each, shortened by whole lines (the end stenosis first, then the waist) and never to nothing;
//   on a slide that reads the stent at its three Doppler points, three more labels stand in a column beside their dots: "TIPS proximal 99 cm/s", "TIPS mid …", "TIPS distal …" (on a phone
//   "Prox", "Mid", "Dist"), each number in the velocity lens's colour against the stent's own normal, "No flow" where the stent is occluded (under 2 cm/s), the point the Doppler samples named in bold.
// Pure: node judges all of it (tests/labels-stent.test.ts); the label layer feeds it the stent's state, the controller lays the labels out like every station.
import { CatmullRomCurve3, Vector3 } from 'three';
import { STENT_SITES } from '../../engine/hales/portal/topology.js';
import type { Station } from './stations.ts';
import { vesselFit } from '../devices/stent/fit.ts';
import { LS, fontPx, lineSize, type Measure, type Run, type Vp } from './type.ts';

export const STENT_IDS = ['TIPS', 'DIPS'] as const;
export type StentId = (typeof STENT_IDS)[number];
export const STENT_POINTS = ['proximal', 'mid', 'distal'] as const;
export type StentPoint = (typeof STENT_POINTS)[number];
export const isStent = (id: string): id is StentId => (STENT_IDS as readonly string[]).includes(id);

/** The stations' ids: the stent's own label, and one for each of its three points. */
export const geoId = (sid: string): string => `${sid}:geo`;
export const pointId = (sid: string, pt: StentPoint): string => `${sid}:${pt}`;

/** A phone's three points read short (2D: stageBox().width < 700), so the column fits beside a small stent. */
export const COMPACT_W = 700;
export const SHORT: Readonly<Record<StentPoint, string>> = { proximal: 'Prox', mid: 'Mid', distal: 'Dist' };
export const pointName = (sid: string, pt: StentPoint, compact: boolean): string => (compact ? SHORT[pt] : `${sid} ${pt}`);

/** What a point's label reads now (the label layer fills it: the velocity rule is the Doppler's). */
export interface PointRead {
  /** the velocity, cm/s, as written ("99"), or "No flow" */
  number: string;
  none: boolean;
  /** the number's colour (the velocity lens's colour against the stent's own normal, drawn toward the text colour), "" for none */
  tint: string;
}
/** The stent's geometry as 2D stentFacts gives it. */
export interface GeoFacts { d: number; waist: number | null; wLen: number; sten: number | null; end: string }

/** What the label layer knows of the stents now. */
export interface StentView {
  /** The stent is drawn, open and settled (2D stentReady): its labels stand. */
  ready(sid: StentId): boolean;
  /** A slide that reads this stent at its three points calls all three out (2D `dop.all && dop.id === sid`). */
  all(sid: StentId): boolean;
  /** The third the Doppler samples on this stent now, or null (it is not on this stent). */
  sampled(sid: StentId): StentPoint | null;
  facts(sid: StentId): GeoFacts | null;
  read(sid: StentId, pt: StentPoint): PointRead | null;
}

// ── the geometry label: lines of runs ──
export interface GeoRun { k: 'name' | 'val' | 'unit'; t: string; size: number; weight: number; gap: number }
export type GeoLine = GeoRun[];

/** 2D MM: a whole number where it is one (within 0.05), else one decimal. */
export const MM = (v: number): string => (Math.abs(v - Math.round(v)) < 0.05 ? String(Math.round(v)) : v.toFixed(1));

const num = (t: string, gap = 4, size = 14): GeoRun => ({ k: 'val', t, size, weight: 650, gap });
const unit = (t: string, gap = 2.5): GeoRun => ({ k: 'unit', t, size: 10, weight: 500, gap });

/** The stent's lines (2D geomItem): the stent and its diameter; its waist's numbers only ("6 mm × 4 cm"); its end stenosis. */
export function geoLines(sid: string, g: GeoFacts | null): GeoLine[] {
  const lines: GeoLine[] = [[{ k: 'name', t: sid, size: LS.NAME.size, weight: LS.NAME.weight, gap: 0 }, num(g ? MM(g.d) : ''), unit('mm')]];
  if (g?.waist != null) lines.push([num(MM(g.waist), 0, 12), unit('mm'), unit('×', 4), num(MM(g.wLen), 3, 12), unit('cm')]);
  if (g?.sten != null) lines.push([{ k: 'name', t: `${g.end} stenosis`, size: LS.NAME.size, weight: LS.NAME.weight, gap: 0 }, num(MM(g.sten), 4, 12), unit('mm')]);
  return lines;
}
/** Its forms, one step each, never more than two steps: the whole; the end stenosis let go; the stent's line alone (2D geomSets). */
export const geoSets = (lines: GeoLine[]): GeoLine[][] => [lines, ...(lines.length > 2 ? [lines.slice(0, 2)] : []), ...(lines.length > 1 ? [lines.slice(0, 1)] : [])];

const asRun = (r: GeoRun): Run => ({ kind: r.k === 'name' ? 'name' : r.k === 'val' ? 'val' : 'unit', text: r.t, size: r.size, weight: r.weight, gap: r.gap, track: 0 });
/** A line's width and height at this screen (2D lineW and LINE_H). */
export const geoLineSize = (line: GeoLine, vp: Vp, measure: Measure): { w: number; h: number } => lineSize(line.map(asRun), vp, measure);
/** The box of a set of lines: the widest line, the heights added (2D: it.w = max lineW, it.h = sum LINE_H), without padding. */
export function geoSize(lines: GeoLine[], vp: Vp, measure: Measure): { w: number; h: number } {
  let w = 0, h = 0;
  for (const l of lines) { const s = geoLineSize(l, vp, measure); w = Math.max(w, s.w); h += s.h; }
  return { w, h };
}
/** The px a run is written at on this screen, and its gap (for the layer's DOM). */
export const geoPx = (r: GeoRun, vp: Vp): number => fontPx(r.size, vp);
export const geoGapPx = (r: GeoRun): number => r.gap * LS.LABEL_K;

/** A label's words as one string (the controller's `word`: it is what a crossfade compares and keeps for the picture it leaves). Lines end with "\n", runs with "\u0001", a run is kind, size, weight, gap, text. */
export const encodeGeo = (lines: GeoLine[]): string => lines.map((l) => l.map((r) => `${r.k}|${r.size}|${r.weight}|${r.gap}|${r.t}`).join('\u0001')).join('\n');
export function decodeGeo(word: string): GeoLine[] {
  if (!word) return [];
  return word.split('\n').map((l) => l.split('\u0001').map((s) => { const [k, size, weight, gap, ...t] = s.split('|'); return { k: k as GeoRun['k'], size: Number(size), weight: Number(weight), gap: Number(gap), t: t.join('|') }; }));
}

// ── where the labels stand ──
/** The fraction along each stent's course the stent's own label stands at (its middle; the third the Doppler samples while it is on that stent: 2D labelAnchor and dop.seg). */
export const geoFrac: Record<StentId, number> = { TIPS: 0.5, DIPS: 0.5 };

const curves = new Map<string, CatmullRomCurve3 | null>();
function courseOf(sid: string): CatmullRomCurve3 | null {
  let c = curves.get(sid);
  if (c === undefined) {
    // the stent's own drawn course, as the device lays it (devices/stent/stent-device.ts)
    try { c = new CatmullRomCurve3(vesselFit(sid).pts.map((p) => new Vector3(p[0], p[1], p[2])), false, 'centripetal'); } catch { c = null; }
    curves.set(sid, c);
  }
  return c;
}
const at = (sid: StentId, f: () => number) => (_u: number, out: Vector3): Vector3 => { const c = courseOf(sid); return c ? c.getPointAt(Math.min(1, Math.max(0, f())), out) : out.set(0, 0, 0); };

function station(sid: StentId, pt: StentPoint | 'geo'): Station {
  return {
    id: pt === 'geo' ? geoId(sid) : pointId(sid, pt), kind: 'point', name: pt === 'geo' ? sid : pointName(sid, pt, false), abbr: pt === 'geo' ? null : SHORT[pt], vessel: null, pri: pt === 'geo' ? 9 : 8, core: false, node: null,
    dirs: [], at: at(sid, pt === 'geo' ? () => geoFrac[sid] : () => (STENT_SITES as Record<string, number>)[pt]!), slides: false, u0: 0.5, tone: 'portal', stent: { sid, pt },
  };
}
/** Every stent label the scene can show (not in STATIONS: they stand only while a stent is drawn, and are none of the stations a slide names). */
export const STENT_STATIONS: readonly Station[] = STENT_IDS.flatMap((sid) => [station(sid, 'geo'), ...STENT_POINTS.map((p) => station(sid, p))]);
export const stentStationById = (id: string): Station | undefined => STENT_STATIONS.find((s) => s.id === id);
