// The slide's procedure as the teaching card shows it (2D presenter-lapse.js procEl): its steps, the one on show, and whether it can play on this patient. Written by procs-link.ts
// when a step changes (never per frame), read by ui/cards/ProcRow.tsx.
import { create } from 'zustand';

export interface ProcState {
  /** `${deck}/${slide}` the state belongs to ('' none) */
  key: string;
  /** the steps' words: [id, title, caption, short, …] of the spec(s) */
  steps: string[][];
  /** the step the figure is on (-1 none yet), and the one the card rings (the last reached) */
  at: number;
  phase: 'idle' | 'wait' | 'play' | 'done';
  /** why it cannot play on this patient ('' it can) */
  why: string;
  name: string;
}
export const NO_PROC: ProcState = { key: '', steps: [], at: -1, phase: 'idle', why: '', name: '' };
export const useProc = create<ProcState>(() => NO_PROC);
export const setProc = (p: Partial<ProcState>): void => useProc.setState(p);
export const clearProc = (): void => useProc.setState(NO_PROC, true);
