// The talk's own UI (src/ui/DeckUi.tsx: the cards, the wallet, the presenter pill, about 320 kB of code) is its own chunk. A normal load draws the figure and the bars and never mounts it, so it is not downloaded, parsed or
// run before the first picture (24 Nov 2026, "the splash takes long": it was 20 % of the boot's JavaScript). It is read in one rung of the idle ladder (boot/warm.ts), and a talk's start waits for it (ui/shell/talk.ts show), as
// it already waits for the talk's charts, so the slot below always finds it in and mounts it in the commit that flips the mode: nothing pops in.
// Kept apart from DeckUi.tsx so the start and the ladder ask for the chunk without importing the component.
import type { ComponentType } from 'react';
import { retryImport } from '../../boot/lazy-retry.ts';

type Ui = ComponentType;
let ui: Ui | null = null;
let loading: Promise<boolean> | null = null;
let failure: unknown = null;

/** Read the talk's UI in (once; a failed read, after three tries, is asked again on the next call). Resolves true when it is in; never rejects. */
export function loadDeckUi(load: () => Promise<{ DeckUi: Ui }> = () => import('../DeckUi.tsx')): Promise<boolean> {
  if (ui) return Promise.resolve(true);
  return (loading ??= retryImport(load).then((m) => { ui = m.DeckUi; failure = null; return true; }, (e) => { failure = e; loading = null; return false; }));
}
export const deckUiReady = (): boolean => ui !== null;
/** The component, once it is in (the slot's first render reads it). */
export const deckUi = (): Ui | null => ui;
/** Why the last read failed (for chunkProblem's words), or null. */
export const deckUiFailure = (): unknown => failure;
/** For tests: forget what is held. */
export function resetDeckUi(): void { ui = null; loading = null; failure = null; }
