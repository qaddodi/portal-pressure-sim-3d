// The chart data worked out at build time (scripts/bake-charts.mjs, make.ts), as the page reads it. Every chart asks here first and gets its numbers on the spot (no worker, no sweep, no empty first frame);
// what is not here (a what-if slider's value, a learner's own patient, a deck edited since the bake) is worked out live as before, drawn over the baked state when there is one.
// A deck's file is fetched when its talk opens (`loadBakedDeck`, bounded: a missing or late file only means the live path); under node (a test) it is read from disk.
import { clock } from '../../../clock/frame.ts';
import { BAKE_VERSION, engineKey, deckSig } from './key.ts';
import type { Trace } from '../../talk/table-wave.ts';

/** One state of a deck as a chart reads it (the engine's seqStep, without the snapshots). */
export interface BakedState { fp: Record<string, number | null | undefined>; params?: unknown; trail?: unknown; start?: unknown; before?: unknown }
export interface BakedDeck {
  v: number;
  /** the engine and format key (key.ts engineKey) */
  key: string;
  sig: string;
  /** results[i] of the deck's chain (calc.ts): slide i's state */
  states: (BakedState | null)[];
  /** curveKey(tool, `${deck}/${slide}`) → the curve's (or course's) worked out result */
  curves: Record<string, unknown>;
  /** the all-patients series, by slide id */
  cohort: Record<string, unknown>;
  /** the ladders' rows and healthy reference, by slide id */
  ladders: Record<string, unknown>;
  /** a summary table's own rows (a patient no slide shows), by slide id: one fingerprint for each row spec, null for a row of a slide */
  tables: Record<string, (Record<string, number | null | undefined> | null)[]>;
  /** a summary table's Doppler column: one trace for each row spec (packTrace, WAVE_SECS long), null where the model gave none, by slide id */
  waves: Record<string, (Trace | null)[]>;
  /** the healthy patient, and the patients no slide shows that this deck's planes draw (by patientKey) */
  healthy: Record<string, number | null | undefined> | null;
  patients: Record<string, Record<string, number | null | undefined> | null>;
}

// One file for each deck (a talk is fetched when it opens, with its words: about a tenth of the whole), named by the engine key.
const fetched = new Map<string, BakedDeck>();   // (in, not yet checked against the deck's words)
const held = new Map<string, BakedDeck>();      // (in and checked: what the charts read)
const loading = new Map<string, Promise<void>>();
const browser = typeof window !== 'undefined' && typeof fetch !== 'undefined';
export const CHARTS_FETCH_MS = 6000;

/** Where a deck's file is (its name carries the engine key, so a new engine is a new file and an old copy is never read for it). */
export const chartsFile = (deckId: string): string => `baked/charts-${engineKey()}-${deckId}.json`;

/** Lays a parsed file in when it is the one for this engine (it is read only after `trustBaked` has matched it with the deck). */
export function setBaked(id: string, b: BakedDeck | null): boolean {
  held.delete(id);
  if (b && b.v === BAKE_VERSION && b.key === engineKey()) { fetched.set(id, b); return true; }
  fetched.delete(id);
  return false;
}
export const forgetBaked = () => { held.clear(); fetched.clear(); loading.clear(); };

/** Fetches a deck's file once (bounded). Resolves, never rejects, when it is in or known to be missing: a deck then opens with its charts' data, or works it out live as before. */
export function loadBakedDeck(id: string): Promise<void> {
  let p = loading.get(id);
  if (!p) { p = browser ? fetchDeck(id) : Promise.resolve(); loading.set(id, p); }
  return p;
}
async function fetchDeck(id: string): Promise<void> {
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const t = ctl ? clock.afterReal(() => ctl.abort(), CHARTS_FETCH_MS) : null;
  try {
    const env = (import.meta as { env?: { BASE_URL?: string } }).env;
    const r = await fetch(`${env?.BASE_URL ?? '/'}${chartsFile(id)}`, ctl ? { signal: ctl.signal } : undefined);
    if (r.ok) setBaked(id, (await r.json()) as BakedDeck);
  } catch (e) { console.warn(`[talk] baked chart data for ${id} unavailable, working it out live:`, e instanceof Error ? e.message : e); }
  finally { if (t) clock.cancel(t); }
}

/** Under node (a test, a script) a deck's file is read from disk when it is there. `PPS_NO_BAKED=1` skips it (the maker, a test of the live path). */
function readDiskDeck(id: string): void {
  try {
    const proc = (globalThis as { process?: { getBuiltinModule?: (id: string) => unknown; env?: Record<string, string | undefined> } }).process;
    if (browser || fetched.has(id) || !proc?.getBuiltinModule || proc.env?.PPS_NO_BAKED) return;
    const fs = proc.getBuiltinModule('node:fs') as typeof import('node:fs');
    setBaked(id, JSON.parse(fs.readFileSync(new URL(`../../../../public/${chartsFile(id)}`, import.meta.url), 'utf8')) as BakedDeck);
  } catch { /* none on disk */ }
}

/** Matches a deck's file with the deck as it now is (the words it was made from): equal, the charts read it; else it is dropped and the live path runs. Call it where the deck is loaded. Returns whether the deck has baked data. */
export function trustBaked(deck: { id: string; slides: readonly unknown[] }): boolean {
  readDiskDeck(deck.id);
  const b = fetched.get(deck.id);
  if (b && b.sig === deckSig(deck)) { held.set(deck.id, b); return true; }
  held.delete(deck.id);
  return false;
}
/** A trusted deck's baked data, by the deck's id (null: none, or not for these words). */
export const bakedById = (id: string): BakedDeck | null => held.get(id) ?? null;
/** The baked curve (or course) for a card's key, from the deck its id names (`<deck>/<slide>`). */
export const bakedCurve = (id: string | undefined, key: string): unknown | null => (id ? held.get(id.split('/')[0]!)?.curves[key] ?? null : null);
/** A patient no slide shows, from any deck's file. */
export function bakedPatient(key: string): Record<string, number | null | undefined> | null {
  for (const d of held.values()) if (key in d.patients) return d.patients[key] ?? null;
  return null;
}
export function bakedHealthy(): Record<string, number | null | undefined> | null {
  for (const d of held.values()) if (d.healthy) return d.healthy;
  return null;
}
