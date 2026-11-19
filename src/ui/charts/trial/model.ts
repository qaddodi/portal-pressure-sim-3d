// The trial card as data (ported from the 2D app's tool-trial.js): one landmark trial, laid out at a width and a base type size. Pure: the same trial,
// width, size and fit always give the same drawing. The trial records and the fit rules are copied from the 2D app by scripts/copy-chart-tokens.mjs.
import { TRIALS, type Trial, type TrialArm } from './trials.generated.ts';
import { fitsWords, groupOf, lcFirst, possiblyWords } from './trial-fit.generated.js';
import type { Measure } from '../flows/layout.ts';

export { fitTrial, metricsOfFp } from './trial-fit.generated.js';
export type { Trial };

export const trialOf = (id: unknown): Trial | null => (typeof id === 'string' && Object.hasOwn(TRIALS, id) ? TRIALS[id]! : null);
export const trialSource = (t: Trial) => `${t.journal} ${t.year} · ${t.firstAuthor}`;
export const UNCHECKED = 'Not yet checked against the paper';
export const ALL_LINES = Infinity;

/** What fitTrial answers for a patient. */
export interface Fit { verdict: 'fits' | 'no' | 'unknown'; rows?: { rule?: string; state?: string; value?: unknown }[]; met?: number; of?: number }

/** look → [weight, size in em of the base size] (the 2D chart-looks/trial.js TYPE table: one table the layout measures with, so what is measured is what is drawn). */
export const TYPE: Record<string, readonly [number, number]> = {
  'trial.name': [600, 1.25], 'trial.src': [500, 1], 'trial.v': [500, 1], 'trial.lab': [500, 1], 'trial.pct': [600, 2.5], 'trial.n': [500, 1],
  'trial.eff': [600, 1.08], 'trial.note': [500, 1], 'trial.warn': [600, 1], 'trialfit.t': [500, 1.08],
};
export const TONE: Record<string, string> = { treat: 's1', control: 'text-3' };

/** Words cut into lines no wider than w (greedy); at most `max` lines, the last ending in an ellipsis when words were left (a trial card passes Infinity: it never cuts its words). */
export function wrapWords(text: string, w: number, f: number, wt: number, meas: Measure, max: number): string[] {
  const words = String(text || '').split(/\s+/).filter(Boolean), all: string[] = [];
  const fits = (s: string) => meas(s, f, wt) <= w + 1e-6;
  let cur = '';
  for (const word of words) {
    const next = cur ? `${cur} ${word}` : word;
    if (fits(next) || !cur) cur = next;
    else { all.push(cur); cur = word; }
  }
  if (cur) all.push(cur);
  if (all.length <= max) return all;
  const out = all.slice(0, max);
  let s = `${out[max - 1]}…`;
  while (s.length > 2 && !fits(s)) s = `${s.slice(0, -2)}…`;
  out[max - 1] = s;
  return out;
}

const two = (x: number) => (Number.isFinite(x) ? x.toFixed(Math.max(2, Math.min(3, (String(x).split('.')[1] || '').length))) : '?');
/** The trial's effect as reported: its own words, else its first ratio and interval, else null. */
export function effectOf(t: Trial): string | null {
  if (t.effect) return t.effect;
  const r = (t.ratios ?? [])[0];
  return r && Number.isFinite(r.est) ? `${r.kind} ${two(r.est)}${Number.isFinite(r.lo) && Number.isFinite(r.hi) ? ` (${two(r.lo)}–${two(r.hi)})` : ''}` : null;
}
const TIME = /(\d[\d.]*)\s*(day|week|month|year)/gi;
/** Whether the endpoint already names the follow-up time ("Alive at 6 weeks, 6 weeks" would read it twice). */
export function sameTime(endpoint: string, followUp: string): boolean {
  const f = [...String(followUp).matchAll(TIME)];
  if (f.length !== 1) return false;
  const [, n, u] = f[0]!, e = String(endpoint);
  return new RegExp(`\\b${n!.replace('.', '\\.')}\\b`).test(e) && new RegExp(u!, 'i').test(e);
}
/** What was counted, and for how long: "Decompensation or death, median 37 months". */
export const endpointOf = (t: Trial) => (t.followUp && !sameTime(t.endpoint, t.followUp) ? `${t.endpoint}, ${lcFirst(t.followUp)}` : t.endpoint);

/** The fit line's words for fitTrial's answer, or null when there is none. */
export function fitWords(fit: Fit | null | undefined): string | null {
  if (!fit) return null;
  if (fit.verdict === 'fits') return fitsWords(fit);
  if (fit.verdict === 'no') {
    const r = (fit.rows ?? []).find((x) => x?.state === 'no');
    if (!r?.rule) return 'Does not fit';
    const v = typeof r.value === 'string' || Number.isFinite(r.value as number) ? ` (this patient: ${r.value})` : '';
    return `Does not fit: ${lcFirst(String(r.rule))}${v}`;
  }
  return groupOf(fit) === 'possible' ? possiblyWords(fit) : 'Cannot tell from the model';
}

export interface TText { x: number; y: number; t: string; look: string; anchor: 'start' | 'middle' | 'end' }
export interface TRect { x: number; y: number; w: number; h: number; r: number; look: string; tone?: string }
export interface TPath { pts: number[]; look: string }
export interface TrialLayout { texts: TText[]; rects: TRect[]; paths: TPath[]; H: number }
export interface TrialOpts { head?: boolean; zero?: boolean; compact?: boolean }

/** The card's drawing for trial t at width W and base type size f. head false: no name or source line (the Tests card's open trial). zero: every bar at no width (the
 *  drawing a grow starts from). compact: the phone's card, the two large numbers carry the arms without their bars or their people. */
export function trialLayout(t: Trial, W: number, f: number, meas: Measure, fit: Fit | null = null, { head = true, zero = false, compact = false }: TrialOpts = {}): TrialLayout {
  const texts: TText[] = [], rects: TRect[] = [], paths: TPath[] = [];
  const px = (look: string) => TYPE[look]![1] * f, wt = (look: string) => TYPE[look]![0], lh = (look: string) => px(look) * 1.32;
  const mt = (s: string, look: string) => meas(s, px(look), wt(look));
  const say = (x: number, y: number, s: string, look: string, anchor: TText['anchor'] = 'start') => texts.push({ x, y, t: s, look, anchor });
  let y = 0;
  const lines = (s: string, look: string, max: number, x = 0, w = W - x) => {
    const L = wrapWords(s, w, px(look), wt(look), meas, max);
    L.forEach((l, i) => say(x, y + px(look) + i * lh(look), l, look));
    y += L.length * lh(look);
    return L;
  };
  if (head) {
    if (!compact) { lines(t.name, 'trial.name', ALL_LINES); y += f * 0.15; }
    lines(`${trialSource(t)} · ${t.n} randomized`, 'trial.src', ALL_LINES);
    y += f * 0.35;
  }
  lines(compact && t.km ? `${endpointOf(t)} (Kaplan–Meier)` : endpointOf(t), 'trial.v', ALL_LINES);
  y += f * 0.9;
  const arms = t.arms, n = arms.length, cg = f * 1.2, cw = (W - cg * (n - 1)) / n, N = px('trial.pct'), L = px('trial.lab');
  const ks = Math.round(L * 0.62), kx = ks + f * 0.45, bh = Math.max(6, Math.round(f * 0.55)), pct = (a: TrialArm) => `${a.rate}%`;
  const bar = (a: TrialArm, by: number) => {
    rects.push({ x: 0, y: by, w: W, h: bh, r: bh / 2, look: 'trial.track' });
    const w = zero ? 0 : (W * a.rate) / 100;
    if (w > 0 || (zero && a.rate > 0)) rects.push({ x: 0, y: by, w, h: bh, r: Math.min(bh, w) / 2, look: 'trial.bar', tone: TONE[a.side] || 'text-3' });
  };
  const people = (a: TrialArm) => !compact && !!a.n;
  // an arm's name as drawn: in full where its column holds it, else the arm's own short name ("LVP"); null: neither fits, the arms stack
  const nameOf = (a: TrialArm) => [a.label, a.short].find((s) => s && mt(s, 'trial.lab') + kx <= cw) ?? null;
  const side = n <= 3 && arms.every((a) => nameOf(a) != null && mt(pct(a), 'trial.pct') <= cw && (!people(a) || mt(`n = ${a.n}`, 'trial.n') <= cw));
  if (side) {
    let foot = y;
    arms.forEach((a, i) => {
      const x = i * (cw + cg), tone = TONE[a.side] || 'text-3';
      rects.push({ x, y: y + L * 0.32, w: ks, h: ks, r: ks * 0.25, look: 'trial.key', tone });
      say(x + kx, y + L, nameOf(a)!, 'trial.lab');
      const nb = y + lh('trial.lab') + f * 0.2 + N * 0.76;
      say(x, nb, pct(a), 'trial.pct');
      let b = nb;
      if (people(a)) { b = nb + f * 0.45 + px('trial.n'); say(x, b, `n = ${a.n}`, 'trial.n'); }
      foot = Math.max(foot, b + f * 0.3);
    });
    y = foot + f * 0.6;
    if (compact) y -= f * 0.4;
    else for (const a of arms) { bar(a, y); y += bh + f * 0.4; }
  } else {
    for (const a of arms) {
      lines(a.label, 'trial.lab', ALL_LINES);
      const nb = y + f * 0.2 + N * 0.76;
      say(0, nb, pct(a), 'trial.pct');
      if (people(a)) say(mt(pct(a), 'trial.pct') + f * 0.6, nb, `n = ${a.n}`, 'trial.n');
      y = nb + f * 0.55;
      if (!compact) { bar(a, y); y += bh; }
      y += f * 0.8;
    }
    y -= f * 0.4;
  }
  if (t.km && !compact) { y += f * 0.1; lines('Rates are Kaplan–Meier estimates', 'trial.src', 1); }
  const eff = effectOf(t);
  if (eff) { y += f * 0.5; lines(eff, 'trial.eff', ALL_LINES); }
  if (t.note) { y += f * 0.3; lines(t.note, 'trial.note', ALL_LINES); }
  if (t.status !== 'checked') { y += f * 0.3; lines(UNCHECKED, 'trial.warn', 1); }
  const fw = fitWords(fit);
  if (fw) {
    y += f * 0.9;
    const d = Math.round(px('trialfit.t') * 1.15), tx = d + f * 0.55, top = y;
    const L0 = lines(fw, 'trialfit.t', ALL_LINES, tx);
    const cy = top + (L0.length > 1 ? lh('trialfit.t') / 2 : (y - top) / 2) + px('trialfit.t') * 0.04, r = d / 2, cx = r;
    rects.push({ x: 0.75, y: cy - r + 0.75, w: d - 1.5, h: d - 1.5, r: r - 0.75, look: 'trialfit.ring' });
    const q = r * 0.36;
    // a cross (does not fit), a tick (fits) or a dash (cannot tell), each one stroke or two
    if (fit!.verdict === 'no') { paths.push({ pts: [cx - q, cy - q, cx + q, cy + q], look: 'trialfit.x' }, { pts: [cx + q, cy - q, cx - q, cy + q], look: 'trialfit.x' }); }
    else paths.push({ pts: fit!.verdict === 'fits' ? [cx - r * 0.34, cy + r * 0.02, cx - r * 0.08, cy + r * 0.28, cx + r * 0.36, cy - r * 0.24] : [cx - q, cy, cx + q, cy], look: 'trialfit.x' });
    y = Math.max(y, cy + r);
  }
  return { texts, rects, paths, H: Math.ceil(y + f * 0.35) };
}

/** The card's spoken summary (and whether the patient fits). */
export function trialWords(t: Trial, fit: Fit | null = null): string {
  const eff = effectOf(t), fw = fitWords(fit);
  return `${t.name}, ${trialSource(t)}. ${t.setting}. ${t.endpoint}: ${t.arms.map((a) => `${a.label} ${a.rate}%`).join(', ')}${t.km ? ' (Kaplan–Meier)' : ''}.${eff ? ` ${eff}.` : ''}${fw ? ` ${fw}.` : ''}${t.status === 'checked' ? '' : ` ${UNCHECKED}.`}`;
}
