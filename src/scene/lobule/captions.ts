// The lobule's words, as 2D writes them (lobule-zoom-labels.js, lobule-tract-labels.js): the three zone names (Zone 1 periportal, Zone 2 midzonal, Zone 3 centrilobular, on the radius to the
// flat bottom edge, shown with the Zones layer), and the stations: the portal venule, the sinusoids and the central vein with the pressure in each, the hepatic arteriole and the bile
// ductule named, and (Lymph layer on) the hepatic lymph. This builds what the one label solver (labels/solver.ts) is given, from the plate as it stands on the canvas. Pure: no DOM, no three.js.
// Each tract name stands out along the ray from the venule through what it names (the 2D rule, lobule-tract-labels.js: spokes of one hub never cross), so the solver is given that spoke's
// side first. The zone names rank above the stations (2D places them first: a station gives way to a zone name, not the other way).
import type { Dir } from '../labels/geometry.ts';
import type { Form, Item } from '../labels/solver.ts';
import { type Measure, type Vp, boxSize, nameRun, stationRuns } from '../labels/type.ts';
import { lymphText } from '../../ui/action/lymph-day.ts';
import type { LobuleNet, P2 } from './geometry.ts';
import { DISC_R, RS_N } from './widths.ts';

/** Where each zone's name stands along the radius to the flat bottom edge, in shares of the apothem (2D ZONE_Q), and the radius's direction (down, in 2D's y-down plane). */
export const ZONE_Q = [0.83, 0.51, 0.2] as const;
export const APOTHEM = 0.866;
export const ZONE_WORDS: readonly (readonly [string, string])[] = [['Zone 1', 'periportal'], ['Zone 2', 'midzonal'], ['Zone 3', 'centrilobular']];

export type CapKey = 'triad' | 'sin' | 'cv' | 'ha' | 'bd' | 'lymph';
/** What a placed caption writes: the words of each form, and the reading it carries (a pressure of the model, or the lymph). */
export interface CapMeta { id: string; kind: 'zone' | 'station'; forms: readonly { name: string; value: boolean }[]; read: 'P1' | 'P2' | 'P3' | 'lymph' | null; label: string; target: string }

export interface CapCtx {
  /** a point of the lobule plate (its own units) on the canvas now, CSS px */
  proj(x: number, y: number): [number, number];
  vp: Vp;
  measure: Measure;
  net: Pick<LobuleNet, 'triads' | 'courses' | 'corners'>;
  layers: { zones: boolean; lymph: boolean };
  /** the slide names these station keys (they stand first) */
  must?: ReadonlySet<string>;
  /** whether a canvas point is on screen and clear of the cards (the tract the names are about is one whose venule is: 2D labels the bottom tract of what it shows) */
  inView?(x: number, y: number): boolean;
  /** every part of the lobule is unmeasured (the model has no pressures): the readings are '?' */
  hide?: boolean;
}

const WORDS: Record<CapKey, { name: string; short: string; pri: number; tone: string; target: string }> = {
  triad: { name: 'Portal venule', short: 'Portal venule', pri: 90, tone: 'portal', target: 'lobule:triad' },
  sin: { name: 'Sinusoids', short: 'Sinusoids', pri: 80, tone: 'portal', target: 'lobule:sinusoid' },
  cv: { name: 'Central vein', short: 'Central vein', pri: 85, tone: 'hepatic', target: 'lobule:central' },
  ha: { name: 'Hepatic arteriole', short: 'Arteriole', pri: 60, tone: 'artery', target: 'lobule:arteriole' },
  bd: { name: 'Bile ductule', short: 'Bile ductule', pri: 55, tone: 'bile', target: 'lobule:ductule' },
  lymph: { name: 'Hepatic lymph', short: 'Lymph', pri: 50, tone: 'lymph', target: 'lobule:lymph' },
};
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
  for (const t of ctx.net.triads) {
    const [x, y] = ctx.proj(t.x, t.y);
    if (ctx.inView && !ctx.inView(x, y)) continue;   // (a tract off screen has no names to put: the lowest one in view takes them)
    if (y > by + 1e-6) { by = y; best = t.i; }
  }
  if (best >= 0) return best;
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
  // the sinusoid: the first one of the tract's whole course (the s1 that leaves nearest its angle), at the middle of its length
  let best: P2 | null = null, bd = Infinity;
  for (const c of net.courses) {
    if (c.kind !== 's1' || c.pts.length < 3) continue;
    const m = c.pts[Math.floor(c.pts.length / 2)]!, d = Math.hypot(m[0] - t.x * 0.55, m[1] - t.y * 0.55);
    if (d < bd) { bd = d; best = m; }
  }
  return best ?? [t.x * 0.5, t.y * 0.5];
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
      const full = `${t} ${d}`, bf = boxSize([{ ...nameRun(full), size: 10.5, weight: 650 }], vp, measure), bs = boxSize([{ ...nameRun(t), size: 10.5, weight: 650 }], vp, measure);
      const id = `z:${i + 1}`;
      items.push({ id, ax, ay, au: 0.5, forms: [form(full, bf.w, bf.h), form(t, bs.w, bs.h)], pri: 95, region: true });
      meta.set(id, { id, kind: 'zone', forms: [{ name: full, value: false }, { name: t, value: false }], read: null, label: `${t}, ${d}`, target: `lobule:zone${i + 1}` });
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
  // the courses (sinusoids, inlets, twigs): a name avoids standing across one (a soft cost in the solver)
  for (const c of ctx.net.courses) {
    if (c.kind !== 's0' && c.kind !== 's1' && c.kind !== 's2' && c.kind !== 'in') continue;
    let prev: [number, number] | null = null;
    for (let i = 0; i < c.pts.length; i += 3) { const q = ctx.proj(c.pts[i]![0], c.pts[i]![1]); if (prev) lines.push([prev[0], prev[1], q[0], q[1]]); prev = q; }
  }
  for (const k of keys) {
    const w = WORDS[k], at = stationAt(ctx.net, tri, k), [ax, ay] = ctx.proj(at[0], at[1]);
    const reads = READ[k] !== null;
    const mk = (name: string, v: boolean): Form => { const b = boxSize(stationRuns(name, v, false, ctx.hide ? '?' : k === 'lymph' ? '0,000' : '00.0'), vp, measure); return form(name, b.w, b.h); };
    const formsM: { name: string; value: boolean }[] = [{ name: w.name, value: reads }];
    const forms: Form[] = [mk(w.name, reads)];
    if (w.short !== w.name) { forms.push(mk(w.short, reads)); formsM.push({ name: w.short, value: reads }); }
    if (reads) { forms.push(mk(w.short, false)); formsM.push({ name: w.short, value: false }); }
    forms.push(mk('', reads)); formsM.push({ name: '', value: reads });
    // a tract name stands out along the ray from the venule through what it names (its spoke); the others on the side their dot faces
    const spoke = spokeOf[k] ?? (k === 'cv' ? [0, 1] : [0, -1]);
    const must = !!ctx.must?.has(k);
    items.push({ id: k, ax, ay, au: 0.5, forms, pri: must ? 100 : w.pri, must, dirs: sidesToward(spoke[0]!, spoke[1]!), vw: rOf(k), ...(k === 'triad' || k === 'ha' || k === 'bd' || k === 'lymph' ? { face: { cx: venule[0], cy: venule[1], ux: spoke[0]!, uy: spoke[1]! } } : {}) });
    meta.set(k, { id: k, kind: 'station', forms: formsM, read: READ[k], label: w.name, target: w.target });
  }
  return { items, meta, tri, keep, lines };
}

/** The reading a station carries, as text (the model's own numbers, one place so a test reads what the layer writes). */
export function readingText(read: CapMeta['read'], m: { P1: number; P2: number; P3: number; lymph: number }, hide: boolean): string {
  if (!read) return '';
  if (hide) return '?';
  if (read === 'lymph') return lymphText(m.lymph);
  const v = m[read];
  if (!Number.isFinite(v)) return '—';
  const f = Math.abs(v).toFixed(1);
  return (v < 0 && Number(f) !== 0 ? '−' : '') + f;
}
