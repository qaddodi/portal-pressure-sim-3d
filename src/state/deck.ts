// Where the viewer is in a deck. Slide 0 is the deck's title; slides 1..n are its slides (the quick check is the last).
// The presenter (src/ui/deck) walks this; the scene and cards read it. `dir` says which way the last move went, for entrances and exits.
import { create } from 'zustand';

export type Mode = 'free' | 'deck';
interface DeckState {
  mode: Mode;
  deckId: string | null;
  slide: number;
  slideCount: number;     // slides after the title (title is slide 0)
  dir: -1 | 0 | 1;
  open(deckId: string, slideCount: number, slide?: number): void;
  close(): void;
  next(): boolean;
  back(): boolean;
  goto(slide: number): boolean;
}

export const useDeck = create<DeckState>((set, get) => ({
  mode: 'free', deckId: null, slide: 0, slideCount: 0, dir: 0,
  open: (deckId, slideCount, slide = 0) => set({ mode: 'deck', deckId, slideCount, slide: Math.max(0, Math.min(slideCount, slide)), dir: 0 }),
  close: () => set({ mode: 'free', deckId: null, slide: 0, slideCount: 0, dir: 0 }),
  goto: (slide) => {
    const { mode, slide: cur, slideCount } = get();
    if (mode !== 'deck' || slide === cur || slide < 0 || slide > slideCount) return false;
    set({ slide, dir: slide > cur ? 1 : -1 });
    return true;
  },
  next: () => get().goto(get().slide + 1),
  back: () => get().goto(get().slide - 1),
}));
