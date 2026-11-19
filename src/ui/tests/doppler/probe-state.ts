// The Doppler's probe and sample gate, outside the pane: the pane is only in the page while it is open, and the figure's ultrasound probe (the scene's device) reads the same vessel and
// shows only while the Doppler is the instrument on show. The vessel is the model's own (the frame names the vessel the worker's `vel` channel follows: engine `probe` message);
// the gate is a stent's sample spot (2D store.dopGate, shared with the figure, whose stent glows in the Doppler's green over that third).
import { create } from 'zustand';
import { engine, onFrame } from '../../../engine/index.ts';
import { useTests } from '../store.ts';

export type Gate = 'proximal' | 'mid' | 'distal' | 'site';
interface DopplerProbe {
  /** the vessel (edge id) the probe samples */
  probe: string;
  /** where along a TIPS or DIPS the trace and reading come from, or null for the 2D default ('mid') */
  gate: Gate | null;
  setGate(g: Gate | null): void;
  /** the pane's own reading (its velocity in cm/s as the strip prints it): what the figure's callout at the probe's gate says; null while the pane is shut */
  reading: DopplerReading | null;
  setReading(r: DopplerReading | null): void;
}

export interface DopplerReading { vel: string; none: boolean; acquiring: boolean }

export const useDopplerProbe = create<DopplerProbe>((set) => ({
  probe: 'PV_TRUNK', gate: null, reading: null,
  setGate: (gate) => set({ gate }),
  setReading: (reading) => set((s) => (s.reading && reading && s.reading.vel === reading.vel && s.reading.none === reading.none && s.reading.acquiring === reading.acquiring ? s : { reading })),
}));

let bound = false;
/** Follow the model's frames for the vessel it samples (idempotent). The Tests card calls it at start; reading the hooks below calls it too. */
export function bindDopplerProbe(): void {
  if (bound) return;
  bound = true;
  onFrame((f) => { const id = (f as unknown as { probe?: string }).probe; if (id && id !== useDopplerProbe.getState().probe) useDopplerProbe.setState({ probe: id }); });
}
bindDopplerProbe();

/** Ask the model to sample another vessel (the vessel menu, a slide, a vessel card's Doppler button). */
export function setDopplerProbe(id: string): void {
  if (id === useDopplerProbe.getState().probe) return;
  useDopplerProbe.setState({ probe: id });
  engine().send({ type: 'probe', id });
}

/** The vessel on the probe now. */
export const dopplerProbeId = (): string => useDopplerProbe.getState().probe;
/** True while the Doppler is the instrument on show in the Tests card (the scene's ultrasound probe stands on the vessel then). */
export const dopplerOpen = (): boolean => { const t = useTests.getState(); return t.open && t.pane === 'doppler'; };
/** The same as a hook: re-renders when the card opens, closes or changes instrument. */
export const useDopplerOpen = (): boolean => useTests((s) => s.open && s.pane === 'doppler');
