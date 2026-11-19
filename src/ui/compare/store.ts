// Compare's state: the moment pinned (A, 2D's name for it), and which of Then, Now and Change the figure shows. There is no Compare mode: unpinning ends it (2D compare.js).
import { create } from 'zustand';
import type { Pinned } from '../timeline/model.ts';

export type CompareView = 'A' | 'B' | 'D';
export interface Pin extends Pinned {
  /** the patient's name at that moment */
  label: string;
  /** the clock at that moment ("Day 142", "0:14") */
  when: string;
  /** the changes that were on then, by label */
  changes: string[];
  /** a talk may name the two ends (2D `names`) */
  names?: [string, string];
}
interface CompareState {
  snap: Pin | null;
  view: CompareView;
  pin(p: Pin): void;
  setView(v: CompareView): void;
  stop(): void;
}
export const useCompare = create<CompareState>((set, get) => ({
  snap: null, view: 'B',
  pin: (p) => set({ snap: p, view: 'B' }),
  setView: (view) => { if (get().snap) set({ view }); },
  stop: () => { if (get().snap) set({ snap: null, view: 'B' }); },
}));
