// What the Endoscopy tab is doing, for the scene's devices (the endoscope and the EUS needle: src/scene/devices). Written by the pane, read by anyone; it holds no picture.
//   active   the tab is on screen (its pane is mounted)
//   view     the endoscopic view or Wall mechanics
//   bands    the band count the model had at the last frame the pane saw
//   eus      the EUS-PPG measurement: 'idle', 'run' (the needle is working), 'hold' (the result is held a few seconds); `step` the step on show (-1 none)
import { create } from 'zustand';

export type EndoView = 'scope' | 'wall';
export type EusPhase = 'idle' | 'run' | 'hold';

export interface ScopeState {
  active: boolean;
  view: EndoView;
  bands: number;
  eus: EusPhase;
  step: number;
  setActive(on: boolean): void;
  setView(v: EndoView): void;
  setBands(n: number): void;
  setEus(phase: EusPhase, step?: number): void;
}

export const useScope = create<ScopeState>((set, get) => ({
  active: false, view: 'scope', bands: 0, eus: 'idle', step: -1,
  setActive: (active) => set({ active }),
  setView: (view) => set({ view }),
  setBands: (bands) => { if (get().bands !== bands) set({ bands }); },
  setEus: (eus, step = -1) => set({ eus, step }),
}));
