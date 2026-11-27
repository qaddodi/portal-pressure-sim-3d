// The summary table's cells, as the 2D app's summaryTable works them out (presenter-question.js), kept free of the page so a test can recompute every cell: each row is a patient (a slide's state
// or one of its own), each cell its reading with an arrow against normal (or against the row it is compared with), the rating colour that goes with it, and the words a screen reader hears.
// The cut-offs, the arrows and the colours are table-marks.js, copied verbatim from the 2D app (ui/deck/from2d/); nothing here is a second copy of them.
import type { TableRowSpec, TableSpec } from '../../decks/schema.ts';
import { COLS, CUT, PRESS, TILE, NO_ASC, atShown, dirAbs, dirRel, rateAbs, effOf, fpv, pressDp, headOf, sameHead, tileOf } from '../deck/from2d/table-marks.js';
import { SAAG_PORTAL, TP_HIGH, saagPortal, tpHigh } from '../../engine/hales/portal/ascites-cuts.js';
import { NOT_MEASURABLE } from '../../engine/hales/portal/pressure-cuts.js';
import { hvpgNotMeasurable } from '../../engine/hv-flag.ts';
import { lcFirst } from '../../engine/hales/portal/lc-first.js';
import { bedsideMean } from '../../engine/hales/portal/bedside-mean.js';
import { fmt } from '../charts/fmt.ts';
import { gapText, stationText } from '../charts/readings.ts';
import { HEADING as WAVE_HEADING, CUT as WAVE_CUT, waveVessel, waveScale, waveWords, type Trace } from './table-wave.ts';

const TILES = TILE as Record<string, { x?: number; d?: number }>;
const COLNAMES = COLS as Record<string, string>;
const CUTS = CUT as Record<string, string>;
const rateOf = (v: unknown): 'hi' | 'mid' | null => (v === 'hi' || v === 'mid' ? v : null);

export type Fp = Record<string, number | null | undefined>;

/**
 * The share of its baseline a pressure must move before a table calls it changed (owner, 27 Nov, L6: 16.4 to 15.2 on 07.11 is a drift the words call unchanged, so it shows the level dash).
 * table-marks.js (the 2D app's, copied) steps the gradients at 0.5 mmHg; that is too fine for a table that names a baseline, so the table asks this first. Only the gradients: the
 * other columns keep the 2D steps.
 */
export const UNCHANGED_UNDER: Readonly<Record<string, number>> = { hvpg: 0.1, ppg: 0.1 };
/** The arrow of a cell against another row: the 2D app's (dirRel), and the level dash where a gradient moved less than UNCHANGED_UNDER of the baseline it is read against. */
export function dirAgainst(k: string, f: Fp, ref: Fp): number {
  const d: number = dirRel(k, f, ref), under = UNCHANGED_UNDER[k];
  if (d === 0 || under == null) return d;
  const a = atShown(k, fpv(k, f)), b = atShown(k, fpv(k, ref));
  if (a == null || b == null) return 0;
  return Math.abs(a - b) < under * Math.max(Math.abs(b), 1e-6) ? 0 : d;
}
export const DEFAULT_COLS = ['pv', 'whvp', 'fhvp', 'ivc', 'ra', 'hvpg', 'ppg'];

/** A row once its patient is known: `i` is the slide it stands on (its stop's number), -1 for a patient of its own; `f` the model's numbers there, null while they are being worked out. */
/** `trace`: the Doppler column's trace at this row's state (undefined until asked for, null when the model gave none). */
export interface ResolvedRow { spec: TableRowSpec; i: number; f: Fp | null; title: string; kicker: string; trace?: Trace | null }

export interface Cell {
  /** the column (a tile key, or 'saag' / 'tp') */
  k: string;
  kind: 'pend' | 'blank' | 'removed' | 'none' | 'ref' | 'dir' | 'wave';
  /** the number as the column prints it, with its unit for a hint */
  text: string;
  /** -2 to 2: the arrow (0 is the dot: within normal, or unchanged) */
  arrow: number;
  rate: 'mid' | 'hi' | null;
  eff: 'good' | 'bad' | null;
  miss: string;
  /** what a screen reader says */
  sr: string;
  /** a 'wave' cell: the vessel, the scale (cm/s to the edge), the trace (null: not in yet) and the hover words */
  wave?: { vessel: string; max: number; trace: Trace | null; pending: boolean; title: string };
}
export interface RowModel { key: string; i: number; head: string; site: string; title: string; vs: string; cont: boolean; focus: boolean; ref: boolean; cells: Cell[]; notes: string[] }
/** `group`: the heading a column stands under when its heads are staggered (the pressure columns, the ascites pair), '' for none. */
export interface ColModel { k: string; label: string; cut: string; group: string }
export interface TableModel { cols: ColModel[]; ascCols: boolean; rel: boolean; rows: RowModel[]; legend: string; rowHead: string; noteHeads: string[] }

const WORD: Record<string, string> = { 2: 'well above normal', 1: 'above normal', 0: 'normal', '-1': 'below normal', '-2': 'well below normal' };
const WORDREL: Record<string, string> = { 2: 'much higher', 1: 'higher', 0: 'unchanged', '-1': 'lower', '-2': 'much lower' };
const UNIT_WORDS: Record<string, string> = { press: 'pressures in mmHg', varix: 'esophageal varix diameter in mm (about 2 mm is the normal vein\'s own caliber, not a varix)', gv: 'fundal varix diameter in mm (about 2 mm is the normal vein\'s own caliber)', asc: 'ascites in liters', liver: 'hepatic blood flow in % of normal', shunt: 'shunted blood in %', plt: 'platelets × 10³/µL',
  lsm: 'liver stiffness in kPa', ssm: 'spleen stiffness in kPa', hr: 'heart rate in beats/min', pvFlow: 'portal flow in L/min', pvVel: 'portal vein velocity in cm/s', res: 'intrahepatic resistance in mmHg per L/min', spleen: 'spleen length in cm', co: 'cardiac output in L/min', bv: 'blood volume in L', he: 'HE risk is the model\'s own index, 0 to 1, not a probability' };
export const unitOf = (k: string): string => (k === 'varix' || k === 'gv' ? ' mm' : k === 'asc' ? ' L' : k === 'liver' || k === 'shunt' ? '%' : k === 'hr' ? '/min' : k === 'res' ? ' mmHg per L/min' : PRESS.has(k) ? ' mmHg' : tileOf(k)?.u ? ` ${tileOf(k).u}` : '');

/** A blood pressure as the vitals print it: 117/69 (85), the mean worked from the two numbers as printed. */
export function bpText(sbp: number | null | undefined, dbp: number | null | undefined, map: number): string {
  if (!Number.isFinite(map)) return '—';
  const r = (v: number) => String(Math.round(v));
  return Number.isFinite(sbp) && Number.isFinite(dbp) ? `${r(sbp!)}/${r(dbp!)} (${r(bedsideMean(Math.round(sbp!), Math.round(dbp!)))})` : `MAP ${r(map)}`;
}
/** A value as its column prints it (a pressure in whole mmHg, a gradient to one decimal, the rest as their tile prints them). */
export function valueText(k: string, f: Fp): string {
  const v = fpv(k, f);
  if (v == null) return '—';
  if (k === 'map') return bpText(f.sbp, f.dbp, v);
  // (a pressure is the one reading formatter's: a station whole, a gradient to a tenth: charts/readings.ts)
  if (PRESS.has(k)) return pressDp(k) ? gapText(v) : stationText(v);
  if (k === 'res') return fmt(v, 1);
  const T = TILES[k];
  return fmt(v * (T?.x ?? 1), T?.d ?? 1);
}

/** After a TIPS the gradient that is read is the PPG; the HVPG the model still prints is its own output, so a table shows it no arrow. */
export const AFTER_TIPS_SR = 'not read after a TIPS: the gradient read is the PPG';
const AFTER_TIPS_LEGEND = 'HVPG not read after a TIPS (the PPG is)';

/** The heading a column stands under: the pressures in mmHg together, the two ascitic readings together, any other column alone. */
export const groupOf = (k: string): string => (PRESS.has(k) ? 'Pressures' : k === 'saag' || k === 'tp' ? 'Ascites' : '');

export function tableModel(spec: TableSpec, rows: ResolvedRow[], fpOfId: (id: string) => Fp | null = () => null): TableModel {
  const cols = spec.cols ?? DEFAULT_COLS, ascCols = spec.asc ?? !spec.cols;
  const notes = spec.note ? [spec.note].flat() : [];
  const perRow = rows.some((r) => r.spec.vs), rel = spec.vs === 'first' || perRow;
  const first = rows[0]?.f ?? null;
  const vsRow = (r: ResolvedRow) => rows.find((x) => x.spec.key === r.spec.vs || (x.spec.id && x.spec.id === r.spec.vs));
  const refOfRow = (r: ResolvedRow): Fp | null => (r.spec.vs ? vsRow(r)?.f ?? fpOfId(r.spec.vs) : first);
  // The row a row's arrows are against, named under it when the legend says "the row named under each" (a table where some row has its own `vs`): a row
  // with none of its own is against the first row, and
  // says so (Ascites 22: "Paracentesis with albumin", "Diuretics, 4 weeks" and "TIPS, 4 weeks" had arrows and no name under them, review 3531bdfa B-D3). A
  // table that compares every row with the first names it once, in the legend.
  const vsLabel = (r: ResolvedRow, n: number): string => {
    const against = r.spec.vs ? vsRow(r) : perRow && !isRef(r, n) ? rows[0] : undefined;
    return against ? `vs ${lcFirst(against.title)}` : '';
  };
  const isRef = (r: ResolvedRow, n: number) => !!r.spec.ref || (rel && !r.spec.vs && n === 0);
  // (a row's blank cells: the ones its words give, and the HVPG of any patient whose hepatic vein is blocked, whatever the row says: ui/cuts.ts)
  const blank = (r: ResolvedRow) => (hvpgNotMeasurable(r.f) && !(r.spec.blank ?? []).includes('hvpg') ? [...(r.spec.blank ?? []), 'hvpg'] : r.spec.blank ?? []);
  const afterTips = (r: ResolvedRow, k: string, n: number) => k === 'hvpg' && !isRef(r, n) && Number.isFinite(r.f?.tipsFlow);
  const cell = (k: string, r: ResolvedRow, n: number): Cell => {
    const base: Cell = { k, kind: 'dir', text: '', arrow: 0, rate: null, eff: null, miss: '', sr: '' };
    if (blank(r).includes(k)) return { ...base, kind: 'blank', sr: NOT_MEASURABLE.toLowerCase() };
    if (afterTips(r, k, n)) return { ...base, kind: 'blank', sr: AFTER_TIPS_SR };   // (the HVPG after a stent is the model's, not a reading: the gradient that is read is the PPG; reviewer, 24 Nov 2026)
    if (k === 'wave') {
      if (!r.f) return { ...base, kind: 'pend', sr: 'calculating' };
      const vessel = waveVessel(r.spec, spec), trace = r.trace ?? null, max = waveScale(trace, spec), w = waveWords(trace, vessel, max);
      return { ...base, kind: 'wave', sr: w.sr, wave: { vessel, max, trace, pending: r.trace === undefined, title: w.title } };
    }
    if (!r.f || (rel && !isRef(r, n) && !refOfRow(r))) return { ...base, kind: 'pend', sr: 'calculating' };
    if (k === 'spleen' && !(fpv(k, r.f) > 0)) return { ...base, kind: 'removed', text: 'Removed', sr: 'removed' };
    const text = valueText(k, r.f);
    if (isRef(r, n)) return { ...base, kind: 'ref', text, rate: rel ? null : rateOf(rateAbs(k, dirAbs(k, r.f))), sr: text + unitOf(k) };
    const ref = refOfRow(r), d: number = rel ? (ref ? dirAgainst(k, r.f, ref) : 0) : dirAbs(k, r.f), v = text + unitOf(k);
    const calm = (spec.calm ?? []).includes(k) || (r.spec.calm ?? []).includes(k);
    const miss = (r.spec.miss ?? []).includes(k) ? 'Misses' : (r.spec.missPart ?? []).includes(k) ? 'Misses part' : '';
    return { ...base, text, arrow: d, rate: rel ? null : rateOf(rateAbs(k, d)), eff: rel && !calm ? effOf(k, d) : null, miss,
      sr: `${rel ? WORDREL[d] : WORD[d]}, ${v}${miss ? `, ${miss.toLowerCase()} the resistance` : ''}` };
  };
  const asc = (r: ResolvedRow, n: number): Cell[] => {
    const pend = (k: string): Cell => ({ k, kind: 'pend', text: '', arrow: 0, rate: null, eff: null, miss: '', sr: 'calculating' });
    if (!r.f) return [pend('saag'), pend('tp')];
    if ((r.f.asc ?? 0) < NO_ASC) return [{ k: 'saag', kind: 'none', text: 'No ascites', arrow: 0, rate: null, eff: null, miss: '', sr: 'no ascites' }];
    const hiS = saagPortal(r.f.saag), hiP = tpHigh(r.f.tp);
    // (A SAAG, and likewise the ascitic protein, at or over its cut-off is one arrow, and one arrow wears the colour the legend gives it on every table,
    //  amber (rateAbs), not a red of its own: the arrow, its colour and its legend entry are one rule. Under it: quiet.)
    const rateS = hiS ? rateOf(rateAbs('saag', 1)) : null, rateP = hiP ? rateOf(rateAbs('tp', 1)) : null;
    if (isRef(r, n)) return [{ k: 'saag', kind: 'ref', text: fmt(r.f.saag, 1), arrow: 0, rate: rateS, eff: null, miss: '', sr: `SAAG ${fmt(r.f.saag, 1)} g/dL` }, { k: 'tp', kind: 'ref', text: fmt(r.f.tp, 1), arrow: 0, rate: rateP, eff: null, miss: '', sr: `protein ${fmt(r.f.tp, 1)} g/dL` }];
    return [
      { k: 'saag', kind: 'dir', text: fmt(r.f.saag, 1), arrow: hiS ? 1 : -1, rate: rateS, eff: null, miss: '', sr: `SAAG ${hiS ? `${SAAG_PORTAL} or more` : `under ${SAAG_PORTAL}`}, ${fmt(r.f.saag, 1)}` },
      { k: 'tp', kind: 'dir', text: fmt(r.f.tp, 1), arrow: hiP ? 1 : -1, rate: rateP, eff: null, miss: '', sr: `protein ${hiP ? `${TP_HIGH} or more` : `under ${TP_HIGH}`}, ${fmt(r.f.tp, 1)} g/dL` },
    ];
  };
  const colModels: ColModel[] = [...cols.map((k) => (k === 'wave' ? { k, label: WAVE_HEADING, cut: WAVE_CUT, group: '' } : { k, label: COLNAMES[k] || k, cut: CUTS[k] ?? '', group: groupOf(k) })),
    ...(ascCols ? [{ k: 'saag', label: 'SAAG', cut: CUTS.saag ?? '', group: groupOf('saag') }, { k: 'tp', label: 'Prot.', cut: CUTS.tp ?? '', group: groupOf('tp') }] : [])];
  const headRows = rows.map((r) => ({ kicker: r.kicker, site: r.spec.site }));
  const rowModels = rows.map((r, n): RowModel => ({
    key: r.spec.key ?? r.spec.id ?? `r${n}`, i: r.i, head: headOf(headRows[n]), site: r.spec.site ?? 'none', title: r.title,
    vs: vsLabel(r, n),
    cont: n > 0 && sameHead(headRows[n - 1], headRows[n]),
    focus: !!spec.focusRow && (r.spec.key === spec.focusRow || r.spec.id === spec.focusRow),
    ref: isRef(r, n),
    cells: [...cols.map((k) => cell(k, r, n)), ...(ascCols ? asc(r, n) : [])],
    notes: notes.map((_, j) => [r.spec.note].flat()[j] || ''),
  }));
  // One legend, built from the table itself: what the arrows compare with, the reference row's units, the ring.
  const units = [...new Set(cols.map((k: string) => (PRESS.has(k) ? 'press' : k)).filter((k: string) => UNIT_WORDS[k]))].map((k) => UNIT_WORDS[k as string]);
  if (ascCols) units.push('SAAG and protein in g/dL');
  const refTitle = first ? lcFirst(rows[0].title) : 'the baseline';
  // (the baseline is named in the legend, or under each row where rows compare with rows of their own; a pressure within UNCHANGED_UNDER of it is the dash, and the legend says so, L6)
  const steady = cols.some((k: string) => k in UNCHANGED_UNDER) ? ` (a pressure within ${Math.round(UNCHANGED_UNDER.hvpg! * 100)}%)` : '';
  const key = rel
    ? `↑ higher, ↓ lower than ${perRow ? 'the row named under each' : refTitle}; ↑↑ ↓↓ a relative change of ≥40%; • unchanged${steady}`
      + `${cols.some((k) => k !== 'pvFlow') ? '. Green better, red worse' : ''}`
    : '↑ above normal, ↓ below; ↑↑ ↓↓ past the red cut-off; • within normal';   // (the level dash is a cell's reading too: a legend that did not name it left the "–" in a row undefined)
  const legend = [key, rows.some((r) => blank(r).length) ? `○ ${NOT_MEASURABLE.toLowerCase()}` : '', cols.includes('hvpg') && rows.some((r, n) => afterTips(r, 'hvpg', n)) ? `○ ${AFTER_TIPS_LEGEND}` : '', units.length && rows.some((r, n) => isRef(r, n)) ? `Units: ${units.join(', ')}` : '', spec.foot || '']
    .filter(Boolean).map((x) => x.replace(/\.$/, '')).join('. ') + '.';
  return { cols: colModels, ascCols, rel, rows: rowModels, legend, rowHead: spec.rowHead || 'Level', noteHeads: notes };
}
