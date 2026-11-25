// The lobule's words, as 2D writes them (lobule-zoom-labels.js, lobule-tract-labels.js): the three zone names (Zone 1 periportal, Zone 2 midzonal, Zone 3 centrilobular, on the radius to the
// flat bottom edge, shown with the Zones layer), and the stations: the portal venule, the sinusoids and the central vein with the pressure in each, the hepatic arteriole and the bile
// ductule named, and (Lymph layer on) the hepatic lymph. This builds what the one label solver (labels/solver.ts) is given, from the plate as it stands on the canvas. Pure: no DOM, no three.js.
// Each tract name stands out along the ray from the venule through what it names (the 2D rule, lobule-tract-labels.js: spokes of one hub never cross), so the solver is given that spoke's
// side first. The zone names rank above the stations (2D places them first: a station gives way to a zone name, not the other way).
import type { Dir } from '../labels/geometry.ts';
import type { Form, Item } from '../labels/solver.ts';
import { type Measure, type Vp, boxSize, nameRun, stationRuns } from '../labels/type.ts';
import { lymphText, LYMPH_UNIT } from '../../ui/action/lymph-day.ts';
import type { Course, LobuleNet, P2 } from './geometry.ts';
import { DISC_R, RS_N } from './widths.ts';

/** Where each zone's name stands along the radius to the flat bottom edge, in shares of the apothem (2D ZONE_Q), and the radius's direction (down, in 2D's y-down plane). */
export const ZONE_Q = [0.83, 0.51, 0.2] as const;
export const APOTHEM = 0.866;
export const ZONE_WORDS: readonly (readonly [string, string])[] = [['Zone 1', 'periportal'], ['Zone 2', 'midzonal'], ['Zone 3', 'centrilobular']];

export type CapKey = 'triad' | 'sin' | 'cv' | 'ha' | 'bd' | 'lymph';
/** What a placed caption writes: the words of each form, and the reading it carries (a pressure of the model, or the lymph). */
export interface CapMeta { id: string; kind: 'zone' | 'station'; forms: readonly { name: string; value: boolean }[]; read: 'P1' | 'P2' | 'P3' | 'lymph' | 'O1' | 'O2' | 'O3' | null; label: string; target: string }

export interface CapCtx {
  /** a point of the lobule plate (its own units) on the canvas now, CSS px */
  proj(x: number, y: number): [number, number];
  vp: Vp;
  measure: Measure;
  net: Pick<LobuleNet, 'triads' | 'courses' | 'corners'>;
  layers: { zones: boolean; lymph: boolean };
  /** the oxygen lens is on: each zone's name carries the saturation its colour is read from (Lobule 3, capture 52ef8e63: a slide that teaches a gradient printed no number) */
  oxygen?: boolean;
  /** the slide names these station keys (they stand first) */
  must?: ReadonlySet<string>;
  /** whether a canvas point is on screen and clear of the cards (the tract the names are about is one whose venule is: 2D labels the bottom tract of what it shows) */
  inView?(x: number, y: number): boolean;
  /** every part of the lobule is unmeasured (the model has no pressures): the readings are '?' */
  hide?: boolean;
  /** a slide is on: a pressure carries its unit ("12.3 mmHg"), as every label on a slide does (2D B2, 16 Nov: "Varices 14.4" with no unit on a slide), where in free play the legend says it once */
  unit?: boolean;
}

const WORDS: Record<CapKey, { name: string; short: string; pri: number; tone: string; target: string }> = {
  triad: { name: 'Portal venule', short: 'Portal venule', pri: 90, tone: 'portal', target: 'lobule:triad' },
  sin: { name: 'Sinusoids', short: 'Sinusoids', pri: 80, tone: 'portal', target: 'lobule:sinusoid' },
  cv: { name: 'Central vein', short: 'Central vein', pri: 85, tone: 'hepatic', target: 'lobule:central' },
  ha: { name: 'Hepatic arteriole', short: 'Arteriole', pri: 60, tone: 'artery', target: 'lobule:arteriole' },
  bd: { name: 'Bile ductule', short: 'Bile ductule', pri: 55, tone: 'bile', target: 'lobule:ductule' },
  lymph: { name: 'Hepatic lymph', short: 'Lymph', pri: 50, tone: 'lymph', target: 'lobule:lymph' },
};
/** The courses a name stands clear of or avoids: the blood's sinusoids and cross-links, the inlets and the arteriole's twigs. */
export const LINE_KINDS: ReadonlySet<string> = new Set(['s0', 's1', 's2', 'an', 'in', 'tw']);
/** The words of a station stand at least this far from its vessel's edge, so its leader and ring always show (2D keeps a visible stretch, lobule-zoom-records.js solve: 16 px from the vessel's middle; here from its edge, over the 12 px a leader needs, so the least that always shows). */
export // the figure's names stay within about 70 px of their vessel (solver LONG_LEAD); the lobule's names reach as far as 2D's did, so the tract's names can stand on the side their vessels face
const LOBULE_REACH = 140;
const MIN_LEAD = 13;
/** The central vein's name may stand this far from the vein (px) to find a place clear of the sinusoids that run into it (on a phone the hexagon fills the width, so the nearest clear band is past its rim). */
export const CV_REACH = 300;
/** The widest an oxygen reading prints ("100% O₂"), so the box keeps its size as the number moves. */
export const OXY_SAMPLE = '100% O₂';
const READ: Record<CapKey, CapMeta['read']> = { triad: 'P1', sin: 'P2', cv: 'P3', ha: null, bd: null, lymph: 'lymph' };

const UNIT: Record<Dir, readonly [number, number]> = {
  E: [1, 0], W: [-1, 0], N: [0, -1], S: [0, 1], NE: [Math.SQRT1_2, -Math.SQRT1_2], NW: [-Math.SQRT1_2, -Math.SQRT1_2], SE: [Math.SQRT1_2, Math.SQRT1_2], SW: [-Math.SQRT1_2, Math.SQRT1_2],
};
/** The three sides of the compass nearest a direction on the canvas (a spoke), best first. */
export function sidesToward(dx: number, dy: number): Dir[] {
  const l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l;
  return (Object.keys(UNIT) as Dir[]).map((d) => [d, UNIT[d][0] * ux + UNIT[d][1] * uy] as const).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, 3).map((x) => x[0]);
}

/** The tract the tract names are about: the one lowest on the canvas now (2D labels the lobule's bottom tract, where its zone names stand too). */
export function labelledTriad(ctx: Pick<CapCtx, 'proj' | 'net' | 'inView'>): number {
  let best = -1, by = -Infinity;
  // (a tract whose arteriole, ductule or lymphatic is off the view or under a card has one of its four names with no dot to stand by, "hidden" by the solver: the lowest tract with all four in view takes the names)
  for (const whole of [true, false]) {
    for (const t of ctx.net.triads) {
      const [x, y] = ctx.proj(t.x, t.y);
      if (ctx.inView && !ctx.inView(x, y)) continue;   // (a tract off screen has no names to put: the lowest one in view takes them)
      if (whole && ctx.inView && [t.ha, t.bd, t.lv].some((q) => { const [qx, qy] = ctx.proj(q[0], q[1]); return !ctx.inView!(qx, qy); })) continue;
      if (y > by + 1e-6) { by = y; best = t.i; }
    }
    if (best >= 0) return best;
  }
  for (const t of ctx.net.triads) { const y = ctx.proj(t.x, t.y)[1]; if (y > by + 1e-6) { by = y; best = t.i; } }
  return best;
}

/** The radius of what a station names, in lobule radii: the disc of an end-on vessel, the lumen of a sinusoid (2D lobule-zoom-field.js radiusAt). */
export const STATION_R: Record<CapKey, number> = { triad: DISC_R.pv, sin: RS_N, cv: DISC_R.cv, ha: DISC_R.ha, bd: DISC_R.bd, lymph: DISC_R.lv };

/** Where a station's dot stands on the plate (its own units): the tract's venule, arteriole, ductule and lymphatic, the middle of a sinusoid of the tract's side, the centre. */
export function stationAt(net: CapCtx['net'], tri: number, k: CapKey): P2 {
  const t = net.triads[tri]!;
  if (k === 'triad') return [t.x, t.y];
  if (k === 'ha') return t.ha;
  if (k === 'bd') return t.bd;
  if (k === 'lymph') return t.lv;
  if (k === 'cv') return [0, 0];
  const c = sinCourse(net, tri);
  return c ? c.pts[Math.floor(c.pts.length / 2)]! : [t.x * 0.5, t.y * 0.5];
}

/** The sinusoid a tract's "Sinusoids" station stands on: the s1 course that leaves nearest the tract's angle,
 *  judged by the middle of its length. The pair of readings (labels/pair.ts) rings two points of this one. */
export function sinCourse(net: Pick<CapCtx['net'], 'triads' | 'courses'>, tri: number): Course | null {
  const t = net.triads[tri]!;
  let best: Course | null = null, bd = Infinity;
  for (const c of net.courses) {
    if (c.kind !== 's1' || c.pts.length < 3) continue;
    const m = c.pts[Math.floor(c.pts.length / 2)]!, d = Math.hypot(m[0] - t.x * 0.55, m[1] - t.y * 0.55);
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}

type Tri = { x: number; y: number }[];
/** The triad the lobule shots frame: the one nearest the corner at angle pi, (-1, 0) (shots.ts: `along = -1 + wf`). Derived, never numbered. */
export function framedTriad(triads: Tri): number {
  let best = 0, bd = Infinity;
  triads.forEach((t, i) => { const d = Math.hypot(t.x + 1, t.y); if (d < bd) { bd = d; best = i; } });
  return best;
}

const form = (text: string, w: number, h: number): Form => ({ text, w, h });

/** Everything the lobule says now: the solver's items and what each writes. */
export function buildLobuleCaptions(ctx: CapCtx): { items: Item[]; meta: Map<string, CapMeta>; tri: number; keep: { id: string; x: number; y: number; r: number }[]; lines: [number, number, number, number][] } {
  const items: Item[] = [], meta = new Map<string, CapMeta>(), { vp, measure } = ctx;
  const tri = labelledTriad(ctx);
  // how big a lobule radius is on the canvas now: a vessel's disc and lumen, as the names must clear them
  const o0 = ctx.proj(0, 0), o1 = ctx.proj(1, 0), pxR = Math.hypot(o1[0] - o0[0], o1[1] - o0[1]) || 1;
  const rOf = (k: CapKey) => Math.max(2, STATION_R[k] * pxR);

  // ── the zone names: on the radius to the flat bottom edge, at 0.83, 0.51 and 0.20 of the apothem ──
  if (ctx.layers.zones) {
    ZONE_WORDS.forEach(([t, d], i) => {
      const [ax, ay] = ctx.proj(0, APOTHEM * ZONE_Q[i]!);
      const full = `${t} ${d}`, bf = boxSize([{ ...nameRun(full), size: 10.5, weight: 600 }], vp, measure), bs = boxSize([{ ...nameRun(t), size: 10.5, weight: 600 }], vp, measure);
      const id = `z:${i + 1}`;
      const forms: Form[] = [form(full, bf.w, bf.h), form(t, bs.w, bs.h)], formsM: { name: string; value: boolean }[] = [{ name: full, value: false }, { name: t, value: false }];
      // with the oxygen lens the reading stands after the name, widest form first; the plain names stay as the forms a tight room falls back to
      if (ctx.oxygen) {
        const sample = ctx.hide ? '?' : OXY_SAMPLE, mkv = (n: string): Form => { const b = boxSize(stationRuns(n, true, false, sample), vp, measure); return form(n, b.w, b.h); };
        forms.unshift(mkv(full), mkv(t)); formsM.unshift({ name: full, value: true }, { name: t, value: true });
      }
      items.push({ id, ax, ay, au: 0.5, forms, pri: 95, region: true });
      meta.set(id, { id, kind: 'zone', forms: formsM, read: ctx.oxygen ? (`O${i + 1}` as 'O1' | 'O2' | 'O3') : null, label: `${t}, ${d}`, target: `lobule:zone${i + 1}` });
    });
  }

  // ── the stations ──
  const venule = ctx.proj(ctx.net.triads[tri]!.x, ctx.net.triads[tri]!.y);
  const keys: CapKey[] = ['triad', 'sin', 'cv', 'ha', 'bd'];
  if (ctx.layers.lymph) keys.push('lymph');
  // the tract's spokes (2D tractFan): the arteriole's, the ductule's and the lymphatic's names stand out along the ray from the venule through what they name; the venule's own straight out from the
  // central vein when the lymph's is not shown, else between the arteriole's and the lymphatic's, so the four run round the tract in the order of what they name and no leader crosses another
  const cvAt = ctx.proj(0, 0);
  const unit = (dx: number, dy: number, fb: readonly [number, number]): [number, number] => { const l = Math.hypot(dx, dy); return l < 1e-6 ? [fb[0], fb[1]] : [dx / l, dy / l]; };
  const out = unit(venule[0] - cvAt[0], venule[1] - cvAt[1], [0, 1]);
  const spokeOf: Partial<Record<CapKey, [number, number]>> = {};
  for (const k of ['ha', 'bd', 'lymph'] as const) { if (k === 'lymph' && !ctx.layers.lymph) continue; const a = ctx.proj(...stationAt(ctx.net, tri, k)); spokeOf[k] = unit(a[0] - venule[0], a[1] - venule[1], out); }
  if (ctx.layers.lymph && spokeOf.lymph) { const base = spokeOf.ha ?? spokeOf.bd!; spokeOf.triad = unit(base[0] + spokeOf.lymph[0], base[1] + spokeOf.lymph[1], out); } else spokeOf.triad = out;
  const keep: { id: string; x: number; y: number; r: number }[] = [], lines: [number, number, number, number][] = [];
  // the discs of the vessels seen end-on (the tract's four, the central vein): no name stands on one, no leader runs across another's
  for (const k of ['triad', 'ha', 'bd', 'lymph', 'cv'] as const) {
    if (k === 'lymph' && !ctx.layers.lymph) continue;
    const a = ctx.proj(...stationAt(ctx.net, tri, k)); keep.push({ id: k, x: a[0], y: a[1], r: rOf(k) });
  }
  // the courses drawn under the names (sinusoids, cross-links, inlets, twigs), every sample of each: a name avoids standing across one (a soft cost in the solver), and the central vein's, where they all
  // converge, stands wholly clear of them (`clearLines`)
  for (const c of ctx.net.courses) {
    if (!LINE_KINDS.has(c.kind)) continue;
    let prev: [number, number] | null = null;
    for (let i = 0; i < c.pts.length; i++) { const q = ctx.proj(c.pts[i]![0], c.pts[i]![1]); if (prev) lines.push([prev[0], prev[1], q[0], q[1]]); prev = q; }
  }
  for (const k of keys) {
    // (a sinusoid the slide shows its reading for stands on the framed tract's side, where the slide's own callout is kept off it (callout-spot.ts):
    //  the tract the tract names are about is the lowest one in view, and when the framed tract is at the screen's edge (a phone's zoomed shot)
    //  that is another one, whose sinusoid is off the screen: the name was left out, wedge slide on an iPhone, 25 Nov)
    const w = WORDS[k], at = stationAt(ctx.net, k === 'sin' && ctx.must?.has('sin') ? framedTriad(ctx.net.triads) : tri, k), [ax, ay] = ctx.proj(at[0], at[1]);
    const reads = READ[k] !== null, must = !!ctx.must?.has(k);
    const mk = (name: string, v: boolean): Form => { const b = boxSize(stationRuns(name, v, false, ctx.hide ? '?' : k === 'lymph' ? (ctx.unit ? `0,000 ${LYMPH_UNIT}` : '0,000') : ctx.unit ? '00.0 mmHg' : '00.0'), vp, measure); return form(name, b.w, b.h); };
    const formsM: { name: string; value: boolean }[] = [{ name: w.name, value: reads }];
    const forms: Form[] = [mk(w.name, reads)];
    if (w.short !== w.name) { forms.push(mk(w.short, reads)); formsM.push({ name: w.short, value: reads }); }
    // a station the slide shows its reading for (`must`) keeps only the forms that carry it: "Sinusoids" with no number is not what the slide asked for,
    // and the solver's cost took the narrower bare form over the wide one on a net this dense (Mohammad, 25 Nov, wedge slide: no 16.7 beside the WHVP card)
    const stand = reads && must;
    if (reads && !stand) { forms.push(mk(w.short, false)); formsM.push({ name: w.short, value: false }); }
    // (No form is a number alone, as 2D's: its lobule label always builds the name, long or short, `.n-long` / `.n-short` in lobule-zoom-labels.js labBuild; a name with no room is left out whole.)
    // a tract name stands out along the ray from the venule through what it names (its spoke); the others on the side their dot faces
    const spoke = spokeOf[k] ?? (k === 'cv' ? [0, 1] : [0, -1]);
    items.push({ id: k, ax, ay, au: 0.5, forms, pri: must ? 100 : w.pri, must, dirs: sidesToward(spoke[0]!, spoke[1]!), vw: rOf(k), minLead: MIN_LEAD, looseFar: true, reach: LOBULE_REACH + rOf(k) + 10, ...(k === 'cv' ? { clearLines: true, reach: CV_REACH, prefer: [-out[0], -out[1]] as const } : stand ? { clearLines: true, reach: CV_REACH } : {}), ...(k === 'triad' || k === 'ha' || k === 'bd' || k === 'lymph' ? { face: { cx: venule[0], cy: venule[1], ux: spoke[0]!, uy: spoke[1]! } } : {}) });
    meta.set(k, { id: k, kind: 'station', forms: formsM, read: READ[k], label: w.name, target: w.target });
  }
  return { items, meta, tri, keep, lines };
}

/** The reading a station carries, as text (the model's own numbers, one place so a test reads what the layer writes). */
export function readingText(read: CapMeta['read'], m: { P1: number; P2: number; P3: number; lymph: number; oxy?: ArrayLike<number> }, hide: boolean, unit = false): string {
  if (!read) return '';
  if (hide) return '?';
  if (read === 'lymph') return unit ? `${lymphText(m.lymph)} ${LYMPH_UNIT}` : lymphText(m.lymph);   // (a slide's label carries its unit, as the pressures beside it do: "Lymph 3,580" had a number and no unit, capture 2a54261a)
  if (read[0] === 'O') {
    // a zone's oxygen: the saturation at its end of the sinusoid (zone 1 at the portal venule, zone 3 at the central vein), the same number the lens colours it by
    const sat = m.oxy?.[Number(read[1]) - 1];
    return typeof sat === 'number' && Number.isFinite(sat) ? `${Math.round(sat * 100)}% O₂` : '—';
  }
  const v = m[read as 'P1' | 'P2' | 'P3'];
  if (!Number.isFinite(v)) return '—';
  const f = Math.abs(v).toFixed(1);
  return (v < 0 && Number(f) !== 0 ? '−' : '') + f + (unit ? ' mmHg' : '');
}

/** What a reading changes about where the words may stand: only how wide each prints (its characters), never its value. A pressure that moves by a tenth between two frames must not send the words
 *  through a fade out, a new solve and a fade in (Mohammad, 20 Nov: "the labels in the lobule view are flashing"): the signature the layout is judged by holds these lengths, and the text itself is
 *  written again in place (LobuleCaptions refreshReadings). */
export function readingSig(m: { P1: number; P2: number; P3: number; lymph: number; oxy?: ArrayLike<number> } | null | undefined, unit = false): string {
  if (!m) return '-';
  return (['P1', 'P2', 'P3', 'lymph', 'O1', 'O2', 'O3'] as const).map((k) => readingText(k, m, false, unit).length).join(',');
}

/** The canvas the lobule's names may use: the screen inside its safe areas and under the top bar, down to the foot of the room the lobule is framed in plus 8 px (2D lobule-zoom.js liveFreeInto: the room
 *  ends 8 px over --bot-occ, the dock and the view pill; its labels keep to the free space, `fr`, which ends at --bot-occ). Nothing of a name stands over the dock. */
export function lobuleLabelView(vp: { w: number; h: number; safe: { top: number; bottom: number; left: number; right: number } }, topBar: number, room: { y: number; h: number } | null): { x0: number; y0: number; x1: number; y1: number } {
  const bottom = vp.h - vp.safe.bottom;
  return { x0: vp.safe.left, y0: vp.safe.top + topBar, x1: vp.w - vp.safe.right, y1: room && room.h > 1 ? Math.min(bottom, room.y + room.h + 8) : bottom };
}
