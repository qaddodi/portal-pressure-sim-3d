// The summary table's cells, as the 2D app's summaryTable works them out (presenter-question.js), kept free of the page so a test can recompute every cell: each row is a patient (a slide's state
// or one of its own), each cell its reading with an arrow against normal (or against the row it is compared with), the rating colour that goes with it, and the words a screen reader hears.
// The cut-offs, the arrows and the colours are table-marks.js, copied verbatim from the 2D app (ui/deck/from2d/); nothing here is a second copy of them.
import type { TableRowSpec, TableSpec } from '../../decks/schema.ts';
import { COLS, CUT, PRESS, TILE, NO_ASC, dirAbs, dirRel, rateAbs, effOf, fpv, pressDp, headOf, sameHead, tileOf } from '../deck/from2d/table-marks.js';
import { SAAG_PORTAL, TP_HIGH, saagPortal, tpHigh } from '../../engine/hales/portal/ascites-cuts.js';
import { NOT_MEASURABLE } from '../../engine/hales/portal/pressure-cuts.js';
import { lcFirst } from '../../engine/hales/portal/lc-first.js';
import { bedsideMean } from '../../engine/hales/portal/bedside-mean.js';
import { fmt } from '../charts/fmt.ts';
import { HEADING as WAVE_HEADING, CUT as WAVE_CUT, waveVessel, waveScale, waveWords, type Trace } from './table-wave.ts';

const TILES = TILE as Record<string, { x?: number; d?: number }>;
const COLNAMES = COLS as Record<string, string>;
const CUTS = CUT as Record<string, string>;
const rateOf = (v: unknown): 'hi' | 'mid' | null => (v === 'hi' || v === 'mid' ? v : null);

export type Fp = Record<string, number | null | undefined>;
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
export interface ColModel { k: string; label: string; cut: string }
export interface TableModel { cols: ColModel[]; ascCols: boolean; rel: boolean; rows: RowModel[]; legend: string; rowHead: string; noteHeads: string[] }

const WORD: Record<string, string> = { 2: 'well above normal', 1: 'above normal', 0: 'normal', '-1': 'below normal', '-2': 'well below normal' };
const WORDREL: Record<string, string> = { 2: 'much higher', 1: 'higher', 0: 'unchanged', '-1': 'lower', '-2': 'much lower' };
const UNIT_WORDS: Record<string, string> = { press: 'pressures in mmHg', varix: 'varix diameter in mm', gv: 'fundal varix diameter in mm', asc: 'ascites in liters', liver: 'hepatic blood flow in % of normal', shunt: 'shunted blood in %', plt: 'platelets × 10³/µL',
  lsm: 'liver stiffness in kPa', ssm: 'spleen stiffness in kPa', hr: 'heart rate in beats/min', pvFlow: 'portal flow in L/min', res: 'intrahepatic resistance in mmHg per L/min', spleen: 'spleen length in cm', co: 'cardiac output in L/min', bv: 'blood volume in L' };
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
  if (PRESS.has(k)) return fmt(v, pressDp(k));
  if (k === 'res') return fmt(v, 1);
  const T = TILES[k];
  return fmt(v * (T?.x ?? 1), T?.d ?? 1);
}

export function tableModel(spec: TableSpec, rows: ResolvedRow[], fpOfId: (id: string) => Fp | null = () => null): TableModel {
  const cols = spec.cols ?? DEFAULT_COLS, ascCols = spec.asc ?? !spec.cols;
  const notes = spec.note ? [spec.note].flat() : [];
  const perRow = rows.some((r) => r.spec.vs), rel = spec.vs === 'first' || perRow;
  const first = rows[0]?.f ?? null;
  const vsRow = (r: ResolvedRow) => rows.find((x) => x.spec.key === r.spec.vs || (x.spec.id && x.spec.id === r.spec.vs));
  const refOfRow = (r: ResolvedRow): Fp | null => (r.spec.vs ? vsRow(r)?.f ?? fpOfId(r.spec.vs) : first);
  const isRef = (r: ResolvedRow, n: number) => !!r.spec.ref || (rel && !r.spec.vs && n === 0);
  const blank = (r: ResolvedRow) => r.spec.blank ?? [];
  const cell = (k: string, r: ResolvedRow, n: number): Cell => {
    const base: Cell = { k, kind: 'dir', text: '', arrow: 0, rate: null, eff: null, miss: '', sr: '' };
    if (blank(r).includes(k)) return { ...base, kind: 'blank', sr: NOT_MEASURABLE.toLowerCase() };
    if (k === 'wave') {
      if (!r.f) return { ...base, kind: 'pend', sr: 'calculating' };
      const vessel = waveVessel(r.spec, spec), trace = r.trace ?? null, max = waveScale(trace, spec), w = waveWords(trace, vessel, max);
      return { ...base, kind: 'wave', sr: w.sr, wave: { vessel, max, trace, pending: r.trace === undefined, title: w.title } };
    }
    if (!r.f || (rel && !isRef(r, n) && !refOfRow(r))) return { ...base, kind: 'pend', sr: 'calculating' };
    if (k === 'spleen' && !(fpv(k, r.f) > 0)) return { ...base, kind: 'removed', text: 'Removed', sr: 'removed' };
    const text = valueText(k, r.f);
    if (isRef(r, n)) return { ...base, kind: 'ref', text, rate: rel ? null : rateOf(rateAbs(k, dirAbs(k, r.f))), sr: text + unitOf(k) };
    const ref = refOfRow(r), d: number = rel ? (ref ? dirRel(k, r.f, ref) : 0) : dirAbs(k, r.f), v = text + unitOf(k);
    const calm = (spec.calm ?? []).includes(k) || (r.spec.calm ?? []).includes(k);
    const miss = (r.spec.miss ?? []).includes(k) ? 'Misses' : (r.spec.missPart ?? []).includes(k) ? 'Misses part' : '';
    return { ...base, text, arrow: d, rate: rel ? null : rateOf(rateAbs(k, d)), eff: rel && !calm ? effOf(k, d) : null, miss,
      sr: `${rel ? WORDREL[d] : WORD[d]}, ${v}${miss ? `, ${miss.toLowerCase()} the resistance` : ''}` };
  };
  const asc = (r: ResolvedRow, n: number): Cell[] => {
    const pend = (k: string): Cell => ({ k, kind: 'pend', text: '', arrow: 0, rate: null, eff: null, miss: '', sr: 'calculating' });
    if (!r.f) return [pend('saag'), pend('tp')];
    if ((r.f.asc ?? 0) < NO_ASC) return [{ k: 'saag', kind: 'none', text: 'None', arrow: 0, rate: null, eff: null, miss: '', sr: 'no ascites' }];
    const hiS = saagPortal(r.f.saag), hiP = tpHigh(r.f.tp);
    if (isRef(r, n)) return [{ k: 'saag', kind: 'ref', text: fmt(r.f.saag, 1), arrow: 0, rate: hiS ? 'hi' : null, eff: null, miss: '', sr: `SAAG ${fmt(r.f.saag, 1)} g/dL` }, { k: 'tp', kind: 'ref', text: fmt(r.f.tp, 1), arrow: 0, rate: null, eff: null, miss: '', sr: `protein ${fmt(r.f.tp, 1)} g/dL` }];
    return [
      { k: 'saag', kind: 'dir', text: fmt(r.f.saag, 1), arrow: hiS ? 1 : -1, rate: hiS ? 'hi' : null, eff: null, miss: '', sr: `SAAG ${hiS ? `${SAAG_PORTAL} or more` : `under ${SAAG_PORTAL}`}, ${fmt(r.f.saag, 1)}` },
      { k: 'tp', kind: 'dir', text: fmt(r.f.tp, 1), arrow: hiP ? 1 : -1, rate: null, eff: null, miss: '', sr: `protein ${hiP ? `${TP_HIGH} or more` : `under ${TP_HIGH}`}, ${fmt(r.f.tp, 1)} g/dL` },
    ];
  };
  const colModels: ColModel[] = [...cols.map((k) => (k === 'wave' ? { k, label: WAVE_HEADING, cut: WAVE_CUT } : { k, label: COLNAMES[k] || k, cut: CUTS[k] ?? '' })), ...(ascCols ? [{ k: 'saag', label: 'SAAG', cut: CUTS.saag ?? '' }, { k: 'tp', label: 'Prot.', cut: CUTS.tp ?? '' }] : [])];
  const headRows = rows.map((r) => ({ kicker: r.kicker, site: r.spec.site }));
  const rowModels = rows.map((r, n): RowModel => ({
    key: r.spec.key ?? r.spec.id ?? `r${n}`, i: r.i, head: headOf(headRows[n]), site: r.spec.site ?? 'none', title: r.title,
    vs: r.spec.vs ? `vs ${lcFirst(vsRow(r)?.title || '')}` : '',
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
  const key = rel
    ? `↑ higher, ↓ lower than ${perRow ? 'the row named under each' : refTitle}; ↑↑ ↓↓ by ≥40%; • unchanged${cols.some((k) => k !== 'pvFlow') ? '. Green better, red worse' : ''}`
    : '↑ above normal, ↓ below; ↑↑ ↓↓ past the red cut-off';
  const legend = [key, rows.some((r) => blank(r).length) ? `○ ${NOT_MEASURABLE.toLowerCase()}` : '', units.length && rows.some((r, n) => isRef(r, n)) ? `Top row: ${units.join(', ')}` : '', spec.foot || '']
    .filter(Boolean).map((x) => x.replace(/\.$/, '')).join('. ') + '.';
  return { cols: colModels, ascCols, rel, rows: rowModels, legend, rowHead: spec.rowHead || 'Level', noteHeads: notes };
}
