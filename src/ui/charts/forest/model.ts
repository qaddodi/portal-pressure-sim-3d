// The forest plot of the landmark trials and one trial's arms as bars (2D: trial-forest.js, host 'forest'). Pure: the same trials at the same width and type
// size always give the same drawing. Words and rules are the 2D file's; every word is set at 12 px or more.
import { lcFirst } from '../../../engine/hales/portal/lc-first.js';
import { trialOf, wrapWords, type Trial } from '../trial/model.ts';
import type { Measure } from '../flows/layout.ts';

export { trialOf };
export const KINDS = ['HR', 'OR', 'RR'] as const;
export type Kind = (typeof KINDS)[number];
export const KIND_NAME: Record<Kind, string> = { HR: 'Hazard ratio (HR)', OR: 'Odds ratio (OR)', RR: 'Relative risk (RR)' };
export const NO_RATIO = 'No ratio with a confidence interval reported';
export const FAVORS = ['Favors treatment', 'Favors control'] as const;
const TICKS = [0.01, 0.02, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 20, 50];
const SM = 0.92;
export const FLOOR = 12;
export const FOREST_SCALE: readonly [number, number] = [0.1, 2];
export const NOT_POOLED = 'Not pooled: different endpoints';

export interface Ratio { kind: Kind; est: number; lo: number; hi: number; of: string; vs?: string }
const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;
/** A ratio as the card prints it: two decimals, or three where the paper gave three (a reported bound is never rounded). */
export const fmtRatio = (v: number) => v.toFixed(Math.max(2, Math.min(3, (String(v).split('.')[1] || '').length)));
export const ratioText = (r: Ratio) => `${r.kind} ${fmtRatio(r.est)} (${fmtRatio(r.lo)}–${fmtRatio(r.hi)})`;
const tickText = (v: number) => String(v);

/** A trial's ratios that can be drawn: of a known kind, a positive estimate inside a positive interval. */
export function ratiosOf(t: Trial | null | undefined): Ratio[] {
  const list = Array.isArray(t?.ratios) ? (t!.ratios as Ratio[]) : [];
  return list.filter((r) => r && (KINDS as readonly string[]).includes(r.kind) && fin(r.est) && fin(r.lo) && fin(r.hi) && r.lo <= r.est && r.est <= r.hi);
}
const armOf = (t: Trial | null | undefined, side: string) => (t?.arms || []).find((a) => a.side === side) || null;
export function ratesText(t: Trial | null | undefined): string {
  const arms = t?.arms || [], tr = armOf(t, 'treat') || arms[0];
  if (!tr) return '';
  const rest = arms.filter((a) => a !== tr).map((a) => `${a.rate}%`);
  return rest.length ? `${tr.rate}% vs ${rest.join(' / ')}` : `${tr.rate}%`;
}

export interface FText { x: number; y: number; t: string; look: string; anchor: 'start' | 'middle' | 'end' }
export interface FRect { x: number; y: number; w: number; h: number; r: number; look: string; tone?: string }
export interface FLine { x1: number; y1: number; x2: number; y2: number; look: string }
export interface FHit { id: string; y: number; h: number }
export interface ForestLayout { texts: FText[]; rects: FRect[]; lines: FLine[]; hits: FHit[]; H: number }
export interface ForestOpts { highlight?: Set<string> | readonly string[] | null; selected?: string | null; notes?: Record<string, string> | null; why?: Record<string, string> | null; scale?: readonly [number, number]; all?: boolean }

/** The type table: look → [weight, size in em of the card's size]. A size under 12 px is raised to 12 (sizeOf). */
export const TYPE: Record<string, readonly [number, number]> = {
  'forest.grp': [600, 0.92], 'forest.nm': [600, 1], 'forest.nm.dim': [500, 1], 'forest.of': [500, 0.92], 'forest.val': [500, 0.92], 'forest.val.dim': [500, 0.92],
  'forest.tick': [500, 0.92], 'forest.ends': [500, 0.92], 'forest.why': [600, 0.92], 'forest.dt': [600, 1], 'forest.dx': [500, 0.92], 'forest.k': [500, 0.92],
  'forest.arm': [600, 1], 'forest.armn': [500, 1], 'forest.pct': [700, 1],
};
export const sizeOf = (look: string, f: number) => Math.max(FLOOR, TYPE[look]![1] * f);

/** The plot of these trials at width W and card type size f (the plot's own words never under 12 px). */
export function forestLayout(trials: readonly (Trial | null)[], W: number, f: number, meas: Measure, opts: ForestOpts = {}): ForestLayout {
  const { highlight = null, selected = null, notes = null, why = null } = opts;
  const texts: FText[] = [], rects: FRect[] = [], lines: FLine[] = [], hits: FHit[] = [];
  const say = (x: number, y: number, t: string, look: string, anchor: FText['anchor'] = 'start') => { if (t) texts.push({ x, y, t, look, anchor }); };
  const fs = Math.max(FLOOR, f * SM), ip = Math.round(f * 0.5), lh = f * 1.35;
  const hl = highlight == null ? null : highlight instanceof Set ? highlight : new Set(highlight);
  const lit = (t: Trial) => !hl || hl.has(t.id);
  const list = (trials || []).filter((t): t is Trial => !!t);
  const order = (a: { t: Trial; i: number }, b: { t: Trial; i: number }) => (+lit(b.t) - +lit(a.t)) || (a.i - b.i);
  const rows: { t: Trial; r: Ratio; i: number; kind: Kind }[] = [];
  list.forEach((t, i) => { for (const r of opts.all ? ratiosOf(t) : ratiosOf(t).slice(0, 1)) rows.push({ t, r, i, kind: r.kind }); });
  const [a, b] = opts.scale ?? FOREST_SCALE;
  const tk = TICKS.filter((v) => v >= a - 1e-9 && v <= b + 1e-9);
  const padL = meas(tickText(tk[0] ?? a), fs, 500) / 2 + 1, padR = meas(tickText(tk[tk.length - 1] ?? b), fs, 500) / 2 + 1;
  const x0 = ip + padL, x1 = Math.max(x0 + 40, W - ip - padR), la = Math.log(a), span = Math.log(b) - la;
  const X = (v: number) => x0 + ((Math.log(Math.min(b, Math.max(a, v))) - la) / span) * (x1 - x0);
  let y = 0;
  for (const kind of KINDS) {
    const group = rows.filter((q) => q.kind === kind).sort(order);
    if (!group.length) continue;
    say(ip, y + fs, KIND_NAME[kind], 'forest.grp');
    y += lh + f * 0.2;
    const shownWhy = new Set<string>();
    for (const { t, r } of group) {
      const line = t.id === selected && !shownWhy.has(t.id) ? why?.[t.id] : null;
      if (line) shownWhy.add(t.id);
      const on = lit(t), name = t.short ?? t.name, val = ratioText(r);
      const nm = on ? 'forest.nm' : 'forest.nm.dim';
      const nw = meas(name, sizeOf(nm, f), TYPE[nm]![0]), vw = meas(val, fs, 500);
      const ofText = r.vs || r.of || '', ofRoom = W - 2 * ip - nw - vw - f * 1.2;
      const ofLines = ofText && meas(ofText, fs, 500) > ofRoom ? wrapWords(ofText, W - 2 * ip, fs, 500, meas, Infinity) : null;
      const rowH = Math.round(lh + f * 1.25) + (ofLines ? Math.round(ofLines.length * fs * 1.3 + f * 0.4) : 0) + (line ? Math.round(f * 0.95) : 0);
      if (t.id === selected) rects.push({ x: 0, y, w: W, h: rowH, r: Math.round(f * 0.6), look: 'forest.sel' });
      say(ip, y + f, name, nm);
      say(W - ip, y + f, val, on ? 'forest.val' : 'forest.val.dim', 'end');
      if (!ofLines) say(ip + nw + f * 0.45, y + f, ofText, 'forest.of');
      else ofLines.forEach((ln, k) => say(ip, y + lh + f * 1.3 + fs * 1.1 + k * fs * 1.3, ln, 'forest.of'));
      const ty = Math.round(y + lh + f * 0.55), s = Math.round(f * 0.7);
      const ci = on ? 'forest.ci' : 'forest.ci.dim';
      lines.push({ x1: X(r.lo), y1: ty, x2: X(r.hi), y2: ty, look: ci });
      rects.push({ x: X(r.est) - s / 2, y: ty - s / 2, w: s, h: s, r: 1.5, look: on ? 'forest.mk' : 'forest.mk.dim' });
      // an interval past either end of the scale ends in an arrowhead at that end, not a cut line
      const ah = f * 0.45;
      if (r.hi > b + 1e-9) { const x = X(b); lines.push({ x1: x - ah, y1: ty - ah * 0.8, x2: x, y2: ty, look: ci }, { x1: x - ah, y1: ty + ah * 0.8, x2: x, y2: ty, look: ci }); }
      if (r.lo < a - 1e-9) { const x = X(a); lines.push({ x1: x + ah, y1: ty - ah * 0.8, x2: x, y2: ty, look: ci }, { x1: x + ah, y1: ty + ah * 0.8, x2: x, y2: ty, look: ci }); }
      lines.push({ x1: X(1), y1: ty - s, x2: X(1), y2: ty + s, look: 'forest.ref' });
      if (line) say(ip, y + lh + f * 0.9 + fs * 1.1 + (ofLines ? Math.round(ofLines.length * fs * 1.3 + f * 0.4) : 0), line, 'forest.why');
      hits.push({ id: t.id, y, h: rowH });
      y += rowH;
    }
    say(ip, y + fs * 0.9, NOT_POOLED, 'forest.k');
    y += fs * 0.9 + f * 0.7;
  }
  if (rows.length) {
    lines.push({ x1: x0, y1: y, x2: x1, y2: y, look: 'forest.axis' });
    for (const v of tk) { lines.push({ x1: X(v), y1: y, x2: X(v), y2: y + f * 0.35, look: 'forest.axis' }); say(X(v), y + f * 0.4 + fs, tickText(v), 'forest.tick', 'middle'); }
    y += f * 0.4 + fs + f * 0.45;
    const one = X(1), lw = meas(FAVORS[0], fs, 500), rw = meas(FAVORS[1], fs, 500), gap = f * 0.5;
    const right = one + gap + rw <= W - ip, left = right && one - gap - lw >= ip;
    const stacked = !left && lw + rw + gap > W - 2 * ip;
    say(left ? one - gap : ip, y + fs, FAVORS[0], 'forest.ends', left ? 'end' : 'start');
    say(right ? one + gap : W - ip, y + fs + (stacked ? lh : 0), FAVORS[1], 'forest.ends', right ? 'start' : 'end');
    y += stacked ? 2 * lh : lh;
  }
  const sel = list.find((t) => t.id === selected);
  if (sel) {
    y += f * 0.5;
    lines.push({ x1: 0, y1: y, x2: W, y2: y, look: 'forest.rule' });
    y += f * 0.45;
    const rt = ratesText(sel);
    for (const dl of wrapWords(`${sel.short ?? sel.name}${rt ? `: ${rt}` : ''}`, W - 2 * ip, sizeOf('forest.dt', f), 600, meas, Infinity)) { say(ip, y + f, dl, 'forest.dt'); y += lh; }
    const fu = sel.followUp ? `, ${lcFirst(sel.followUp)}` : '';
    const note = notes?.[sel.id];
    for (const s of wrapWords(`${sel.endpoint || ''}${fu}.${note ? ` ${note}` : ''}`, W - 2 * ip, fs, 500, meas, Infinity)) { say(ip, y + fs, s, 'forest.dx'); y += fs * 1.4; }
  }
  const bare = list.map((t, i) => ({ t, i })).filter((q) => !ratiosOf(q.t).length).sort((p, q) => (+lit(q.t) - +lit(p.t)) || (p.i - q.i));
  if (bare.length) {
    y += f * 0.6;
    lines.push({ x1: 0, y1: y, x2: W, y2: y, look: 'forest.rule' });
    y += f * 0.4;
    say(ip, y + fs, NO_RATIO, 'forest.k');
    y += lh;
    for (const { t } of bare) {
      const on = lit(t), rt = ratesText(t), rw = meas(rt, fs, 500), nm = on ? 'forest.nm' : 'forest.nm.dim', name = t.short ?? t.name, nw = meas(name, sizeOf(nm, f), TYPE[nm]![0]);
      const bareRoom = W - 2 * ip - nw - rw - f * 1.2, bareLines = t.endpoint && meas(t.endpoint, fs, 500) > bareRoom ? wrapWords(t.endpoint, W - 2 * ip, fs, 500, meas, Infinity) : null;
      const rowH = Math.round(lh + f * 0.3) + (bareLines ? Math.round(bareLines.length * fs * 1.3) : 0);
      if (t.id === selected) rects.push({ x: 0, y, w: W, h: rowH, r: Math.round(f * 0.6), look: 'forest.sel' });
      say(ip, y + f * 1.05, name, nm);
      if (!bareLines) say(ip + nw + f * 0.45, y + f * 1.05, t.endpoint || '', 'forest.of');
      else bareLines.forEach((ln, k) => say(ip, y + f * 1.05 + fs * 1.3 * (k + 1), ln, 'forest.of'));
      say(W - ip, y + f * 1.05, rt, on ? 'forest.val' : 'forest.val.dim', 'end');
      hits.push({ id: t.id, y, h: rowH });
      y += rowH;
    }
  }
  return { texts, rects, lines, hits, H: Math.ceil(y + f * 0.3) };
}

/** A trial's arms as bars on a 0 to 100% track (the Trials tab's open trial): the treated arm in the series colour, the others muted. */
export function armsLayout(t: Trial | null, W: number, f: number, meas: Measure): { texts: FText[]; rects: FRect[]; H: number } {
  const texts: FText[] = [], rects: FRect[] = [], bh = Math.round(f * 1.7), pad = f * 0.5, gap = f * 0.6;
  let y = 0;
  for (const a of t?.arms || []) {
    texts.push({ x: 0, y: y + f, t: a.label, look: 'forest.arm', anchor: 'start' });
    if (a.n) texts.push({ x: W, y: y + f, t: `n = ${a.n}`, look: 'forest.armn', anchor: 'end' });
    const by = y + f * 1.45, bw = Math.max(2, (W * Math.max(0, Math.min(100, a.rate))) / 100), pct = `${a.rate}%`, pw = meas(pct, f, 700);
    rects.push({ x: 0, y: by, w: W, h: bh, r: bh / 2, look: 'forest.track' });
    rects.push({ x: 0, y: by, w: bw, h: bh, r: bh / 2, look: 'forest.bar', tone: a.side === 'treat' ? 's1' : 'text-3' });
    const inside = bw >= pw + 2 * pad + bh / 2;
    texts.push({ x: inside ? bw - pad - bh / 4 : bw + pad, y: by + bh / 2 + f * 0.36, t: pct, look: 'forest.pct', anchor: inside ? 'end' : 'start' });
    y = by + bh + gap;
  }
  return { texts, rects, H: Math.ceil(Math.max(0, y - gap) + f * 0.3) };
}

/** What the plot says, for a screen reader. */
export function forestWords(trials: readonly (Trial | null)[]): string {
  const parts: string[] = [];
  for (const t of trials || []) {
    if (!t) continue;
    const rs = ratiosOf(t);
    parts.push(rs.length ? `${t.short ?? t.name}: ${rs.map(ratioText).join(', ')}` : `${t.short ?? t.name}: ${ratesText(t)}, ${NO_RATIO.toLowerCase()}`);
  }
  return parts.join('. ');
}
