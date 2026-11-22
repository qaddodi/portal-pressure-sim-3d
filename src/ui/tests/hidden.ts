// The readouts hidden right now (2D store.js hiddenNow): a set a view hides and, in Explore, the true HVPG (the wedged and free hepatic vein pressures with it) while it cannot be
// shown. The 2D app first hid the HVPG until the catheter procedure had measured it; on 11 Nov 2026 the Always show HVPG setting was removed and the HVPG always shows
// (store.js `showHvpg`, now fixed true), so what is left hidden in Explore is a Budd-Chiari patient's: the hepatic veins take no catheter (pressure-cuts.js hvBlocked), so the true HVPG
// stays unmeasured whatever else is set. A Presenter slide shows the figures as they are. Every Tests pane reads this one set (the Pressure chart and its three figures, the Readouts, the
// Trials card, Over time), so they say "not measured" together.
import { hvBlocked } from '../../engine/hales/portal/pressure-cuts.js';
import { create } from 'zustand';
import { useShell } from '../shell/store.ts';
import { useEngine, shownParams } from '../../engine/index.ts';
import { talkOn, useTalkOn } from '../../state/deck.ts';

/** 2D store.js `showHvpg`: the HVPG shows without having been measured. Set false to bring the older rule back (hidden until the HVPG procedure has run, or Always show). */
export const SHOW_HVPG = true;

/** What the HVPG procedure measured for this patient (2D store.js lastHVPG, hvpgMeasured: set when the measurement finishes, cleared when a new patient is loaded). */
export interface Measured { fhvp: number; whvp: number; hvpg: number }
export const useMeasured = create<{ hvpgMeasured: boolean; lastHVPG: Measured | null; mark(r: Measured): void; clear(): void }>((set) => ({
  hvpgMeasured: false, lastHVPG: null,
  mark: (r) => set({ hvpgMeasured: true, lastHVPG: { fhvp: r.fhvp, whvp: r.whvp, hvpg: r.hvpg } }),
  clear: () => set({ hvpgMeasured: false, lastHVPG: null }),
}));
// a new patient is a new measurement (2D main.js: presetId, lastHVPG: null, hvpgMeasured: false)
useEngine.subscribe((s, p) => { if (s.presetId !== p.presetId) useMeasured.getState().clear(); });

const blocked = { params: null as unknown, on: false };
const blockedNow = (params: unknown): boolean => { if (blocked.params !== params) { blocked.params = params; blocked.on = !!params && hvBlocked(params); } return blocked.on; };
const cache = { base: undefined as ReadonlySet<string> | null | undefined, set: null as ReadonlySet<string> | null };

export interface HiddenIn {
  /** the view's own hidden set (2D st.hiddenReadouts) */
  base?: ReadonlySet<string> | null;
  /** a Presenter slide or the tour is up (2D mode !== 'explore' || presenting) */
  presenting?: boolean;
  /** the HVPG procedure has run for this patient (2D st.hvpgMeasured) */
  measured?: boolean;
  /** the patient's parameters */
  params: unknown;
}

/** 2D hiddenNow: the set of readouts hidden now, or null for none. */
export function hiddenOf({ base = null, presenting = false, measured = false, params }: HiddenIn): ReadonlySet<string> | null {
  if (presenting || base?.has('trueHVPG')) return base;
  if ((measured || SHOW_HVPG) && !blockedNow(params)) return base;
  if (cache.base !== base || !cache.set) { cache.base = base; cache.set = new Set([...(base ?? []), 'trueHVPG']); }
  return cache.set;
}

/** The set for the patient now on show (outside React). */
export const hiddenNow = (): ReadonlySet<string> | null => hiddenOf({ presenting: talkOn(), measured: useMeasured.getState().hvpgMeasured, params: shownParams() });
/** The same, as a hook: a pane re-renders when the patient or the mode changes. */
export function useHidden(): ReadonlySet<string> | null {
  useEngine((s) => s.presetId); useTalkOn(); useMeasured((s) => s.hvpgMeasured);
  return hiddenNow();
}

/** The note under the IR pane's buttons (2D hvpg-proc.js paintSide): in Explore it says whether the HVPG readouts are hidden until measured; on a slide, that they are the tile's. */
export function hvpgNote(presenting: boolean, measured: boolean): string {
  if (presenting) return 'The same numbers as the HVPG tile.';
  return SHOW_HVPG ? 'The HVPG readouts are always shown.' : measured ? 'Measured: the HVPG readouts stay live until a new patient is loaded.' : 'The HVPG readouts stay hidden until the HVPG is measured here.';
}
