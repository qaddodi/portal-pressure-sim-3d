// The engine's state as the page sees it.
//  - `useEngine` (zustand): small, slow-changing facts React components read: status, preset, the headline metrics.
//  - `latest`: the newest engine frame, held outside React (the clock's engine phase reads it every frame; nothing re-renders for it).
import { create } from 'zustand';
import type { EngineFrame, Metrics } from './hales/host/protocol.d.ts';

export type EngineStatus = 'booting' | 'ready' | 'crashed';

interface EngineState {
  status: EngineStatus;
  presetId: string | null;
  /** headline numbers of the newest frame; changes only when one moves (a card re-renders then, not 10 times a second) */
  hvpg: number | null; whvp: number | null; fhvp: number | null;
  /** portal vein, IVC (suprahepatic) and right atrium pressures, mmHg */
  pv: number | null; ivc: number | null; ra: number | null;
  crash: string | null;
  frames: number;
}

export const useEngine = create<EngineState>(() => ({ status: 'booting', presetId: null, hvpg: null, whvp: null, fhvp: null, pv: null, ivc: null, ra: null, crash: null, frames: 0 }));

export const latest: { frame: EngineFrame | null; version: number } = { frame: null, version: 0 };

/** The healthy patient's reference (node pressures, edge flows, hepatic lymph in mL/min): what flows and congestion are measured against. */
export interface HealthyRef { P: Float64Array | number[]; Q: Float64Array | number[]; hepLymph?: number }
/**
 * Outside React, read in clock systems:
 *  - `reference`: the healthy reference, fetched once at boot (null until then)
 *  - `params`: the patient's parameters, kept from presetLoaded and from every frame that carries them (frames carry them only on a change);
 *    `paramsVersion` counts changes.
 */
export const patient: { reference: HealthyRef | null; params: unknown; paramsVersion: number } = { reference: null, params: null, paramsVersion: 0 };
/** Bumps on every change to the page's parameter copy (and, from the card layer, to the history list), so a card that lists the parameters re-reads. The tick is a
 *  function of the copy: `setParams` is the one place the copy changes, and it tells React, so no path (a slide, a link, a restore, a morph landing, a worker echo) can leave a card stale. */
export const useParamsTick = create<{ tick: number }>(() => ({ tick: 0 }));
export function setParams(params: unknown) { if (params == null) return; patient.params = params; patient.paramsVersion++; useParamsTick.setState((s) => ({ tick: s.tick + 1 })); }

/** How many `setParams` messages the page has sent to this host. The host counts the ones it has taken and stamps every frame with it (`paramsRev`): a frame stamped with fewer was built
 *  before the host saw the page's latest change, so its `params` are older than the page's copy and are dropped (audit W5: a slider value must never be put back by a frame in flight). */
let sentRev = 0;
export const nextParamsRev = (): number => ++sentRev;
/** A new host starts counting from 0 again. */
export const resetParamsRev = (): void => { sentRev = 0; };
/** Whether a frame's parameters are older than the page's own copy. A frame with no stamp (an older host) is never stale. */
export const staleParams = (f: { paramsRev?: number }): boolean => f.paramsRev !== undefined && f.paramsRev < sentRev;

/** Listeners handed every adopted frame (not just the newest): a trace that records the model's samples must see each frame once. Returns the remover. */
const taps = new Set<(f: EngineFrame) => void>();
export function onFrame(fn: (f: EngineFrame) => void): () => void { taps.add(fn); return () => { taps.delete(fn); }; }

/** The newest frame the engine made, whatever the page shows (the shown one is `latest`: Compare's Then view holds a pinned frame there, see `holdFrame`). */
export const live: { frame: EngineFrame | null } = { frame: null };
let held: EngineFrame | null = null;
/** The parameters of the held frame (Compare's Then: the moment's own stent, clot, cirrhosis and spleen), or null while the live moment is shown (or a frame forged from the live model is). */
let heldParams: unknown = null;
/** Show a pinned frame in place of the live one (Compare > Then), or null to go back to the live model. The headline numbers and the timeline stay live.
 *  `params` are the parameters that frame was made with: the figure, the labels and the Tests panes read them through `shownParams`, so a held frame and its anatomy never disagree
 *  (audit W1). Omit them for a frame forged from the live model (Force-all): it is drawn with the live parameters. */
export function holdFrame(f: EngineFrame | null, params?: unknown) {
  const was = heldParams;
  held = f;
  heldParams = f && params !== undefined && params !== null ? params : null;
  latest.frame = f ?? live.frame; latest.version++;
  if (was !== heldParams) useParamsTick.setState((s) => ({ tick: s.tick + 1 }));   // (a card that reads the shown parameters reads them again)
}
/** The parameters of the moment that is SHOWN: the held frame's own, else the patient's. Everything that draws or words the figure reads these. The edit paths (`currentParams`, `sendParams`,
 *  `updateParams`) keep reading `patient.params`: an edit is always to the live patient. */
export const shownParams = (): unknown => heldParams ?? patient.params;
/** Whether a moment other than the live one is on show with its own parameters (Compare's Then). It is for viewing only. */
export const viewingHeld = (): boolean => heldParams !== null;
let leaveHeld: (() => void) | null = null;
/** The owner of the held view (Compare) says how it goes back to Now (eased, as its own switch does). */
export function onLeaveHeld(fn: (() => void) | null): void { leaveHeld = fn; }
/** An edit is about to be made to the live patient: a held moment goes back to Now first, so a card never shows a patient who does not exist. */
export function endHeldView(): void { if (heldParams === null) return; if (leaveHeld) leaveHeld(); else holdFrame(null); }

export function adoptFrame(f: EngineFrame) {
  live.frame = f;
  if (!held) { latest.frame = f; latest.version++; }
  for (const fn of taps) fn(f);
  if (f.params !== undefined && !staleParams(f)) setParams(f.params);
  const m: Metrics = f.metrics;
  const s = useEngine.getState();
  const r = m as { pv?: number; ivc?: number; ra?: number } & typeof m;
  if (s.hvpg !== m.hvpg || s.whvp !== m.whvp || s.fhvp !== m.fhvp || s.pv !== r.pv || s.ivc !== r.ivc || s.ra !== r.ra) {
    useEngine.setState({ hvpg: m.hvpg, whvp: m.whvp, fhvp: m.fhvp, pv: r.pv ?? null, ivc: r.ivc ?? null, ra: r.ra ?? null });
  }
  if (s.status === 'booting' && s.presetId) useEngine.setState({ status: 'ready' });
  useEngine.setState((st) => ({ frames: st.frames + 1 }));
}
