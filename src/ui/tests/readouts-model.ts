// The Readouts pane's rows, worked out from the model's metrics exactly as 2D's readouts-pane.js and dock.js do: each tile's value, its decimals and unit, the status word and
// colour band (the tile's own `s` and `st`), and where it sits on its scale bar. Pure: the same metrics give the same rows. The tile table is dock.js's, copied.
import { TILES, GROUPS, hooks } from './copied/dock-tiles.copied.js';
import { VITALS, vitalReading, bpText } from './copied/vital-read.copied.js';
import { SCALE, RATE } from './copied/table-marks.copied.js';
import { fmt, clamp } from './copied/num.copied.js';
import { SEV_OF_RATE, NOT_MEASURABLE, NOT_SHOWN } from '../../engine/hales/portal/pressure-cuts.js';
import { hvpgBlockedBy } from '../../engine/hv-flag.ts';
import type { M } from './frame.ts';
import { useMeasured } from './hidden.ts';

// the HVPG tile's measured value (2D dock.js TILES: `measured: () => store.get().lastHVPG`)
(hooks as { lastHVPG: () => unknown }).lastHVPG = () => useMeasured.getState().lastHVPG;

export { hooks };
export type Band = 'ok' | 'caution' | 'danger' | 'critical' | 'none';

export interface Row {
  id: string;
  /** the full name ("Portal pressure") and the short one a narrow card uses */
  name: string; short: string;
  /** the printed value ("11.1") and its unit ("mmHg"), or the placeholder when there is none */
  value: string; unit: string;
  /** a blood pressure is written 120/80 (93): the part before the mean */
  pre?: string;
  word: string; band: Band;
  /** the unit and its small extra ("%" and " of rupture threshold"), as the 2D tile writes them in two pieces (tile-el.js) */
  u?: string; ux?: string;
  /** the blood pressure's three pieces: "120/80", then the mean ("93") in brackets (readouts-pane.js .v-bp, .v-map) */
  bp?: { pre: string; mean: string };
  /** the change from the pinned moment, in place of the word (readouts-pane.js update: "+1.2 vs then", "same as then") */
  cmp?: { text: string; dir: 'up' | 'down' | 'same' };
  /** 0..1 along the scale bar, the bar's cut-off ticks (0..1), and where zero sits (a bar of a signed reading fills from it) */
  fill: number; ticks: number[]; zero: number;
  /** the engine's Why? id, and the pane a tap opens instead (Ascites opens its own pane) */
  why?: string; pane?: string;
  title: string;
  /** the sentence a screen reader gets */
  aria: string;
}

const shown = (v: number, d: number) => Number(v.toFixed(d));
const pos = (lo: number, hi: number, v: number) => clamp((v - lo) / (hi - lo), 0, 1);

export const GROUP_LIST = GROUPS as unknown as ReadonlyArray<readonly [string, string]>;
/** The names of the systemic readouts (readouts-pane.js SYSTEMIC): full, short. */
export const SYSTEMIC: ReadonlyArray<readonly [string, string, string]> = [['map', 'Blood pressure', 'BP'], ['hr', 'Heart rate', 'Heart rate'], ['co', 'Cardiac output', 'Cardiac output'], ['ra', 'Right atrial pressure', 'RA pressure'], ['hb', 'Hemoglobin', 'Hb']];
export const SYSTEMIC_CAP = 'Systemic';

/** What a tile is before it has a number: its names, unit, bar marks and what a tap does (the Readouts pane draws these once; the numbers come from readouts/live.ts). */
export interface Static {
  id: string; name: string; short: string; u: string; ux: string; ticks: number[]; zero: number; why?: string; pane?: string; title: string;
  /** a systemic reading (its two names, and the blood pressure's three pieces) */
  vital: boolean; bp: boolean;
}
const posOf = (S: readonly [number, number, ...unknown[]]) => (v: number) => pos(S[0], S[1], v);
/** The tiles of each group, in the 2D dock's order (dock.js TILES, GROUPS). */
export function tileStatics(): { group: string; label: string; tiles: Static[] }[] {
  return GROUP_LIST.map(([g, label]) => ({
    group: g, label,
    tiles: (TILES as Array<Record<string, any>>).filter((t) => t.group === g).map((t) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      const p = posOf(t.scale);
      return { id: t.id as string, name: t.k as string, short: (t.ks ?? t.k) as string, u: t.u as string, ux: (t.ux as string) ?? '', ticks: (t.ticks as number[]).map(p), zero: p(0), why: t.why as string | undefined, pane: t.pane as string | undefined, title: (t.title ?? t.k) as string, vital: false, bp: false };
    }),
  }));
}
/** The systemic readings (readouts-pane.js SYSTEMIC), each with its data card tile's own scale and cut-offs. */
export function vitalStatics(): Static[] {
  return SYSTEMIC.map(([id, name, short]) => {
    const def = VITALS.find((x: { id: string }) => x.id === id)!, S = (SCALE as unknown as Record<string, [number, number, number[]]>)[id]!, p = posOf(S);
    return { id, name, short, u: def.u as string, ux: '', ticks: S[2].map(p), zero: 0, why: def.why as string | undefined, title: def.title as string, vital: true, bp: !!def.s };
  });
}

/** A tile's number for a frame: null when the HVPG cannot be measured (Budd–Chiari takes no catheter) or the tile hides its reading and none was measured. */
export function readoutValue(t: { id: string; v(m: M): number; hideKey?: string; measured?: () => { hvpg: number } | null }, m: M, params: unknown, hidden: ReadonlySet<string> | null = null): number | null {
  if (t.id === 'hvpg' && hvpgBlockedBy(params)) return null;
  if (!hidden?.has(t.hideKey ?? '')) return t.v(m);
  const meas = t.id === 'hvpg' ? t.measured?.() : null;
  return meas ? meas.hvpg : null;
}

/** A tile's change from the pinned moment (2D readouts-pane.js: the difference of the tile's own number, to its last printed digit). */
export function changeFrom(t: { v(m: M): number; d: number }, now: number, then: M | null): Row['cmp'] {
  if (!then) return undefined;
  const d = now - t.v(then);
  const same = Math.abs(d) < Math.pow(10, -t.d) * 0.5;
  return { text: same ? 'same as then' : `${d > 0 ? '+' : '−'}${fmt(Math.abs(d), t.d)} vs then`, dir: same ? 'same' : d > 0 ? 'up' : 'down' };
}

export function tileRows(m: M, params: unknown, hidden: ReadonlySet<string> | null = null, then: M | null = null): { group: string; rows: Row[] }[] {
  return GROUP_LIST.map(([g]) => ({
    group: g,
    rows: TILES.filter((t: { group: string }) => t.group === g).map((t: Record<string, any>) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      const v = readoutValue(t as never, m, params, hidden);
      const lo = t.scale[0] as number, hi = t.scale[1] as number;
      const measured = v != null && !!hidden?.has(t.hideKey ?? '');
      const base = { u: t.u as string, ux: (t.ux as string) ?? '', id: t.id as string, name: t.k as string, short: (t.ks ?? t.k) as string, unit: (t.u as string) + ((t.ux as string) ?? ''), why: t.why as string | undefined, pane: t.pane as string | undefined, title: (t.titleOf ? t.titleOf(m) : t.title) as string, ticks: (t.ticks as number[]).map((x) => pos(lo, hi, x)), zero: pos(lo, hi, 0) };
      if (v == null) {
        const nm = t.id === 'hvpg' && hvpgBlockedBy(params);
        const word = nm ? NOT_MEASURABLE : 'Not measured';
        return { ...base, value: nm ? NOT_SHOWN : '?', word, band: 'none' as Band, fill: 0, aria: `${t.title ?? t.k}: ${word.toLowerCase()}` };
      }
      const vs = shown(v, t.d as number);
      const word = measured ? 'Measured' : (t.s(vs, m) as string), band = t.st(vs, m) as Band;
      const cmp = measured ? undefined : changeFrom(t as never, v, then);
      return { ...base, cmp, value: fmt(v, t.d as number), word, band, fill: pos(lo, hi, v), aria: `${t.title ?? t.k}: ${fmt(v, t.d as number)} ${base.unit}, ${word}` };
    }),
  }));
}

/** The systemic rows: each with its tile's own scale, cut-offs, word and colour (table-marks SCALE and RATE). `state` keeps the vitals' 1.5 s hold between calls (vitalReading). */
export function vitalRows(m: M, running: boolean, now: number, state: Record<string, object>, then: M | null = null): Row[] {
  return SYSTEMIC.map(([id, name, short]) => {
    const def = VITALS.find((x: { id: string }) => x.id === id)!;
    const x = (state[id] ??= { v: def }) as { v: typeof def; r?: { v: number; bad: boolean; s: number; d: number } };
    const r = vitalReading(x as never, m, running, now) as { v: number; s: number; d: number };
    const S = (SCALE as unknown as Record<string, [number, number, number[]]>)[id]!;
    const none = !Number.isFinite(r.v);
    const [cls, word] = none ? [null, 'Not measured'] : (RATE as unknown as Record<string, (v: number, o: object) => readonly [string, string]>)[id]!(shown(r.v, def.d), def.s ? { sbp: r.s } : {});
    const band = (SEV_OF_RATE as Record<string, Band>)[cls ?? ''] ?? 'none';
    const text = def.s ? bpText(r.s, r.d, r.v) : fmt(r.v, def.d);
    const bp = def.s && !none && Number.isFinite((r as { s: number }).s) && Number.isFinite((r as { d: number }).d) ? { pre: `${Math.round((r as { s: number }).s)}/${Math.round((r as { d: number }).d)}`, mean: fmt(r.v, def.d) } : undefined;
    return { id, name, short, u: def.u, bp, value: none ? '?' : def.s ? text : fmt(r.v, def.d), unit: def.u, word, band, fill: none ? 0 : pos(S[0], S[1], r.v), ticks: S[2].map((c) => pos(S[0], S[1], c)), zero: 0, why: def.why, title: def.title,
      aria: `${def.title}: ${none ? 'not measured' : `${text} ${def.u}, ${word}`}` };
  });
}

/** The tab's own reading: how many readouts are past a cut-off right now. (The 2D count also took the abdominal perfusion pressure, which has no cut-off, so a healthy patient read "1 abnormal": it is left out here.) */
export function readoutsSummary(m: M, params: unknown): string {
  let n = 0;
  for (const t of TILES as Array<Record<string, any>>) { const v = readoutValue(t as never, m, params); if (v == null) continue; const b = t.st(shown(v, t.d), m); if (b !== 'ok' && b !== 'none') n++; } // eslint-disable-line @typescript-eslint/no-explicit-any
  return n ? `${n} abnormal` : 'All normal';
}
