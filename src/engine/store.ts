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
export function setParams(params: unknown) { if (params == null) return; patient.params = params; patient.paramsVersion++; }

/** Listeners handed every adopted frame (not just the newest): a trace that records the model's samples must see each frame once. Returns the remover. */
const taps = new Set<(f: EngineFrame) => void>();
export function onFrame(fn: (f: EngineFrame) => void): () => void { taps.add(fn); return () => { taps.delete(fn); }; }

/** The newest frame the engine made, whatever the page shows (the shown one is `latest`: Compare's Then view holds a pinned frame there, see `holdFrame`). */
export const live: { frame: EngineFrame | null } = { frame: null };
let held: EngineFrame | null = null;
/** Show a pinned frame in place of the live one (Compare > Then), or null to go back to the live model. The headline numbers and the timeline stay live. */
export function holdFrame(f: EngineFrame | null) {
  held = f;
  latest.frame = f ?? live.frame; latest.version++;
}

export function adoptFrame(f: EngineFrame) {
  live.frame = f;
  if (!held) { latest.frame = f; latest.version++; }
  for (const fn of taps) fn(f);
  if (f.params !== undefined) setParams(f.params);
  const m: Metrics = f.metrics;
  const s = useEngine.getState();
  const r = m as { pv?: number; ivc?: number; ra?: number } & typeof m;
  if (s.hvpg !== m.hvpg || s.whvp !== m.whvp || s.fhvp !== m.fhvp || s.pv !== r.pv || s.ivc !== r.ivc || s.ra !== r.ra) {
    useEngine.setState({ hvpg: m.hvpg, whvp: m.whvp, fhvp: m.fhvp, pv: r.pv ?? null, ivc: r.ivc ?? null, ra: r.ra ?? null });
  }
  if (s.status === 'booting' && s.presetId) useEngine.setState({ status: 'ready' });
  useEngine.setState((st) => ({ frames: st.frames + 1 }));
}
