// The beat-by-beat card of a slide (2D pressure-time.js drawBeatCard + drawBeatStill; Mohammad's pick d1b, 29 Oct): a black EKG strip and the wedged and free hepatic pressures on one sheet of EKG paper
// (the paper's squares one mmHg high and as wide), the HVPG the shaded gap between them in its status colour, the portal pressure over the wedged in its own colour, a caliper at "now" across the gap,
// the readings in a column beside (or one line on top of a narrow card), and where the patient stood before the slide's event as two dotted lines with the old gap faint grey behind, named once.
// The layout's numbers are the 2D app's own (copied/beat-card.copied.js); the drawing is the chart GL's frame. Pure: the pane hands it the record, the readings and the box.
import type { Frame, Shape } from '../../charts/scene.ts';
import { withAlpha, type Rgba } from '../../charts/colour.ts';
import type { Palette } from '../../charts/palette.ts';
import { measure } from '../../charts/measure.ts';
import { fmt } from '../../charts/fmt.ts';
import { leadIISeries } from '../copied/ekg.copied.js';
import { tenthGap } from '../../../engine/hales/core/gap.js';
import { HVPG_CUTS, HVPG_WORDS } from '../../../engine/hales/portal/pressure-cuts.js';
import { seriesOf, hvpgWordOf, sevTok, type Record_, type Series } from '../trace/model.ts';
import { beatTop, beatLayout, colPlan, paperFine, beforeLabelY, sinceText } from './copied/beat-card.copied.js';

const NOT_SHOWN = '—';
/** the seconds the card shows (2D BEAT_CARD_S: 10 s was too much) */
export const BEAT_CARD_S = 5;
/** the heart rate at which its number takes the alarm colour (2D HR_CUT: the vitals' own cut-off) */
export const HR_CUT = 110;
const Z = (t: string): string => t.replace(/[0-9]/g, '0');

/** What the card shows of a state: the two pressures, the portal vein's, the heart rate and the HVPG (a slide's pinned fingerprint, else the live metrics). */
export interface BeatReadings { whvp: number; fhvp: number; pv: number; hr: number; hvpg: number }
export interface BeatIn {
  rec: Record_;
  /** model seconds at the right edge */
  head: number;
  now: BeatReadings;
  /** where the patient stood before the slide's event (the slide's delta), its readings, and the name the old gap wears (default "before") */
  before: { r: Partial<BeatReadings>; label: string } | null;
  /** the EKG strip on (the slide's `ekg: false` leaves it off) */
  ekg: boolean;
  /** the portal vein's trace is left out (the case leaves it unmeasured) */
  noPv: boolean;
}
export interface BeatBox { w: number; h: number; pal: Palette }

const finite = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
/** The beat card's readings from a fingerprint or the live metrics (the `PIN` table of 2D: pv, whvp, fhvp, hr). */
export function beatReadings(m: Record<string, unknown> | null | undefined): BeatReadings {
  const g = (k: string): number => (finite(m?.[k]) ? (m![k] as number) : NaN);
  const whvp = g('whvp'), fhvp = g('fhvp');
  return { whvp, fhvp, pv: g('pv'), hr: g('hr'), hvpg: finite(whvp) && finite(fhvp) ? (tenthGap(whvp, fhvp, g('hvpg')) as number) : g('hvpg') };
}

/** One frame of the card in a w × h box. */
export function beatFrame(inp: BeatIn, box: BeatBox): { frame: Frame; hvpg: number } {
  const { w, h, pal } = box;
  const shapes: Shape[] = [];
  const text = pal.tok('text'), muted = pal.tok('text-2'), faint = pal.tok('text-3'), panel = pal.tok('surface-2'), danger = pal.tok('danger'), ok = pal.tok('ok');
  const ink = (s: string): Rgba => (pal.has(`${s}-ink`) ? pal.tok(`${s}-ink`) : pal.tok(s));
  const wc = pal.tok('tr-wedge'), fc = pal.tok('tr-hv'), pc = pal.tok('tr-pv');
  const { rec, head, now, noPv } = inp;
  const lay = beatLayout(w, h, inp.ekg) as { wide: boolean; colX: number | null; L: number; R: number; head: number; ekg: { top: number; bot: number } | null; top: number; bot: number };
  const { L, R, top, bot } = lay, plotW = R - L;
  const x1 = head, x0 = head - BEAT_CARD_S;
  const X = (t: number) => L + ((t - x0) / (x1 - x0)) * plotW;
  const px = Math.round(plotW);
  const sw = seriesOf(rec, 'whvp', 'beats', x0, x1, false, px), sf = seriesOf(rec, 'RHV', 'beats', x0, x1, false, px), sp = seriesOf(rec, 'CONF', 'beats', x0, x1, false, px);
  const wNow = now.whvp, fNow = now.fhvp, pvNow = now.pv, hv = now.hvpg;
  const hr = finite(now.hr) ? now.hr : NaN;
  const was = inp.before?.r;
  const wWas = was?.whvp, fWas = was?.fhvp;
  const showWas = finite(wWas) && finite(fWas) && (Math.abs(wWas - wNow) >= 0.3 || Math.abs(fWas - fNow) >= 0.3);
  // the scale's top: a multiple of 5 over every value shown (now and before)
  let mx = -Infinity;
  for (const s of noPv ? [sw] : [sw, sp]) for (let i = 0; i < s.mid.length; i++) if (s.mid[i]! > mx) mx = s.mid[i]!;
  const hi = beatTop([mx, wNow, noPv ? NaN : pvNow, showWas ? wWas : NaN]) as number;
  const sq = (bot - top) / hi;
  const YB = (v: number) => bot - v * sq;
  const T = (x: number, y: number, s: string, size: number, weight: number, color: Rgba, o: Partial<Extract<Shape, { k: 'text' }>> = {}) => shapes.push({ k: 'text', x, y, s, size: size * 13 / 12, weight, color, baseline: 'middle', ...o });
  const sevC = pal.tok(sevTok(hv)), sevI = ink(sevTok(hv)), hrC = hr >= HR_CUT ? ink('danger') : text;
  shapes.push({ k: 'rect', x: 0, y: 0, w, h, r: Math.min(10, h / 4), fill: panel, key: 'panel' });

  // the scale's numbers (the still picture's, left of the plot), its unit over the paper
  const gate = top - 10 > (lay.ekg ? lay.ekg.bot : 0);
  for (let i = 0, n = Math.floor(hi / 5) + 1; i < n; i++) { const y = YB(i * 5); if (gate && y < top + 9) continue; T(L - 6, y, String(i * 5), 12, 500, faint, { anchor: 'end', key: `yl-${i}` }); }

  // the readings: the column beside the plot, or the line on top of a narrow card
  const keyRows = [{ c: pc, name: 'Portal vein', v: pvNow, label: 'PV' }, { c: wc, name: 'Wedged', v: wNow, label: 'WHVP' }, { c: fc, name: 'Free', v: fNow, label: 'FHVP' }].slice(noPv ? 1 : 0);
  const hrT = finite(hr) ? fmt(hr, 0) : NOT_SHOWN, hvT = finite(hv) ? fmt(hv, 1) : NOT_SHOWN;
  const hvWas = showWas ? (tenthGap(wWas!, fWas!, was?.hvpg ?? NaN) as number) : was?.hvpg;
  const word = finite(hv) ? hvpgWordOf(Math.max(0, hv)) : '';
  const hair = withAlpha(text, 0.12);
  if (lay.wide && lay.colX != null) {
    const x = lay.colX, hrSince = sinceText(hr, was?.hr ?? NaN, 0) as string, hvSince = sinceText(hv, hvWas ?? NaN, 1) as string;
    const plan = colPlan(h, !!(hrSince || hvSince)) as { k: number; deltas: boolean; rows: boolean }, k = plan.k, cw = w - x - 14;
    let ruleN = 0;
    const rule = (yy: number) => shapes.push({ k: 'line', x1: x, y1: Math.round(yy) + 0.5, x2: x + cw, y2: Math.round(yy) + 0.5, pen: { color: hair, w: 1 }, key: `rule-${ruleN++}` });
    const big = (xx: number, yy: number, v: string, unit: string, size: number, color: Rgba) => {
      T(xx, yy, v, size, 650, color, { baseline: 'alphabetic', key: `big-${unit}` });
      T(xx + measure(Z(v), size * 13 / 12, 650) + 6, yy, unit, 12, 500, faint, { baseline: 'alphabetic', key: `unit-${unit}` });
    };
    const since = (xx: number, yy: number, t: string, key: string) => { if (t) T(xx, yy, t, 12, 600, t.startsWith('▲') ? danger : ok, { baseline: 'alphabetic', key }); };
    let y = 26;
    T(x, y, 'HEART RATE', 12, 600, muted, { baseline: 'alphabetic', key: 'hr-k' });
    y += 32 * k; big(x, y, hrT, '/min', Math.max(20, 28 * k), hrC);
    if (plan.deltas) { y += 20 * k; since(x, y, hrSince, 'hr-since'); }
    y += 14 * k; rule(y);
    y += 24 * k; T(x, y, 'HVPG', 12, 600, muted, { baseline: 'alphabetic', key: 'hv-k' });
    y += 36 * k; big(x, y, hvT, 'mmHg', Math.max(22, 32 * k), text);
    y += 24 * k; T(x, y, word, 14, 600, sevI, { baseline: 'alphabetic', key: 'hv-word' });
    if (plan.deltas) { y += 20 * k; since(x, y, hvSince, 'hv-since'); }
    if (plan.rows) {
      y += 14 * k; rule(y);
      for (const r of keyRows) {
        y += 24 * k;
        shapes.push({ k: 'rect', x, y: y - 4, w: 9, h: 3, fill: r.c, key: `sw-${r.label}` });
        T(x + 15, y - 2.5, r.name, 12, 500, muted, { key: `nm-${r.label}` });
        T(x + cw, y - 2.5, finite(r.v) ? fmt(r.v, 1) : NOT_SHOWN, 12.5, 650, text, { anchor: 'end', key: `v-${r.label}` });
      }
    }
  } else {
    // (a narrow card: the line of readings on top, the heart rate and the HVPG)
    T(L, 18, `HVPG ${hvT}`, 14, 650, sevI, { key: 'top-hv' });
    T(w - 12, 18, `${hrT} /min`, 14, 650, hrC, { anchor: 'end', key: 'top-hr' });
  }

  // the paper, from the plot's bottom left corner up through the strip: a heavy line every 5 squares; its upright lines laid on time, so the paper scrolls left with the traces
  const paperTop = lay.ekg ? lay.ekg.top : top;
  shapes.push({ k: 'clip', x: L, y: paperTop - 2, w: plotW, h: bot - paperTop + 2 });
  const pxS = plotW / (x1 - x0), X0 = L - x0 * pxS, i0 = Math.floor((L - X0) / sq);
  for (let pass = 0; pass < 2; pass++) {
    const heavy = pass === 1;
    if (!heavy && !paperFine(sq)) continue;
    const pen = { color: withAlpha(danger, heavy ? 0.26 : 0.11), w: 1 };
    for (let i = i0; X0 + i * sq <= R + 0.5; i++) { if ((((i % 5) + 5) % 5 === 0) !== heavy) continue; const x = Math.round(X0 + i * sq) + 0.5; if (x < L) continue; shapes.push({ k: 'line', x1: x, y1: paperTop - 2, x2: x, y2: bot, pen, key: `pv-${heavy ? 'h' : 'f'}-${i}` }); }
    for (let j = 0; bot - j * sq >= paperTop - 2; j++) { if ((j % 5 === 0) !== heavy) continue; const y = Math.round(bot - j * sq) + 0.5; shapes.push({ k: 'line', x1: L, y1: y, x2: R, y2: y, pen, key: `ph-${heavy ? 'h' : 'f'}-${j}` }); }
  }
  shapes.push({ k: 'unclip' });
  if (gate) T(8, top - 10, 'mmHg', 12, 500, faint, { baseline: 'alphabetic', key: 'unit' });

  // the EKG strip, in the text colour, over the model's own beats: lead II with its waves in seconds, a narrow QRS, a rounded P and T; it ends at "now", with the pressures
  if (lay.ekg && rec.t.length > 1) {
    const { top: et, bot: eb } = lay.ekg;
    const Ye = (v: number) => eb - 3 - ((v + 0.3) / 1.3) * (eb - et - 6);
    const e = leadIISeries(rec.beats as number[], Math.max(x0, rec.t[0]!), Math.min(x1, rec.t[rec.t.length - 1]!), 60 / (hr > 20 ? hr : 70)) as { x: number[]; v: number[] };
    if (e.x.length > 1) {
      const p: number[] = [];
      for (let i = 0; i < e.x.length; i++) p.push(X(e.x[i]!), Ye(e.v[i]!));
      shapes.push({ k: 'clip', x: L, y: et - 2, w: plotW, h: eb - et + 4 });
      shapes.push({ k: 'path', pts: p, pen: { color: text, w: 1.6, join: 'round', cap: 'round' }, key: 'ekg-line' });
      shapes.push({ k: 'unclip' });
    }
  }

  const line = (s: Series, color: Rgba, key: string) => {
    if (s.x.length < 2) return;
    const p: number[] = [];
    let seg: number[] = [], n = 0;
    for (let i = 0; i < s.x.length; i++) { const v = s.mid[i]!; if (Number.isNaN(v)) { if (seg.length > 2) shapes.push({ k: 'path', pts: seg, pen: { color, w: 2, join: 'round', cap: 'round' }, key: `${key}-${n++}` }); seg = []; continue; } seg.push(X(s.x[i]!), YB(v)); }
    void p;
    if (seg.length > 2) shapes.push({ k: 'path', pts: seg, pen: { color, w: 2, join: 'round', cap: 'round' }, key: `${key}-${n}` });
  };
  shapes.push({ k: 'clip', x: L, y: top - 6, w: plotW, h: bot - top + 8 });
  // before: the old gap faint grey, its edges dotted in the lines' own colours
  if (showWas) {
    shapes.push({ k: 'rect', x: L, y: YB(wWas!), w: plotW, h: YB(fWas!) - YB(wWas!), fill: withAlpha(faint, 0.08), key: 'was-gap' });
    for (const [v, c, key] of [[wWas!, wc, 'was-w'], [fWas!, fc, 'was-f']] as const) shapes.push({ k: 'line', x1: L + 1, y1: YB(v), x2: R, y2: YB(v), pen: { color: withAlpha(c, 0.7), w: 1.4, dash: [0.1, 4.5], cap: 'round' }, key });
  }
  // the HVPG, shaded between wedged and free in the colour of its status
  if (sw.x.length > 1 && sw.x.length === sf.x.length) {
    const t: number[] = [], b: number[] = [];
    for (let i = 0; i < sw.x.length; i++) { if (Number.isNaN(sw.mid[i]!) || Number.isNaN(sf.mid[i]!)) continue; t.push(X(sw.x[i]!), YB(sw.mid[i]!)); b.push(X(sf.x[i]!), YB(sf.mid[i]!)); }
    if (t.length > 2) shapes.push({ k: 'band', top: t, bottom: b, fill: withAlpha(sevC, 0.12), key: 'hvpg-gap' });
  }
  if (!noPv) line(sp, pc, 'pv');
  line(sw, wc, 'wedge');
  line(sf, fc, 'free');
  shapes.push({ k: 'unclip' });

  // the old gap named once, on a plate, where no line passes under the words
  let wasBox: number[] | null = null;
  if (showWas && inp.before?.label) {
    const lab = inp.before.label, tw = measure(lab, 12 * 13 / 12, 500), lx = L + 6, rx = lx + tw + 12;
    const spans: number[][] = [];
    for (const s of noPv ? [sw, sf] : [sw, sf, sp]) {
      let a = Infinity, b = -Infinity;
      for (let i = 0; i < s.x.length; i++) { const xx = X(s.x[i]!); if (xx < lx - 2 || xx > rx + 2) continue; const y = YB(s.mid[i]!); if (y < a) a = y; if (y > b) b = y; }
      if (a <= b) spans.push([a - 2, b + 2]);
    }
    const ly = beforeLabelY(YB(wWas!), YB(fWas!), spans, top, bot) as number | null;
    if (ly != null) {
      wasBox = [lx, ly, lx + tw + 12, ly + 18];
      T(lx + 6, ly + 9.5, lab, 12, 500, faint, { key: 'was-label', halo: { color: panel, w: 4 } });   // (the panel's colour round the letters, no box)
    }
  }

  // the caliper at "now", from the wedged to the free pressure
  if (finite(wNow) && finite(fNow)) {
    const cx = Math.round(R + 12) + 0.5, ya = YB(wNow), yb = YB(fNow), pen = { color: text, w: 1.4 };
    shapes.push({ k: 'line', x1: cx - 5, y1: ya, x2: cx + 5, y2: ya, pen, key: 'cal-a' }, { k: 'line', x1: cx, y1: ya, x2: cx, y2: yb, pen, key: 'cal-m' }, { k: 'line', x1: cx - 5, y1: yb, x2: cx + 5, y2: yb, pen, key: 'cal-b' });
  }
  // the HVPG named in its gap, beside the caliper's end, so the chart reads without the column; left out where the gap is too low
  if (finite(hv) && finite(wNow) && finite(fNow)) {
    const label = `HVPG ${fmt(hv, 1)}`, ym = (YB(wNow) + YB(fNow)) / 2, lw = measure(label, 13 * 13 / 12, 700) + 12, lx = R - 8 - lw;
    const clear = !wasBox || wasBox[2]! + 6 < lx || wasBox[3]! + 4 < ym - 10 || wasBox[1]! - 4 > ym + 10;
    if (YB(fNow) - YB(wNow) >= 26 && R - L >= lw + 40 && clear) {
      T(lx + 6, ym + 0.5, label, 13, 700, sevI, { key: 'gap-label', halo: { color: panel, w: 4 } });
    }
  }

  // time: every 2 s back from now
  for (let s = 2; head - s > x0 + 1e-9; s += 2) { const xx = X(head - s); if (xx < L + 12) break; T(xx, h - 8, `−${s} s`, 12, 500, faint, { anchor: 'middle', key: `ax-${s}` }); }
  const nowX = X(head);
  T(Math.min(nowX, R), h - 8, 'now', 12, 500, muted, { anchor: nowX > R - 14 ? 'end' : 'middle', key: 'now' });

  if (!lay.wide) {
    // a narrow card: each line's value at its end
    const es = keyRows.filter((r) => finite(r.v)).map((r) => ({ ...r, y: YB(r.v) })).sort((a, b) => a.y - b.y);
    for (let i = 1; i < es.length; i++) es[i]!.y = Math.max(es[i]!.y, es[i - 1]!.y + 16);
    const over = es.length ? es[es.length - 1]!.y - bot : 0;
    if (over > 0) for (const e of es) e.y -= over;
    let colW = 0;
    for (const e of es) colW = Math.max(colW, measure(Z(fmt(e.v, 1)), 12.5 * 13 / 12, 650));
    for (const e of es) {
      shapes.push({ k: 'rect', x: R + 22, y: e.y - 1.5, w: 9, h: 3, fill: e.c, key: `es-${e.label}` });
      T(R + 35 + colW, e.y, fmt(e.v, 1), 12.5, 650, text, { anchor: 'end', key: `ev-${e.label}` });
      T(R + 39 + colW, e.y, e.label, 12, 600, e.c, { key: `en-${e.label}` });
    }
  }
  void HVPG_CUTS; void HVPG_WORDS;
  const label = `Pressure beat by beat. HVPG ${hvT} mmHg, ${word}. Wedged ${finite(wNow) ? fmt(wNow, 1) : NOT_SHOWN}, free ${finite(fNow) ? fmt(fNow, 1) : NOT_SHOWN}${noPv ? '' : `, portal vein ${finite(pvNow) ? fmt(pvNow, 0) : NOT_SHOWN}`} mmHg. Heart rate ${hrT} a minute.`;
  return { frame: { w, h, shapes, label }, hvpg: hv };
}
