// What the timeline chart draws, gathered from the record (feed.ts: one calmed point a day, a step where a treatment came in) and History's entries. Pure: the page's two singletons
// are handed in by the hook (use-data.ts), so a test drives it with a made-up run.
import { MEASURES, type Measure } from './measures.ts';
import { marksOf, type EntryIn, type MarkLine, type MedBar, type Tone } from './marks.ts';
import type { Series } from './record.ts';

export interface Happened { id: number; day: number; label: string; kind: 'event' | 'change'; tone: Tone; detail?: string; params?: unknown; keys?: readonly string[] }
export interface Data {
  series: Record<string, Series>;
  hvpg: Series | null;
  lines: MarkLine[];
  meds: MedBar[];
  happened: Happened[];
  /** the whole run, in days */
  full: [number, number];
  /** nothing recorded at all */
  empty: boolean;
  /** only one day recorded (a patient the clock has not run on): the lanes show where the readings stand, and the card says the lines draw as time passes */
  short: boolean;
}
export interface DataIn {
  calm(key: string): { x: number[]; mid: number[] } | null;
  entries: readonly EntryIn[];
  labelsOf(params: unknown): Map<string, string>;
  /** the readouts hidden now (hidden.ts); the learner has not measured them */
  hidden: ReadonlySet<string> | null;
}

const seriesOf = (c: { x: number[]; mid: number[] } | null): Series | null => (c && c.x.length ? { x: c.x, y: c.mid } : null);
/** the measures the record can draw, those not hidden */
export const drawable = (hidden: ReadonlySet<string> | null): Measure[] => MEASURES.filter((m) => !(m.hide && hidden?.has(m.hide)));

export function buildData(i: DataIn): Data {
  const series: Record<string, Series> = {};
  for (const m of drawable(i.hidden)) { const s = seriesOf(i.calm(m.key)); if (s) series[m.id] = s; }
  const hvpg = series.hvpg ?? null;   // (the HVPG is a measure like the others; the field stays for what reads it by name)
  const { lines, meds } = marksOf(i.entries, i.labelsOf);
  const all = Object.values(series);
  let a = Infinity, b = -Infinity;
  for (const s of all) { a = Math.min(a, s.x[0]!); b = Math.max(b, s.x[s.x.length - 1]!); }
  const empty = !Number.isFinite(a), short = !empty && !(b > a);
  const happened: Happened[] = i.entries.filter((e) => e.kind === 'event' || e.kind === 'change').map((e) => ({ id: e.id, day: e.day, label: e.label, kind: e.kind as 'event' | 'change', tone: e.kind === 'change' ? 'change' : (lines.find((l) => l.id === e.id)?.tone ?? 'info'), ...(e.detail ? { detail: e.detail } : {}), ...(e.params != null ? { params: e.params } : {}), ...(e.keys ? { keys: e.keys } : {}) }));
  return { series, hvpg, lines, meds, happened, full: empty ? [0, 1] : short ? [a, a + 30] : [a, b], empty, short };
}

/** a procedure's name for the chooser and its toggle: the label without its size ("TIPS 8 mm" and "TIPS 10 mm" are one, "TIPS") */
export const baseName = (label: string): string => label.replace(/\s*[\d×].*$/, '') || label;
