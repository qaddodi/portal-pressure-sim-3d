// What the room has committed to on the slide that asked (decks/interact.ts): the option it chose or the number it guessed, and that it has committed. Kept for the slide on show only; leaving
// the slide forgets it, so coming back asks again. The card reads this and nothing else; the presenter never waits on it (Next always goes on).
import { create } from 'zustand';

export interface InteractState { key: string; answer: number | null; committed: boolean }
const none: InteractState = { key: '', answer: null, committed: false };

export const useInteract = create<InteractState & {
  /** the slide on show asks afresh; the same slide again keeps what was committed */
  open(key: string): void;
  commit(key: string, answer: number | null): void;
}>((set, get) => ({
  ...none,
  open: (key) => { if (get().key !== key) set({ key, answer: null, committed: false }); },
  commit: (key, answer) => { if (get().key === key && !get().committed) set({ answer, committed: true }); },
}));
