// Where the case is (ui/case/run.ts writes it; the case bar and the stop card read it). Written when a stop is reached or left and about seven times a second while the days run (the day
// number the bar says), never per frame.
import { create } from 'zustand';
import type { CasePhase, Stop } from './types.ts';

export interface CaseState {
  phase: CasePhase;
  /** the model patient being played */
  id: string | null;
  stops: Stop[];
  /** the stop the case is at, or last left */
  at: number;
  /** the stop the days are running to (on the way), else null */
  to: number | null;
  /** the day the bar says */
  day: number;
  /** on the way, and paused */
  paused: boolean;
}

export const CASE_OFF: CaseState = { phase: 'off', id: null, stops: [], at: 0, to: null, day: 0, paused: false };
export const useCase = create<CaseState>(() => ({ ...CASE_OFF }));
