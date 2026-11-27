// The timeline chart as a frame (docs/approved/timeline-chart.md): stacked lanes on one day axis, the medicine bars above them, the event lines and their words, a crosshair that reads every lane.
// A pure function of its inputs and the box (layout from the F mocks, `gen3.mjs`): the lines are the chart GPU's, the words its text layer. Coordinates are CSS px in the box.
import type { ChartCtx } from '../charts/Chart.tsx';
import { contrast, type Rgba } from '../charts/colour.ts';
import { measure } from '../charts/measure.ts';
import { pen, type Frame, type Shape } from '../charts/scene.ts';
import type { Palette } from '../charts/palette.ts';
import { HVPG_CUTS } from '../../engine/hales/portal/pressure-cuts.js';
import { VARIX_NONE_MM, VARIX_LARGE_MM } from '../../engine/hales/portal/metrics.js';
import { FLOW_CUTS } from '../../engine/hales/portal/flow-cuts.js';
import { LSM_CUTS } from '../../engine/hales/portal/lsm-cuts.js';
import { SSM_CUTS } from '../../engine/hales/portal/ssm-cuts.js';
import { MAP_BETA_CUT } from '../../engine/hales/portal/kidney-cuts.js';
import { MEASURE_OF, HVPG, HE_CUTS, laneOf, type LaneId, type Measure } from './measures.ts';
import type { MarkLine, MedBar, Tone } from './marks.ts';
import { maxOf, pointsIn, tickStep, valueAt, type Series } from './record.ts';
import { paceOf, scaleWord } from './pace.ts';

export interface BigIn {
  /** the record by measure id, in the record's own units (a pressure in mmHg, ascites in L, the shunt as 0..1) */
  series: Readonly<Record<string, Series | undefined>>;
  /** the HVPG, or null while the model's true HVPG is not shown (Budd-Chiari) */
  hvpg: Series | null;
  /** the measures drawn, by id */
  on: readonly string[];
  lines: readonly MarkLine[];
  meds: readonly MedBar[];
  /** the whole run, and the days the chart shows */
  full: readonly [number, number];
  win: readonly [number, number];
  /** the day the crosshair is on, or null (the lane titles then read the newest day) */
  cursor: number | null;
  /** a phone: the "+N" group opened by a tap (its first event's id), or null */
  open?: string | null;
  /** the box's height, px */
  h: number;
}

/** where things are in the box, for the card's pointer (a day from an x) */
export interface Geo {
  w: number; h: number; L: number; R: number; top: number; bottom: number;
  x0: number; x1: number;
  X(day: number): number; dayAt(x: number): number;
  lanes: readonly { id: LaneId; t: number; h: number }[];
  /** the phone's "+N" ticks (and an opened group's first line): where a tap opens or closes one */
  groups: readonly { key: string; x: number; n: number }[];
}

const WEIGHT: Record<LaneId, number> = { p: 3, hvpg: 1.5, stiff: 1.5, spl: 1.3, plt: 1.3, asc: 1.7, shunt: 1.7, co: 1.4, bp: 1.4, hr: 1.2, vx: 1.3, he: 1.3, habr: 1.2 };
const ORDER: readonly LaneId[] = ['p', 'hvpg', 'stiff', 'spl', 'plt', 'asc', 'shunt', 'co', 'bp', 'hr', 'vx', 'he', 'habr'];
export const ROW_H = 17, MED_H = 24, AXIS_H = 24, GAP = 22;
/** the strip at the top of each lane that holds its title: the lines are drawn below it, so a title never sits on a curve */
export const TITLE_H = 20;

/** a measure's colour, and its ink for words (the palette's `-ink` twin where it has one; the shunt and the origin colours are the figure's own) */
export function colourOf(pal: Palette, tok: string): Rgba {
  if (pal.has(tok)) return pal.tok(tok);
  if (tok === 'shunt') return pal.dark ? [0xf0 / 255, 0x91 / 255, 0x4a / 255, 1] : [0xd9 / 255, 0x73 / 255, 0x1f / 255, 1];
  if (tok === 'lsm') return pal.dark ? [0xe0 / 255, 0x8a / 255, 0x6a / 255, 1] : [0xa8 / 255, 0x55 / 255, 0x3a / 255, 1];   // (the liver's: the FibroScan liver map's warm brown)
  if (tok === 'asc') return pal.dark ? [0xa3 / 255, 0xc0 / 255, 0x60 / 255, 1] : [0x7a / 255, 0x93 / 255, 0x3f / 255, 1];
  if (tok === 'tr-sv') return [0x7d / 255, 0x5c / 255, 0xdb / 255, 1];
  if (tok === 'tr-smv') return [0xe6 / 255, 0x99 / 255, 0x29 / 255, 1];
  return pal.tok('text-2');
}
/** the colour as a word wears it: the palette's `-ink` twin, or the colour drawn toward the text colour just far enough to read on the card (4.5:1) */
export function inkOf(pal: Palette, tok: string): Rgba {
  if (pal.has(`${tok}-ink`)) return pal.tok(`${tok}-ink`);
  const c = colourOf(pal, tok), card = pal.tok('surface');
  for (let k = 100; k >= 0; k -= 8) { const m = k === 100 ? c : pal.mix('srgb', c, k, pal.tok('text'), 100 - k); if (contrast(m, card) >= 4.6) return m; }
  return pal.tok('text');
}
const toneInk = (pal: Palette, t: Tone): Rgba => (t === 'change' ? pal.tok('text') : t === 'ok' ? inkOf(pal, 'ok') : t === 'caution' ? inkOf(pal, 'caution') : t === 'danger' ? inkOf(pal, 'danger') : pal.tok('text-2'));

interface LaneSpec { id: LaneId; ms: readonly Measure[]; max: number; ticks: readonly number[]; tickWords?: (v: number) => string; cuts: readonly { v: number; word: string; below?: boolean; ink: 'text-2' | 'text-3' | 'danger' }[]; fill?: boolean; zone?: boolean }

const niceMax = (m: number, floor: number, step: number): number => Math.max(floor, Math.ceil((m * 1.12) / step) * step);
/** the HVPG lane's ticks: every 5 mmHg, every 10 when the lane is tall (a decompensated patient reads above 20) */
const hvpgTicks = (max: number): number[] => { const st = max > 30 ? 10 : 5; return Array.from({ length: Math.floor(max / st) + 1 }, (_, i) => i * st).filter((t) => t <= max - 2); };
function specOf(id: LaneId, inp: BigIn): LaneSpec | null {
  if (id === 'hvpg') {
    // the gradients' lane: the HVPG with its zones when it is on, the PPG and the EUS-PPG as lines of their own
    const hv = inp.on.includes('hvpg') ? inp.hvpg : null, gs = laneOf('hvpg').filter((m) => m.id !== 'hvpg' && inp.on.includes(m.id) && inp.series[m.id]);
    if (!hv && !gs.length) return null;
    const max = niceMax(Math.max(maxOf(hv), ...gs.map((m) => maxOf(inp.series[m.id]))), 16, 2);
    return { id, ms: gs, max, ticks: hvpgTicks(max), zone: !!hv, cuts: hv ? [{ v: HVPG_CUTS.bleed, word: `Bleed risk ${HVPG_CUTS.bleed}`, ink: 'danger' }, { v: HVPG_CUTS.red, word: `CSPH ${HVPG_CUTS.red}`, ink: 'danger', below: true }] : [] };
  }
  const ms = laneOf(id).filter((m) => inp.on.includes(m.id) && inp.series[m.id]);
  if (!ms.length) return null;
  const peak = Math.max(...ms.map((m) => maxOf(inp.series[m.id]) * (m.id === 'shunt' ? 100 : 1)));
  if (id === 'p') { const max = niceMax(peak, 24, 4); return { id, ms, max, ticks: max > 40 ? [0, 20, 40, 60].filter((t) => t <= max) : [0, 10, 20, 30].filter((t) => t <= max), cuts: [] }; }
  if (id === 'stiff') {
    // the elastography lane (kPa): the liver's and the spleen's readings; the model's cut-offs for what rules CSPH in (Baveno VIII 1.16: LSM 25, SSM 55), each only while its own line is on
    const max = niceMax(peak, 30, 10), st = max > 60 ? 25 : max > 40 ? 20 : 10, has = (id: string) => ms.some((m) => m.id === id);
    return { id, ms, max, ticks: Array.from({ length: Math.floor(max / st) + 1 }, (_, i) => i * st), cuts: [...(has('ssm') ? [{ v: SSM_CUTS.ruleIn, word: `SSM ${SSM_CUTS.ruleIn}`, ink: 'text-2' as const }] : []), ...(has('lsm') ? [{ v: LSM_CUTS.ruleIn, word: `LSM ${LSM_CUTS.ruleIn}`, ink: 'text-3' as const }] : [])] };
  }
  if (id === 'asc') { const max = niceMax(peak, 3, 1); return { id, ms, max, ticks: Array.from({ length: Math.floor(max) + 1 }, (_, i) => i).filter((t) => max <= 5 || t % 2 === 0), fill: true, cuts: [] }; }   // (no grade lines on the volume axis: the grades are ultrasound-only, moderate or marked distension, not volumes; reviewer, 24 Nov 2026)
  if (id === 'shunt') {
    // the shunt as a share of the splanchnic inflow and the liver's perfusion as a share of healthy: both percents, so one lane (perfusion can run past 100)
    const has = (k: string) => ms.some((m) => m.id === k), max = Math.min(has('perf') ? 140 : 100, niceMax(peak, 70, 10));
    return { id, ms, max, ticks: [0, 20, 40, 60, 80, 100, 120, 140].filter((t) => t <= max), cuts: [...(has('shunt') ? [{ v: FLOW_CUTS.shuntLarge * 100, word: `Large shunt ${Math.round(FLOW_CUTS.shuntLarge * 100)}%`, ink: 'text-2' as const }] : []), ...(has('perf') ? [{ v: FLOW_CUTS.liverLow, word: `Low liver flow ${FLOW_CUTS.liverLow}%`, ink: 'text-3' as const }] : [])] };
  }
  const has = (k: string) => ms.some((m) => m.id === k), upTo = (max: number, st: number): number[] => Array.from({ length: Math.floor(max / st + 1e-9) + 1 }, (_, i) => +(i * st).toFixed(2));
  if (id === 'spl') { const max = niceMax(peak, 20, 2); return { id, ms, max, ticks: upTo(max, max > 30 ? 10 : 5), cuts: [] }; }
  if (id === 'plt') { const max = niceMax(peak, 300, 50); return { id, ms, max, ticks: upTo(max, 100), cuts: [{ v: LSM_CUTS.ruleOutPlt, word: `Platelets ${LSM_CUTS.ruleOutPlt}`, ink: 'text-2' }] }; }
  if (id === 'bp') { const max = niceMax(peak, 120, 20); return { id, ms, max, ticks: upTo(max, max > 140 ? 50 : 25), cuts: has('map') ? [{ v: MAP_BETA_CUT, word: `MAP ${MAP_BETA_CUT}`, ink: 'text-2' }] : [] }; }
  if (id === 'hr') { const max = niceMax(peak, 120, 20); return { id, ms, max, ticks: upTo(max, 40), cuts: [] }; }
  if (id === 'vx') { const max = niceMax(peak, 8, 2); return { id, ms, max, ticks: upTo(max, max > 10 ? 4 : 2), cuts: [{ v: VARIX_LARGE_MM, word: `Large varix ${VARIX_LARGE_MM} mm`, ink: 'text-2' }, { v: VARIX_NONE_MM, word: `Varix seen ${VARIX_NONE_MM} mm`, ink: 'text-3' }] }; }
  if (id === 'he') { const max = peak > 0.55 ? 1 : 0.6; return { id, ms, max, ticks: [0, 0.2, 0.4, 0.6, 0.8, 1].filter((t) => t <= max + 1e-9), cuts: [{ v: HE_CUTS.high, word: `High ${HE_CUTS.high}`, ink: 'text-2' }, { v: HE_CUTS.moderate, word: `Moderate ${HE_CUTS.moderate}`, ink: 'text-3' }] }; }
  if (id === 'habr') { const max = niceMax(peak, 1.5, 0.5); return { id, ms, max, ticks: upTo(max, 0.5), cuts: [] }; }
  const max = niceMax(peak, 9, 3);
  return { id, ms, max, ticks: Array.from({ length: Math.floor(max / 3) + 1 }, (_, i) => i * 3), cuts: [] };
}

/**
 * The ticks a lane can carry: from the foot up, a tick stays only when it is at least `gap` px above the last one kept, so the numbers of a short lane never stack
 * (root cause of "20 15 10 5" printed over each other: the tick list was chosen by the value range alone, never by the lane's height).
 */
export function fitTicks(ticks: readonly number[], max: number, laneH: number, gap: number): number[] {
  const out: number[] = [];
  let last = -Infinity;
  for (const t of [...ticks].sort((a, b) => a - b)) { const y = t / Math.max(1e-9, max) * laneH; if (y - last >= gap - 1e-6) { out.push(t); last = y; } }
  return out;
}

/** a word's keep-out: a rectangle, or a run of text turned -45° (reading up and to the right) from its baseline start (`xs`, `y0`), `a` above the baseline and `d` below it */
type Block = { x0: number; x1: number; y0: number; y1: number } | { xs: number; y0: number; w: number; a: number; d: number };
/** the stretch of a vertical line at `x` that a block covers (with `pad` px around it), or null */
function coverAt(b: Block, x: number, pad: number): [number, number] | null {
  if ('x0' in b) return x >= b.x0 - pad && x <= b.x1 + pad ? [b.y0 - pad, b.y1 + pad] : null;
  const R2 = Math.SQRT1_2, k = (x - b.xs) / R2, lo = Math.max(0, k - b.d - pad), hi = Math.min(b.w, k + b.a + pad);
  if (hi < lo) return null;
  // along the text (u) from lo to hi, the line meets it at y = y0 + R2 (k - 2u)
  const y1 = b.y0 + R2 * (k - 2 * hi), y2 = b.y0 + R2 * (k - 2 * lo);
  return [Math.min(y1, y2) - pad, Math.max(y1, y2) + pad];
}
/** the pieces of the vertical line x from y1 to y2 that no word covers: a line passes behind words, never through them */
export function lineRuns(x: number, y1: number, y2: number, blocks: readonly Block[], pad = 2): [number, number][] {
  const cuts = blocks.map((b) => coverAt(b, x, pad)).filter((c): c is [number, number] => !!c && c[1] > y1 && c[0] < y2).sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  let at = y1;
  for (const [a, b] of cuts) { if (a > at) out.push([at, a]); at = Math.max(at, b); }
  if (at < y2) out.push([at, y2]);
  return out.filter(([a, b]) => b - a > 1);
}

/** the words of a long label cut in two lines near the middle (an upright label on a phone) */
export function wrap2(t: string, fs: number, limit = 96): string[] {
  if (measure(t, fs, 500) < limit) return [t];
  const w = t.split(' ');
  let best = 1, bd = Infinity;
  for (let i = 1; i < w.length; i++) { const d = Math.abs(w.slice(0, i).join(' ').length - w.slice(i).join(' ').length); if (d < bd) { bd = d; best = i; } }
  return [w.slice(0, best).join(' '), w.slice(best).join(' ')];
}

/** the room left of the plot (the lane's numbers) and right of it, by the chart's width: the strip under it keeps the same */
export const leadOf = (w: number): { L: number; R: number } => (w < 560 ? { L: 38, R: 8 } : { L: 40, R: 12 });

export function bigFrame(inp: BigIn, c: ChartCtx): { frame: Frame; geo: Geo } {
  const pal = c.pal, fs = Math.max(12, c.type.sm), W = Math.max(120, Math.round(c.w)), H = Math.max(160, Math.round(inp.h));
  const phone = W < 560;
  const { L, R } = leadOf(W), plotW = W - L - R;
  const [x0, x1] = inp.win, span = Math.max(1e-6, x1 - x0);
  // the days are paced by their events (pace.ts): X and dayAt look through the window onto one axis whose scale is constant inside each piece
  const pace = paceOf(inp.lines.map((e) => e.day), inp.full), p0 = pace.at(x0), pspan = Math.max(1e-6, pace.at(x1) - p0);
  const X = (d: number) => L + (pace.at(d) - p0) / pspan * plotW;
  const dayAt = (x: number) => pace.day(p0 + (x - L) / plotW * pspan);
  const axH0 = pace.flat ? AXIS_H : AXIS_H + 15;
  const text = pal.tok('text'), t2 = pal.tok('text-2'), t3 = pal.tok('text-3'), hair = pal.alpha(pal.tok('text'), 0.1), hair2 = pal.alpha(pal.tok('text'), 0.2);
  const halo = { color: pal.alpha(pal.tok('surface'), 0.92), w: 3.5 };
  const accent = pal.tok('accent');
  const shapes: Shape[] = [];
  const say = (s: Omit<Extract<Shape, { k: 'text' }>, 'k' | 'size' | 'halo'> & { size?: number; halo?: boolean }): void => { const { halo: h, size, ...rest } = s; shapes.push({ k: 'text', size: size ?? fs, ...(h === false ? {} : { halo }), ...rest }); };

  // ── what is in the window ──
  const lines = inp.lines.filter((e) => e.day >= x0 - 1e-6 && e.day <= x1 + 1e-6).sort((a, b) => a.day - b.day);
  const meds = inp.meds.filter((m) => m.spans.some((s) => (s.to ?? Infinity) >= x0 && s.from <= x1));
  // ── the words over the plot: event labels in rows (a wide card) or upright (a phone) ──
  type Placed = { e: MarkLine; x: number; r: number; w: number; xs?: number; lift?: number; ls?: string[]; plus?: number };
  const marks: { key: string; x: number; n: number }[] = [];
  const placed: Placed[] = [];
  let top: number;
  if (!phone) {
    const end: number[] = [], told = new Set<string>();
    for (const e of lines) {
      // the same event again (Ascites forming, four times) keeps its line and loses its words: the first one says it, History lists every day
      if (e.kind === 'event' && told.has(e.label)) { placed.push({ e, x: X(e.day), r: -1, w: 0 }); continue; }
      told.add(e.label);
      const w = measure(e.label, fs, e.tone === 'change' ? 600 : 500), x = Math.min(X(e.day) + 5, W - 6 - w);
      let r = 0; while (end[r] != null && end[r]! > x - 8) r++;
      end[r] = x + w; placed.push({ e, x, r, w });
    }
    top = 6 + Math.max(2, end.length) * ROW_H + 8;
  } else {
    // a phone sets each label at 45°, reading up and to the right from its line (owner, 24 Nov). A label is one line unless it would stand taller than the band's cap, then two.
    // Labels whose lines are closer than a text line apart cannot all be read: they merge into one "+N" tick at the first of them, and a tap on it opens that group (its labels are then lifted along their lines until none overlaps).
    const told = new Set<string>(), R2 = Math.SQRT1_2, lh = fs * 1.15, capLen = Math.max(96, H * 0.26);
    type Item = { e: MarkLine; x: number; ls: string[]; w: number };
    const items: Item[] = [];
    for (const e of lines) {
      if (e.kind === 'event' && told.has(e.label)) { placed.push({ e, x: X(e.day), r: -1, w: 0, ls: [] }); continue; }
      told.add(e.label);
      const wt = e.tone === 'change' ? 600 : 500, one = measure(e.label, fs, wt), ls = one * R2 > capLen ? wrap2(e.label, fs, Math.max(80, capLen / R2 * 0.55)) : [e.label];
      items.push({ e, x: X(e.day), ls, w: Math.max(...ls.map((l) => measure(l, fs, wt))) });
    }
    const boxes: { n0: number; n1: number; a0: number; a1: number }[] = [];
    // the band never takes more than 28% of the box: what does not fit in it folds into a "+N" tick.
    // (root cause of the squashed plot: a label with no free lift took any lift it needed, so the band ran to 44% of the box and the lanes were left 44 to 88 px)
    const bandCap = Math.max(72, Math.round(H * 0.28));
    let band = 36;
    // a label goes in the first of a few lifts (two rows, in effect) where it overlaps no other; with `reach` unlimited it always goes in
    const lay = (it: Item, reach: number): boolean => {
      const len = it.w * R2, xs = Math.min(it.x + 2, W - 6 - len), up = (it.ls.length - 1) * lh;
      for (let lift = 0; lift <= reach; lift += 3) {   // the label's last line starts at (xs, base - lift): n runs across the label, a along it
        if (reach < 1e8 && lift > 0 && lift + len + up * R2 + fs > bandCap) break;
        const n1 = (xs - lift) * R2 + lh * 0.7, n0 = n1 - up - lh * 1.6, a0 = (xs + lift) * R2, a1 = a0 + it.w + 6;
        if (boxes.some((b) => n0 < b.n1 && n1 > b.n0 && a0 < b.a1 && a1 > b.a0)) continue;
        boxes.push({ n0, n1, a0, a1 });
        placed.push({ e: it.e, x: it.x, r: 0, w: it.w, xs, lift, ls: it.ls }); band = Math.max(band, lift + len + up * R2 + fs);
        return true;
      }
      return false;
    };
    const rows = lh * 1.42 * 2, groups: Item[][] = [];
    for (const it of items) { if (lay(it, rows)) continue; const g = groups[groups.length - 1]; if (g && g[g.length - 1] === items[items.indexOf(it) - 1]) g.push(it); else groups.push([it]); }
    for (const g of groups) {
      const key = String(g[0]!.e.id);
      marks.push({ key, x: g[0]!.x, n: g.length });
      if (inp.open === key) { for (const it of g) lay(it, 1e9); continue; }
      const pw = measure(`+${g.length}`, fs, 600), px = Math.min(g[0]!.x + 2, W - 6 - pw * R2);
      let lift = 0;   // the tick takes the first lift where it overlaps no word
      for (; lift < 1e4; lift += 3) { const n1 = (px - lift) * R2 + lh * 0.7, n0 = n1 - lh * 1.6, a0 = (px + lift) * R2, a1 = a0 + pw + 4; if (!boxes.some((b) => n0 < b.n1 && n1 > b.n0 && a0 < b.a1 && a1 > b.a0)) { boxes.push({ n0, n1, a0, a1 }); break; } }
      band = Math.max(band, lift + pw * R2 + fs);
      g.forEach((it, i) => placed.push({ e: it.e, x: it.x, r: -1, w: 0, ls: [], xs: px, lift, ...(i === 0 ? { plus: g.length } : {}) }));
    }
    top = 10 + Math.ceil(band) + 12;
  }
  // ── lanes ──
  const chosen = ORDER.map((id) => specOf(id, inp)).filter((s): s is LaneSpec => !!s);
  const medRows = meds.length, medsH = medRows ? medRows * MED_H + 6 : 0;
  // how many lanes the box holds: each 60 px or more, a title and a line at the very least (34 px, closer together); the lanes that would not fit are left out and said, never cut off at the foot
  const fit = (ax: number) => {
    const avail = H - top - medsH - ax, roomy = 60 * chosen.length + GAP * (chosen.length - 1) <= avail, gap = roomy ? GAP : 10, floor = roomy ? 60 : 34;
    const cap = Math.max(1, Math.floor((avail + gap) / (floor + gap)));
    return { avail, gap, floor, specs: chosen.slice(0, cap), left: chosen.length - Math.min(cap, chosen.length) };
  };
  // the note that some chosen lanes were left out has a line of its own under the axis words (it used to print over the last lane)
  let axH = axH0, fitted = fit(axH);
  if (fitted.left > 0) { axH = axH0 + 18; fitted = fit(axH); }
  const { avail, gap, floor, specs, left } = fitted;
  const nL = Math.max(1, specs.length);
  const free = Math.max(floor * nL, avail - gap * (nL - 1)), wsum = specs.reduce((a, s) => a + WEIGHT[s.id], 0) || 1;
  let y = top + medsH;
  const geoLanes = specs.map((s) => { const h = specs.length ? free * WEIGHT[s.id] / wsum : free, g = { s, t: y, h }; y += h + gap; return g; });
  const bottom = specs.length ? y - gap : top + medsH + free;
  const frame = (): Frame => ({ w: W, h: bottom + axH, shapes, label: '' });
  const geo: Geo = { w: W, h: bottom + axH, L, R, top, bottom, x0, x1, X, dayAt, lanes: geoLanes.map((g) => ({ id: g.s.id, t: g.t, h: g.h })), groups: marks };

  // a darker rounded panel behind each lane, its own and without an outline (owner, 24 Nov: "p2 but without outlines"); the last one also holds the day axis
  const panel = pal.dark ? pal.alpha([0, 0, 0, 1], 0.38) : pal.alpha(pal.tok('text'), 0.045), padP = Math.min(4, gap / 2 - 1);
  geoLanes.forEach((g, i) => { const y0 = g.t - padP, y1 = i === geoLanes.length - 1 ? bottom + axH - 2 : g.t + g.h + padP; shapes.push({ k: 'rect', x: 0, y: y0, w: W, h: y1 - y0, r: 14, fill: panel }); });
  // the words an event line must pass behind, collected as they are set (the event lines are drawn after them)
  const blocks: { b: Block }[] = [];
  const fsH = fs * 0.85, fsD = fs * 0.3;
  const blockText = (x: number, y: number, w: number, anchor: 'start' | 'end' | 'middle' = 'start'): void => {
    const xa = anchor === 'start' ? x : anchor === 'end' ? x - w : x - w / 2;
    blocks.push({ b: { x0: xa, x1: xa + w, y0: y - fsH, y1: y + fsD } });
  };
  // zones, grids, cut-offs
  for (const g of geoLanes) {
    const Y = (v: number) => g.t + g.h - v / g.s.max * (g.h - TITLE_H);
    if (g.s.zone) {
      const N = 40;
      for (let i = 0; i < N; i++) {
        const v0 = i / N * g.s.max, v1 = (i + 1) / N * g.s.max, v = (v0 + v1) / 2;
        const a = v < HVPG_CUTS.amber ? 0.08 : v < HVPG_CUTS.red ? 0.08 + (v - HVPG_CUTS.amber) / (HVPG_CUTS.red - HVPG_CUTS.amber) * 0.04 : v < HVPG_CUTS.bleed ? 0.12 + (v - HVPG_CUTS.red) / (HVPG_CUTS.bleed - HVPG_CUTS.red) * 0.04 : 0.16;
        const col = v < HVPG_CUTS.amber ? pal.tok('ok') : v < HVPG_CUTS.red ? pal.mix('srgb', pal.tok('ok'), 100 - (v - HVPG_CUTS.amber) / (HVPG_CUTS.red - HVPG_CUTS.amber) * 100, pal.tok('caution'), (v - HVPG_CUTS.amber) / (HVPG_CUTS.red - HVPG_CUTS.amber) * 100) : pal.tok('danger');
        shapes.push({ k: 'rect', x: L, y: Y(v1), w: plotW, h: Y(v0) - Y(v1), fill: pal.alpha(col, a * 1.6) });
      }
    }
    for (const t of fitTicks(g.s.ticks, g.s.max, g.h - TITLE_H, fs * 1.35)) {
      shapes.push({ k: 'line', x1: L, y1: Y(t), x2: W - R, y2: Y(t), pen: pen(hair, 1) });
      if (!(t === 0 && g !== geoLanes[geoLanes.length - 1])) say({ x: L - 8, y: Y(t), s: String(t), color: t3, anchor: 'end', baseline: 'middle', halo: false });
    }
    for (const cut of g.s.cuts) {
      const ink = cut.ink === 'danger' ? inkOf(pal, 'danger') : cut.ink === 'text-2' ? t2 : t3;
      shapes.push({ k: 'line', x1: L, y1: Y(cut.v), x2: W - R, y2: Y(cut.v), pen: pen(pal.alpha(ink, 0.75), 1, { dash: [2, 4] }) });
      say({ x: W - R - 4, y: Y(cut.v) + (cut.below ? 15 : -5), s: cut.word, color: ink, anchor: 'end', size: fs });
      blockText(W - R - 4, Y(cut.v) + (cut.below ? 15 : -5), measure(cut.word, fs, 400), 'end');
    }
  }
  // the x axis
  shapes.push({ k: 'line', x1: L, y1: bottom + 0.5, x2: W - R, y2: bottom + 0.5, pen: pen(hair2, 1) });
  const cx = inp.cursor == null ? null : X(inp.cursor);
  // the paced axis: pieces folded or opened by their events are hatched or warmed, each piece has its own ticks, and the scale is said under the axis
  const tint = pal.alpha(pal.tok('caution'), 0.07), hatch = pal.alpha(pal.tok('text'), 0.09), warm = inkOf(pal, 'caution');
  let lastLab = -1e9;
  for (const pc of pace.pieces) {
    const a = Math.max(pc.a, x0), b = Math.min(pc.b, x1);
    if (b <= a) continue;
    const xa = X(a), xb = X(b), wpx = xb - xa, y0 = top + medsH, hh = bottom - y0;
    if (!pace.flat && pc.w > 1.5) shapes.push({ k: 'rect', x: xa, y: y0, w: wpx, h: hh, fill: tint });
    if (!pace.flat && pc.w < 0.5) {
      for (let hx = xa - hh; hx < xb; hx += 12) {   // 45° strokes, cut to the piece by arithmetic (inside the plot, nothing leans out of it)
        const sa = Math.max(0, xa - hx), sb = Math.min(hh, xb - hx);
        if (sb > sa) shapes.push({ k: 'line', x1: hx + sa, y1: bottom - sa, x2: hx + sb, y2: bottom - sb, pen: pen(hatch, 1) });
      }
    }
    const step = tickStep(b - a, wpx, pace.flat ? 44 : 30);
    for (let d = Math.ceil(a / step - 1e-9) * step; d <= b + 1e-6; d += step) {
      const x = X(d);
      shapes.push({ k: 'line', x1: x, y1: bottom, x2: x, y2: bottom + 5, pen: pen(hair2, 1) });
      if (x - lastLab >= 36 && (cx == null || Math.abs(x - cx) > 30)) {
        // a label at the plot's end keeps wholly inside the box (the phone's 600 was cut by the right edge)
        const word = String(Math.round(d)), half = measure(word, fs, 400) / 2;
        say({ x: Math.max(half + 1, Math.min(W - half - 1, x)), y: bottom + 19, s: word, color: t3, anchor: 'middle', halo: false }); lastLab = x;
      }
    }
    if (!pace.flat && wpx >= 56) say({ x: (xa + xb) / 2, y: bottom + 34, s: scaleWord(pc.w), color: pc.w > 1.5 ? warm : t3, anchor: 'middle', halo: false, size: fs });
  }
  // the medicine bars
  const barTop = top;
  meds.forEach((m, i) => {
    const y0 = barTop + i * MED_H;
    let last = -1e9;
    for (const s of m.spans) {
      if ((s.to ?? Infinity) < x0 || s.from > x1) continue;
      const xa = Math.max(L, X(s.from)), xb = s.to == null ? W - R : Math.min(W - R, X(s.to)), open = s.to == null;
      const fadeW = open ? Math.min(220, (xb - xa) * 0.22) : 0;
      shapes.push({ k: 'rect', x: xa, y: y0 + 15, w: Math.max(2, xb - xa - fadeW), h: 4, r: 2, fill: pal.alpha(accent, 0.8) });
      for (let k = 0; k < (fadeW > 0 ? 24 : 0); k++) { const fx = xb - fadeW + k * fadeW / 24; shapes.push({ k: 'rect', x: fx, y: y0 + 15, w: fadeW / 24, h: 4, fill: pal.alpha(accent, 0.8 * (1 - (k + 0.5) / 24)) }); }
      if (X(s.from) >= L) shapes.push({ k: 'line', x1: X(s.from), y1: y0 + 10, x2: X(s.from), y2: y0 + 24, pen: pen(accent, 1.5) });
      if (s.to != null && X(s.to) <= W - R) shapes.push({ k: 'line', x1: X(s.to), y1: y0 + 10, x2: X(s.to), y2: y0 + 24, pen: pen(accent, 1.5) });
      const tx = Math.max(L + 2, X(s.from) + 5);
      if (tx >= last) { say({ x: tx, y: y0 + 11, s: m.name, color: inkOf(pal, 'accent'), weight: 600 }); blockText(tx, y0 + 11, measure(m.name, fs, 600)); last = tx + measure(m.name, fs, 600) + 8; }
      if (s.to != null && X(s.to) < W - R - 60 && X(s.to) + 6 > last) { say({ x: X(s.to) + 6, y: y0 + 11, s: 'stopped', color: t3 }); blockText(X(s.to) + 6, y0 + 11, measure('stopped', fs, 400)); }
    }
  });
  // lane titles: the name in plain weight and, with the crosshair on a day, that day's reading bold in the measure's ink (without one the title is the name alone: a reading at the left edge would be the newest day's, beside a line that starts somewhere else)
  const at = inp.cursor ?? inp.full[1];   // (the words of a reading, only when the crosshair is down)
  for (const g of geoLanes) {
    let x = L + 8;
    const hv = g.s.zone ? [{ name: HVPG.name, val: valueAt(inp.hvpg, at) == null ? null : valueAt(inp.hvpg, at)!.toFixed(1).replace('-', '−'), ink: inkOf(pal, HVPG.tok) }] : [];
    const parts: { name: string; val: string | null; ink: Rgba }[] = [...hv, ...g.s.ms.map((m) => { const v = valueAt(inp.series[m.id], at); return { name: m.short, val: v == null ? null : m.words(v), ink: inkOf(pal, m.tok) }; })];
    for (const p of parts) {
      const nm = `${p.name} `;
      say({ x, y: g.t + 14, s: nm, color: p.ink, weight: 500 }); blockText(x, g.t + 14, measure(nm.trimEnd(), fs, 500)); x += measure(nm, fs, 500);
      if (p.val && inp.cursor != null) { say({ x, y: g.t + 14, s: p.val, color: p.ink, weight: 600 }); blockText(x, g.t + 14, measure(p.val, fs, 600)); x += measure(p.val, fs, 600); }
      x += 18;
    }
  }
  // the note for lanes left out: its own line under the axis words, centred under the plot
  if (left > 0) say({ x: L + plotW / 2, y: bottom + axH0 + 11, s: `${left} more chosen: no room, turn one off`, color: t3, anchor: 'middle', halo: false });
  // event words
  for (const p of placed) {
    const ink = toneInk(pal, p.e.tone), weight = p.e.tone === 'change' ? 600 : 500;
    if (!phone) { if (p.r >= 0) { say({ x: p.x, y: p.r * ROW_H + 12, s: p.e.label, color: ink, weight }); blockText(p.x, p.r * ROW_H + 12, p.w, 'start'); } }
    else if (p.plus) {
      const y0 = top - 8 - (p.lift ?? 0), pt = `+${p.plus}`;
      say({ x: p.xs ?? p.x, y: y0, s: pt, color: t2, weight: 600, rot: -45, anchor: 'start' });
      blocks.push({ b: { xs: p.xs ?? p.x, y0, w: measure(pt, fs, 600), a: fsH, d: fsD } });
    }
    else if (p.r >= 0) {
      (p.ls ?? []).forEach((l, i, a) => {
        const k = (a.length - 1 - i) * fs * 1.15 * Math.SQRT1_2, y0 = top - 8 - (p.lift ?? 0) - k, xs = (p.xs ?? p.x) - k;
        say({ x: xs, y: y0, s: l, color: ink, weight, rot: -45, anchor: 'start' });
        blocks.push({ b: { xs, y0, w: measure(l, fs, weight), a: fsH, d: fsD } });
      });
    }
  }
  // event lines (behind the traces), then the traces
  shapes.push({ k: 'clip', x: L, y: 0, w: plotW, h: bottom + 1 });
  for (const p of placed) {
    const ink = toneInk(pal, p.e.tone), line0 = p.plus ? top - 8 - (p.lift ?? 0) : p.r < 0 ? top - 6 : phone ? top - 8 - (p.lift ?? 0) - Math.max(0, p.x - (p.xs ?? p.x)) : p.r * ROW_H + 14;
    const x = X(p.e.day), pn = pen(pal.alpha(ink, p.e.tone === 'change' ? 0.85 : 0.55), p.e.tone === 'change' ? 1.6 : 1);
    // the line passes behind every word, its own included (a label set against the box's edge lies across its own line):
    // it is drawn in the pieces no word covers, so no word is ever struck through
    const others = blocks.map((k) => k.b);
    for (const [ya, yb] of lineRuns(x, Math.max(2, line0), bottom, others)) shapes.push({ k: 'line', x1: x, y1: ya, x2: x, y2: yb, pen: pn });
  }
  for (const g of geoLanes) {
    const Y = (v: number) => g.t + g.h - Math.min(v, g.s.max * 1.02) / g.s.max * (g.h - TITLE_H);
    if (g.s.zone && inp.hvpg) { const pts = pointsIn(inp.hvpg, x0, x1, X, Y), col = colourOf(pal, HVPG.tok); shapes.push(pts.length >= 4 ? { k: 'path', pts, pen: pen(col, 2.2, { cap: 'round', join: 'round' }) } : { k: 'circle', cx: pts[0] ?? 0, cy: pts[1] ?? 0, r: 4, fill: col }); }
    for (const m of g.s.ms) {
      const s = inp.series[m.id]!, sc: Series = m.id === 'shunt' ? { x: s.x, y: s.y.map((v) => v * 100) } : s;
      const pts = pointsIn(sc, x0, x1, X, Y), col = colourOf(pal, m.tok);
      if (g.s.fill && pts.length >= 4) {
        const base = Y(0);
        for (let k = 0; k < 6; k++) { const f = (k + 1) / 6, mid: number[] = []; for (let i = 0; i < pts.length; i += 2) mid.push(pts[i]!, pts[i + 1]! + (base - pts[i + 1]!) * f); shapes.push({ k: 'band', top: pts, bottom: mid, fill: pal.alpha(col, 0.07) }); }
      }
      if (pts.length >= 4) shapes.push({ k: 'path', pts, pen: pen(col, 2.2, { cap: 'round', join: 'round' }) });
      else if (pts.length === 2) shapes.push({ k: 'circle', cx: pts[0]!, cy: pts[1]!, r: 4, fill: col });   // (one day only: where the reading stands)
    }
  }
  shapes.push({ k: 'unclip' });
  // the crosshair
  if (cx != null && inp.cursor != null) {
    shapes.push({ k: 'line', x1: cx, y1: phone ? top - 6 : top - 4, x2: cx, y2: bottom, pen: pen(pal.alpha(text, 0.5), 1) });
    for (const g of geoLanes) {
      const Y = (v: number) => g.t + g.h - Math.min(v, g.s.max * 1.02) / g.s.max * (g.h - TITLE_H);
      const dots: { v: number | null; col: Rgba }[] = [...(g.s.zone ? [{ v: valueAt(inp.hvpg, inp.cursor), col: colourOf(pal, HVPG.tok) }] : []),
        ...g.s.ms.map((m) => { const v = valueAt(inp.series[m.id], inp.cursor!); return { v: v == null ? null : m.id === 'shunt' ? v * 100 : v, col: colourOf(pal, m.tok) }; })];
      for (const d of dots) if (d.v != null) shapes.push({ k: 'circle', cx, cy: Y(d.v), r: 3.8, fill: d.col, pen: pen(pal.tok('surface'), 1.6) });
    }
    say({ x: cx, y: bottom + 19, s: `Day ${Math.round(inp.cursor)}`, color: text, weight: 600, anchor: 'middle' });
  }
  if (!specs.length) say({ x: L + plotW / 2, y: top + medsH + free / 2, s: 'Nothing chosen. Turn something on under What to graph.', color: t2, anchor: 'middle', size: fs });
  const f = frame();
  return { frame: { ...f, label: `Over time, day ${Math.round(x0)} to ${Math.round(x1)}: ${specs.map((s) => [...(s.zone ? ['HVPG'] : []), ...s.ms.map((m) => m.name)].join(', ')).join('; ')}.` }, geo };
}

/** The strip under the chart: the whole run as one thin line, the events as ticks, the window between its two grips. */
export function stripFrame(inp: BigIn, c: ChartCtx, lead: { L: number; R: number }): { frame: Frame; geo: { L: number; R: number; X(d: number): number; dayAt(x: number): number; h: number } } {
  const pal = c.pal, W = Math.max(120, Math.round(c.w)), H = 34, { L, R } = lead, pw = W - L - R;
  const [f0, f1] = inp.full, fs = Math.max(1e-6, f1 - f0);
  const X = (d: number) => L + (d - f0) / fs * pw, dayAt = (x: number) => f0 + (x - L) / pw * fs;
  const hair2 = pal.alpha(pal.tok('text'), 0.2), shapes: Shape[] = [];
  shapes.push({ k: 'line', x1: L, y1: H - 0.5, x2: W - R, y2: H - 0.5, pen: pen(hair2, 1) });
  for (const e of inp.lines) shapes.push({ k: 'line', x1: X(e.day), y1: 2, x2: X(e.day), y2: H, pen: pen(pal.alpha(toneInk(pal, e.tone), e.tone === 'change' ? 0.8 : 0.45), 1) });
  const lead1 = ['pv', 'wedge', 'hv', 'ivc', 'ra', 'var', 'sv', 'smv'].find((id) => inp.on.includes(id) && inp.series[id]);
  const s = lead1 ? inp.series[lead1]! : inp.hvpg;
  if (s && s.x.length > 1) {
    const peak = Math.max(1e-6, maxOf(s)), Y = (v: number) => H - 5 - v / peak * (H - 12);
    shapes.push({ k: 'path', pts: pointsIn(s, f0, f1, X, Y), pen: pen(pal.alpha(lead1 ? colourOf(pal, MEASURE_OF[lead1]!.tok) : colourOf(pal, HVPG.tok), 0.9), 1.4) });
  }
  const a = X(inp.win[0]), b = X(inp.win[1]), shade = pal.alpha(pal.tok('surface'), 0.62);
  if (a > L) shapes.push({ k: 'rect', x: L, y: 0, w: a - L, h: H, fill: shade });
  if (b < W - R) shapes.push({ k: 'rect', x: b, y: 0, w: W - R - b, h: H, fill: shade });
  shapes.push({ k: 'line', x1: a, y1: 0.5, x2: b, y2: 0.5, pen: pen(pal.alpha(pal.tok('text-3'), 0.6), 1) }, { k: 'line', x1: a, y1: H - 0.5, x2: b, y2: H - 0.5, pen: pen(pal.alpha(pal.tok('text-3'), 0.6), 1) });
  for (const x of [a, b]) shapes.push({ k: 'rect', x: x - 2.5, y: H / 2 - 11, w: 5, h: 22, r: 2.5, fill: pal.alpha(pal.tok('text-2'), 0.85) });
  return { frame: { w: W, h: H, shapes, label: 'The whole run, with the days shown between two handles.' }, geo: { L, R, X, dayAt, h: H } };
}
