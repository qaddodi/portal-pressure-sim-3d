// The talk's one "slide landed" signal (landing-core.ts), wired to the scene's camera and the cards on screen. linkLanding runs while a talk is on show; the links that wait for the end of a
// slide's move (the figure's glows and marks, the time-lapse, the auto procedure) ask it: `slideLanded()` and `onLanded(fn)`.
import { sceneApi } from '../../scene/api.ts';
import { useUi } from '../ui-store.ts';
import { makeLanding } from './landing-core.ts';

import { clock } from '../../clock/frame.ts';
/** The cards are all in: none leaving or waiting, and every one past its entrance (CardFrame marks a card `data-live` once its entrance has ended). */
export function cardsAreIn(root: ParentNode = document): boolean {
  for (const c of root.querySelectorAll<HTMLElement>('.dk-card[data-card]')) {
    if (c.getAttribute('data-phase') !== 'in') return false;
    if (c.closest('.dk-pos')?.getAttribute('data-live') !== 'true') return false;
  }
  return true;
}

const landing = makeLanding({
  still: () => !sceneApi.cameraMoving,
  cardsIn: () => typeof document === 'undefined' || cardsAreIn(),
  now: () => clock.now(),
  later: (fn, ms) => clock.after(fn, ms),
  cancel: (h) => clock.cancel(h as number),
});

/** The position's key; empty while the talk has no stops yet (nothing can land before there is a slide). */
const keyOf = (): string => { const s = useUi.getState(); return s.stops.length ? `${s.nonce}:${s.pos.stop}:${s.pos.beat}` : ''; };
const restart = (): void => { const k = keyOf(); if (k) landing.begin(k); else landing.stop(); };

/** Whether the position on show has landed: its camera is still and its cards are in. */
export function slideLanded(): boolean { const k = keyOf(); if (!k) return false; landing.ensure(k); return landing.landed; }
/** `fn` runs each time a position lands (not for one already landed: ask `slideLanded()` first). The remover. */
export const onLanded = (fn: () => void): (() => void) => landing.on(fn);

export function linkLanding(): () => void {
  restart();
  const off = useUi.subscribe((s, p) => { if (s.pos !== p.pos || s.stops !== p.stops) restart(); });
  return () => { off(); landing.stop(); };
}
