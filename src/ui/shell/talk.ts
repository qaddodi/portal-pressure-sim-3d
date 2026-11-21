// Starting and leaving a talk. The talk's own UI (src/ui/DeckUi.tsx) opens its deck when it mounts; leaving puts the deck store back to free play.
// A talk is a built-in deck (src/decks/registry.ts) or one of your own (a script or an imported deck kept on this device, ui/deck/script-library.ts).
import { useDeck } from '../../state/deck.ts';
import { useShell } from './store.ts';
import { useUi } from '../ui-store.ts';
import { cel } from '../../scene/api.ts';
import { openById, cancelOpen } from '../deck/deck-of.ts';
import { W } from '../deck/words.ts';
import type { Deck } from '../../decks/schema.ts';
import { rememberFocus } from './talk-focus.ts';
import { captureSaved, restoreSaved, type Saved } from '../talk/deck-model.ts';
import { loadToolCard, toolCardReady } from '../talk/tool-card-load.ts';
import { coverUp, coverDown } from './curtain.ts';
import { dipIn, dipOut } from './figure-dip.ts';
import { onLanded } from '../deck/landing.ts';
import { rail, OUT_DONE } from '../cards/rail.ts';
import { D_SMALL, reduced } from '../a11y/motion.ts';

let saved: Saved | null = null;
let chartsAsked = false;
/** A start overtaken by a newer start, or by leaving (2D startGen): the older one installs nothing. */
let startGen = 0;
let stopping = false;
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
/** The slides' fonts, every subset they draw from, loaded under the start's cover (2D fontsIn): a subset is otherwise fetched on its first use and its words show in a stand-in first, then swap and change size. */
const fontsIn = (): Promise<unknown> => (typeof document !== 'undefined' && document.fonts?.load
  ? Promise.race([Promise.all(['400 16px Inter', '600 16px Inter', '600 32px "Source Serif 4"'].map((f) => document.fonts.load(f, 'Aāαἀ').catch(() => undefined))), wait(1500)])
  : Promise.resolve());

/** Opens a talk at a slide (the 2D slide number minus one: 0 is the outline). Returns false, and opens nothing, when there is no such talk. A built-in talk whose data is read
 *  when it opens (its own small chunk) opens as soon as it is in: `openById` is the one path, for the menu, the search, a link on a cold load and the debug page. */
export function startTalk(deckId: string, at = 0): boolean {
  return openById(deckId, at, { open: show, fail: () => useShell.getState().say(W.notFound, 'bad') });
}
function show(deck: Deck, at: number): void {
  // a talk's charts are their own chunk (ui/talk/ToolCard.tsx): the talk opens once they are in, so no slide's card shows before its chart can draw
  // (asked once: where they cannot be fetched the talk still opens, and a card asks again when it mounts)
  if (!toolCardReady() && !chartsAsked) { chartsAsked = true; void loadToolCard().then(() => show(deck, at)); return; }
  void begin(deck, at);
}
/** The start is one composed reveal (2D presenter-start.js start): a calm "Preparing the slides" cover fades over the screen, the projector layout, the first patient and the first slide are set
 *  up under it, and it fades away once the first slide has landed (the camera still, its cards in). */
async function begin(deck: Deck, at: number): Promise<void> {
  const mine = ++startGen;
  await Promise.all([coverUp(deck.title), fontsIn()]);
  if (mine !== startGen) return;
  rememberFocus(typeof document !== 'undefined' ? document.activeElement : null, useShell.getState().mode === 'deck');   // (focus returns here when the talk ends: talk-focus.ts)
  if (useShell.getState().mode !== 'deck') saved = captureSaved();   // (starting another talk while one runs keeps the patient from before the first)
  cel.setView('body');
  // (the cover lifts at the first landing the new talk makes; landing.ts begins it once the talk's stops are in)
  const off = onLanded(() => { off(); if (mine === startGen) void coverDown(); });
  useUi.getState().openDeck(deck, at);
  useShell.setState({ mode: 'deck', view: 'anatomic', sheet: null, dialog: null });
}

/** The address of a talk that has ended carries no talk (2D stop: a reload, or a tab the phone discarded and brings back, must not start it again from the link that opened it). */
export function cleanAddress(): void {
  try {
    const u = new URL(location.href);
    if (!u.searchParams.has('script')) return;
    u.searchParams.delete('script'); u.searchParams.delete('slide');
    history.replaceState(null, '', u.pathname + u.search + u.hash);
  } catch { /* no history here */ }
}

/** The talk is taken down at once (nothing eases here: `stopTalk` is the way a person leaves; this is what it ends with, and what a test or the debug page uses). */
export function leaveTalk(): void {
  cancelOpen();   // (a talk still being read does not open over what the person went to instead)
  startGen++; void coverDown();
  useDeck.getState().close(); useUi.getState().openDeck(null); useShell.setState({ mode: 'free', sheet: null });
  cleanAddress();
  const s = saved; saved = null;
  if (s) void restoreSaved(s);
}

/** Leaving the talk, every way (Esc, ✕, Finish, a swipe past the last slide), as 2D's stop() and putHealthy: the cards and the presenter's bar fade out (D_SMALL, on the rail), then the talk is taken down
 *  and the figure dims to 22 % while the patient the person came with is put back and the view is fitted, then the dim lifts. Nothing snaps: the one path, so Esc and ✕ end a talk the way Finish does. */
export function stopTalk(): void {
  if (stopping || useShell.getState().mode !== 'deck') return;
  stopping = true; cancelOpen(); startGen++; void coverDown();
  void (async () => {
    try {
      const cards = [...document.querySelectorAll<HTMLElement>('.dk-card[data-card]:not([data-phase="out"])')];
      const reduce = reduced();
      for (const c of cards) {
        const plate = c.previousElementSibling?.classList.contains('dk-plate') ? (c.previousElementSibling as HTMLElement) : null;
        rail.leave(plate ? [c, plate] : [c], { dir: 1, par: 1, reduce });
      }
      // the presenter's bar and what else floats over the talk fade with them (2D fades the cards and their glass, then chrome comes back in)
      for (const b of document.querySelectorAll<HTMLElement>('.dk-bar, .pz-veil')) b.animate?.([{ opacity: getComputedStyle(b).opacity }, { opacity: 0 }], { duration: D_SMALL, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' });
      await wait(cards.length ? (reduce ? D_SMALL : OUT_DONE) + 40 : 0);
      const who = {}, s = saved;
      const dim = s ? dipIn(who) : null;   // (the dim begins with the talk's end, under the chrome coming back)
      cancelOpen();
      useDeck.getState().close(); useUi.getState().openDeck(null); useShell.setState({ mode: 'free', sheet: null });
      cleanAddress();
      saved = null;
      if (s) {
        await dim;
        await restoreSaved(s);   // (under the dim: the patient and clock the person came with; the view's own fit follows the figure's return to free play)
        await wait(260);
        await dipOut(who);
      }
    } finally { stopping = false; }
  })();
}
