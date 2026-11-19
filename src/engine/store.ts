// The engine's state as the page sees it.
//  - `useEngine` (zustand): small, slow-changing facts React components read: status, preset, the headline metrics.
//  - `latest`: the newest engine frame, held outside React (the clock's engine phase reads it every frame; nothing re-renders for it).
import { create } from 'zustand';
import type { EngineFrame, Metrics } from './protocol.ts';

export type EngineStatus = 'booting' | 'ready' | 'crashed';

interface EngineState {
  status: EngineStatus;
  presetId: string | null;
  /** headline numbers of the newest frame; changes only when one moves (a card re-renders then, not 10 times a second) */
  hvpg: number | null; whvp: number | null; fhvp: number | null;
  crash: string | null;
  frames: number;
}

export const useEngine = create<EngineState>(() => ({ status: 'booting', presetId: null, hvpg: null, whvp: null, fhvp: null, crash: null, frames: 0 }));

export const latest: { frame: EngineFrame | null; version: number } = { frame: null, version: 0 };

export function adoptFrame(f: EngineFrame) {
  latest.frame = f; latest.version++;
  const m: Metrics = f.metrics;
  const s = useEngine.getState();
  if (s.hvpg !== m.hvpg || s.whvp !== m.whvp || s.fhvp !== m.fhvp) useEngine.setState({ hvpg: m.hvpg, whvp: m.whvp, fhvp: m.fhvp });
  if (s.status === 'booting' && s.presetId) useEngine.setState({ status: 'ready' });
  useEngine.setState((st) => ({ frames: st.frames + 1 }));
}
