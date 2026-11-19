// The stiffness bar (2D: stiff-bar.js, host 'stiff'): Baveno VIII's rule of five under the FibroScan number, and the spleen's bar on the 100 Hz probe.
// The cut-offs come from the engine copy (lsm-cuts.js, ssm-cuts.js), the words from the 2D file, the layout is its layout with every word at 12 px or more.
import { LSM_CUTS, LSM_STEPS, csphVerdict } from '../../../engine/hales/portal/lsm-cuts.js';
import { SSM_CUTS, SSM_STEPS, ssmZone } from '../../../engine/hales/portal/ssm-cuts.js';
import { TILE } from '../tiles.generated.ts';
import { wrapWords } from '../trial/model.ts';
import type { Measure } from '../flows/layout.ts';

export const FLOOR = 12;
const GAP = 1.5;   // px between two zones

/** look → [weight, size in em of the card's type size]: the bar's words (chart-looks/stiff.js). A word is never set under 12 px. */
export const TYPE: Record<string, readonly [number, number]> = {
  'stiff.tk': [500, 0.92], 'stiff.zl': [600, 0.85], 'stiff.plt': [500, 1], 'stiff.v': [600, 1], 'stiff.note': [500, 0.92],
};
export const sizeOf = (look: string, f: number) => Math.max(FLOOR, TYPE[look]![1] * f);

export interface Zone { to: number; look: string; words: string[] }
export const ZONES: Zone[] = [
  { to: LSM_CUTS.unlikely, look: 'stiff.z0', words: ['No cACLD'] },
  { to: LSM_CUTS.likely, look: 'stiff.z1', words: ['Suggests', 'cACLD'] },
  { to: LSM_CUTS.ruleIn, look: 'stiff.z2', words: ['cACLD,', 'CSPH unclear'] },
  { to: 30, look: 'stiff.z3', words: ['CSPH'] },
];
export const SPLEEN_ZONES: Zone[] = [
  { to: SSM_CUTS.spareScope, look: 'stiff.z0', words: ['Spares', 'EGD'] },
  { to: SSM_CUTS.ruleIn, look: 'stiff.z2', words: ['CSPH', 'unclear'] },
  { to: SSM_CUTS.max, look: 'stiff.z3', words: ['CSPH'] },
];
export const RULE_NOTE = 'Rule of 5: each step of 5 kPa from 10 to 25 carries a higher risk of decompensation (Baveno VIII 1.8).';
export const INDETERMINATE_NOTE = 'From 15 to 25 kPa the LSM does not decide: ANTICIPATE ≥75% or an SSM >55 kPa rules CSPH in, otherwise re-evaluate in 12 months (Baveno VIII 1.16, 1.17).';
export const indeterminate = (lsm: number | null) => Number.isFinite(lsm) && lsm! > LSM_CUTS.likely && lsm! < LSM_CUTS.ruleIn;
export const SPLEEN_NOTE = `100 Hz probe: above ${SSM_CUTS.ruleIn} kPa establishes CSPH (Baveno VIII 1.16c); below ${SSM_CUTS.spareScope} kPa spares screening endoscopy in a patient who cannot take a beta-blocker (1.19).`;
export type Organ = 'liver' | 'spleen';
export type Context = 'congested' | 'vascular' | null;
type Tone = 'ok' | 'hi' | 'mid';
export type Verdict = readonly [string, Tone];

interface Bar { zones: Zone[]; steps: readonly number[]; zoneOf(v: number): Zone; name: string; note: string }
export const BARS: Record<Organ, Bar> = {
  liver: { zones: ZONES, steps: LSM_STEPS, zoneOf: (v) => ZONES.find((q) => v < q.to) ?? ZONES[3]!, name: 'Liver stiffness', note: RULE_NOTE },
  spleen: { zones: SPLEEN_ZONES, steps: SSM_STEPS, zoneOf: (v) => SPLEEN_ZONES[ssmZone(v) === 'spare' ? 0 : ssmZone(v) === 'in' ? 2 : 1]!, name: 'Spleen stiffness', note: SPLEEN_NOTE },
};
export const VERDICT: Record<string, Verdict> = { out: ['CSPH ruled out', 'ok'], in: ['CSPH ruled in', 'hi'], open: ['CSPH not ruled out', 'mid'], between: ['CSPH not ruled in or out', 'mid'], congested: ['Congestion: CSPH rules do not apply', 'mid'], vascular: ['Vascular disease: CSPH rules do not apply', 'mid'] };
export const CONGESTION_NOTE = 'This stiffness reflects congestion, not fibrosis. The Baveno VIII stiffness rules for CSPH apply to compensated advanced chronic liver disease, not to congestion.';
export const VASCULAR_NOTE = 'No sinusoidal fibrosis here. The Baveno VIII stiffness rules for CSPH apply to compensated advanced chronic liver disease, not to vascular liver disease: a normal stiffness does not exclude portal hypertension.';
export const ctxFor = (organ: Organ, ctx: Context | string | null | undefined): Context => (ctx === 'congested' || (ctx === 'vascular' && organ !== 'spleen') ? ctx : null);
const NOTE_OF: Record<string, string> = { congested: CONGESTION_NOTE, vascular: VASCULAR_NOTE };
const SPLEEN_NOT_IN: Verdict = ['CSPH not ruled in', 'mid'];

export function verdictOf(lsm: number, plt: number, ctx: Context = null): Verdict | null {
  const v = (csphVerdict as (a: number, b: number, c: Context) => string | null)(lsm, plt, ctx);
  return v == null ? null : v === 'open' && lsm > LSM_CUTS.likely ? VERDICT.between! : VERDICT[v]!;
}
export const spleenVerdictOf = (ssm: number | null, ctx: Context = null): Verdict | null => (!Number.isFinite(ssm) ? null : ctxFor('spleen', ctx) ? VERDICT.congested! : ssmZone(ssm!) === 'in' ? VERDICT.in! : SPLEEN_NOT_IN);
export const plateletWords = (plt: number) => `Platelets ${Math.round(plt)} ${TILE.plt!.u}, ${plt < LSM_CUTS.ruleOutPlt ? `under ${LSM_CUTS.ruleOutPlt}` : `${LSM_CUTS.ruleOutPlt} or more`}`;

export function stiffWords(lsm: number | null, plt: number | null, organ: Organ = 'liver', ctx0: Context = null): string {
  const B = BARS[organ] ?? BARS.liver, spleen = B === BARS.spleen;
  if (!Number.isFinite(lsm)) return `${B.name} on the ${spleen ? '100 Hz probe' : 'rule of five'}: no reading.`;
  const ctx = ctxFor(organ, ctx0), z = B.zoneOf(lsm!);
  const v = spleen ? spleenVerdictOf(lsm, ctx) : ctx ? VERDICT[ctx]! : Number.isFinite(plt) ? verdictOf(lsm!, plt!) : null;
  if (ctx) return `${B.name} ${lsm!.toFixed(1)} kPa.${!spleen && Number.isFinite(plt) ? ` ${plateletWords(plt!)}.` : ''} ${v![0]}. ${NOTE_OF[ctx]}`;
  return `${B.name} ${lsm!.toFixed(1)} kPa on ${spleen ? 'the 100 Hz probe' : "Baveno VIII's rule of five"}: ${z.words.join(' ')}.${!spleen && Number.isFinite(plt) ? ` ${plateletWords(plt!)}.` : ''}${v ? ` ${v[0]}.` : ''}${!spleen && indeterminate(lsm) ? ' Next: an ANTICIPATE probability or a spleen stiffness, or re-evaluate in 12 months.' : ''}`;
}

export interface SText { x: number; y: number; t: string; look: string; anchor: 'start' | 'middle' | 'end' }
export interface SRect { x: number; y: number; w: number; h: number; r: number; look: string }
export interface StiffLayout { texts: SText[]; rects: SRect[]; /** the mark's triangle (x0,y0,x1,y1,x2,y2) or null with no reading */ mark: number[] | null; H: number }
export interface StiffIn { lsm?: number | null; plt?: number | null; note?: boolean; organ?: Organ; ctx?: Context }

/** The bar's drawing at width W and card type size f. Pure. Same order as the 2D layout; the sizes are never under 12 px. */
export function stiffLayout(W: number, f: number, meas: Measure, { lsm = null, plt = null, note = false, organ = 'liver', ctx: ctx0 = null }: StiffIn = {}): StiffLayout {
  const ctx = ctxFor(organ, ctx0), congested = !!ctx;
  const B = BARS[organ] ?? BARS.liver, spleen = B === BARS.spleen, zones = B.zones, AXIS = zones.at(-1)!.to;
  const texts: SText[] = [], rects: SRect[] = [];
  const px = (look: string) => sizeOf(look, f), wt = (look: string) => TYPE[look]![0];
  const say = (x: number, y: number, t: string, look: string, anchor: SText['anchor'] = 'start') => texts.push({ x, y, t, look, anchor });
  const pad = Math.ceil(f * 0.3), ew = W - 2 * pad, X = (v: number) => pad + (Math.min(Math.max(v, 0), AXIS) / AXIS) * ew;
  const a = f * 0.5, bh = Math.max(8, Math.round(f * 0.9)), by = Math.ceil(a + f * 0.15);
  let from = 0;
  zones.forEach((z, i) => {
    const x0 = X(from) + (i ? GAP / 2 : 0), x1 = X(z.to) - (i < zones.length - 1 ? GAP / 2 : 0);
    rects.push({ x: x0, y: by, w: x1 - x0, h: bh, r: Math.min(3, bh / 2), look: congested ? 'stiff.zn' : z.look });
    from = z.to;
  });
  let y = by + bh + f * 0.3;
  const tk = px('stiff.tk');
  for (const v of B.steps) say(X(v), y + tk * 0.8, String(v), 'stiff.tk', 'middle');
  y += tk * 1.1 + f * 0.3;
  const zl = px('stiff.zl'), zlh = zl * 1.2;
  let lines = 0;
  from = 0;
  for (const z of congested ? [] : zones) {
    const cx = Math.min(Math.max((X(from) + X(z.to)) / 2, 0), W);
    z.words.forEach((t, i) => {
      const w = meas(t, zl, wt('stiff.zl')), c = Math.min(Math.max(cx, w / 2), W - w / 2);
      say(c, y + zl * 0.8 + i * zlh, t, 'stiff.zl', 'middle');
    });
    lines = Math.max(lines, z.words.length);
    from = z.to;
  }
  y += lines * zlh;
  let mark: number[] | null = null;
  if (Number.isFinite(lsm)) {
    const mx = X(lsm!), s = a * 0.62;
    mark = [mx - s, 0, mx + s, 0, mx, a];
    rects.push({ x: mx - 1, y: a - 1, w: 2, h: by + bh - a + 1 + f * 0.25, r: 1, look: 'stiff.mk' });
  }
  const pl = px('stiff.plt');
  if (spleen) {
    const v = congested ? VERDICT[ctx!]! : spleenVerdictOf(lsm);
    if (v) { y += f * 0.9; say(0, y + pl * 0.8, v[0], `stiff.v.${v[1]}`); y += pl * 1.2; }
  } else if (Number.isFinite(plt) || (congested && Number.isFinite(lsm))) {
    y += f * 0.9;
    const v = congested ? VERDICT[ctx!]! : verdictOf(lsm!, plt!);
    const wl = Number.isFinite(plt) ? wrapWords(plateletWords(plt!), W, pl, wt('stiff.plt'), meas, 2) : null;
    if (wl) {
      wl.forEach((l, i) => say(0, y + pl * (0.8 + i * 1.3), l, 'stiff.plt'));
      y += (wl.length - 1) * pl * 1.3;
    }
    if (v) {
      const vw = meas(v[0], px('stiff.v'), wt('stiff.v')), lw = wl ? meas(wl[wl.length - 1]!, pl, wt('stiff.plt')) : 0;
      if (wl && lw + f * 0.8 + vw <= W) say(W, y + pl * 0.8, v[0], `stiff.v.${v[1]}`, 'end');
      else { if (wl) y += pl * 1.4; say(0, y + pl * 0.8, v[0], `stiff.v.${v[1]}`); }
    }
    y += pl * 1.2;
  }
  if (note) {
    y += f * 0.5;
    const nf = px('stiff.note');
    const nl = wrapWords(congested ? NOTE_OF[ctx!]! : !spleen && indeterminate(lsm) ? INDETERMINATE_NOTE : B.note, W, nf, wt('stiff.note'), meas, 3);
    nl.forEach((l, i) => say(0, y + nf * 0.85 + i * nf * 1.3, l, 'stiff.note'));
    y += nl.length * nf * 1.3;
  }
  return { texts, rects, mark, H: Math.ceil(y + f * 0.2) };
}
