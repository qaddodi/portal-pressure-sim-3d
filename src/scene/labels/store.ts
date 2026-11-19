// What the labels need from the talk and the viewer, in one small store the label layer subscribes to. The deck link (deck-link.ts) and the
// scene's pick write it; nothing here knows a deck.
import { create } from 'zustand';
import type { CathState } from '../../decks/schema.ts';

export interface LabelsState {
  /** Stations the slide's words point at. */
  named: ReadonlySet<string>;
  cath: CathState | null;
  /** The lens whose key the slide shows (null: none). */
  key: string | null;
  /** Blood menu option: organ names on the figure (off until the Blood menu lands in batch B1/B3). */
  organNames: boolean;
  set(p: Partial<Omit<LabelsState, 'set'>>): void;
}

export const useLabels = create<LabelsState>((set) => ({
  named: new Set(), cath: null, key: null, organNames: false,
  set: (p) => set(p),
}));
