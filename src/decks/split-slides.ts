// The slides that show two livers side by side (the split orbit, docs/approved/split-orbit.md): the healthy liver on the left, the slide's own patient on the right.
// A table, not a field of the copied 2D slides: those files are written by scripts/copy-decks.mjs and never edited. Keyed by deck id and slide id.
export interface SplitSlide { /** the words over the right figure (the slide's patient) */ label: string; /** the words over the left figure */ against: string }

const TABLE: Readonly<Record<string, SplitSlide>> = {
  'hvpg/presin': { label: 'Schistosomiasis', against: 'Healthy' },
  'hvpg/heart': { label: 'Right heart failure', against: 'Healthy' },
};

/** Whether the split orbit is shown: off for everyone until it is approved; `?split` on the address turns it on. */
export const splitEnabled = (): boolean => typeof location !== 'undefined' && /(^|[?&])split(=|&|$)/.test(location.search);

export const splitOf = (deckId: string | null | undefined, slideId: string | null | undefined): SplitSlide | null => (deckId && slideId && splitEnabled() ? TABLE[`${deckId}/${slideId}`] ?? null : null);
/** Every deck id that has a split slide (a deck without one never asks for the twin). */
export const splitDecks = (): string[] => [...new Set(Object.keys(TABLE).map((k) => k.split('/')[0]!))];
