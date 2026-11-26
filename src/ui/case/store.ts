// Where the case is (ui/case/run.ts writes it; the case bar and the stop card read it). Written when a stop is reached or left and about seven times a second while the days run (the day
// number the bar says), never per frame.
import { create } from 'zustand';
import type { Series } from '../bigtime/record.ts';
import type { View } from '../timeline/story-view.ts';
import type { CasePhase, Stop } from './types.ts';

export interface CaseState {
  phase: CasePhase;
  /** the model patient being played */
  id: string | null;
  stops: Stop[];
  /** the story the stops are of, made from the baked course when the case starts (case/story.ts): the cards' numbers read it, never the live record */
  story: View | null;
  /** the belly's litres along the baked days (case/rate.ts ascDays): what the Ascites card's balance reads */
  asc: Series | null;
  /** the stop the case is at, or last left */
  at: number;
  /** the stop the days are running to (on the way), else null */
  to: number | null;
  /** the day the bar says */
  day: number;
  /** on the way, and paused */
  paused: boolean;
  /** left: the day the patient became the learner's own (the line over the play bar says it); null otherwise */
  leftDay: number | null;
}

export const CASE_OFF: CaseState = { phase: 'off', id: null, stops: [], story: null, asc: null, at: 0, to: null, day: 0, paused: false, leftDay: null };
export const useCase = create<CaseState>(() => ({ ...CASE_OFF }));
