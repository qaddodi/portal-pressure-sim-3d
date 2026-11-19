// What the Tests devices on the figure are asked to show: the Doppler probe on a vessel, the FibroScan probe on an organ, the endoscope (plain, with the band ligator, or the EUS echoendoscope and its needle).
// A small store the scene reads and the Tests panes (and the cards' buttons) write; nothing here draws. bind-tests.ts keeps `on` in step with the Tests card (open on that instrument).
import { create } from 'zustand';

export type ScopeMode = 'scope' | 'band' | 'eus';
export type FibroOrgan = 'liver' | 'spleen';
/** A stent's three places the Doppler samples (topology STENT_SITES keys), or null for the vessel's own gate. */
export type DopplerSeg = 'proximal' | 'mid' | 'distal' | null;

export interface ProbeState {
  /** The ultrasound probe: on a vessel (edge ID), at its gate (a stent's sampled third in `seg`). */
  doppler: { on: boolean; edge: string; seg: DopplerSeg };
  /** The FibroScan probe on the skin over an organ. */
  fibro: { on: boolean; organ: FibroOrgan };
  /** The endoscope down the esophagus. `u`: how far in it is, 0 to 1 (unset: all the way to its work place, eased); `needle`: the EUS needle out, 0 to 1 (unset: out in 'eus', away elsewhere); `station`: the EUS-PPG's two stations. */
  endoscope: { on: boolean; mode: ScopeMode; u?: number; needle?: number; station: 'pv' | 'hv' };
  setDoppler(p: Partial<ProbeState['doppler']>): void;
  setFibro(p: Partial<ProbeState['fibro']>): void;
  setEndoscope(p: Partial<ProbeState['endoscope']>): void;
}

export const useProbes = create<ProbeState>((set) => ({
  doppler: { on: false, edge: 'PV_TRUNK', seg: null },
  fibro: { on: false, organ: 'liver' },
  endoscope: { on: false, mode: 'scope', station: 'pv' },
  setDoppler: (p) => set((s) => ({ doppler: { ...s.doppler, ...p } })),
  setFibro: (p) => set((s) => ({ fibro: { ...s.fibro, ...p } })),
  setEndoscope: (p) => set((s) => ({ endoscope: { ...s.endoscope, ...p } })),
}));
