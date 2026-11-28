// Which cards a sideways drag leaves where they are (Mohammad, 28 Nov: a slide that only changes the view and keeps the same teaching card must not let that card swipe out and bounce back).
// A card stays put under the finger when the place the drag goes to shows the very same card (the same key): the data card the next slide keeps, and the words card of a beat of the same slide.
// Pure; the card layer asks it once per drag. tests/swipe-keeps.test.ts walks it over every move of every deck.
import { apply, samePos, viewAt, lastSlideShot, type Move, type Pos, type Stop } from '../deck/presenter-machine.ts';
import { phoneView } from './phone-panel.ts';
import { wordsCardKey } from './card-key.ts';
import type { DataAt } from './keep.ts';

export interface Kept { words: boolean; data: boolean }

/** The cards a drag toward `m` leaves in place. `wordsNow` and `dataNow` are the keys of the cards on screen (`dataNow` null when there is none); `sideways` is the phone-on-its-side layout. */
export function keptByMove(deckId: string, stops: Stop[], pos: Pos, m: Move, dataAt: readonly (DataAt | null)[], wordsNow: string, dataNow: string | null, sideways: boolean): Kept {
  const to = apply(stops, pos, m);
  if (samePos(to, pos)) return { words: false, data: false };
  const there = dataAt[to.stop] ?? null;
  const v2 = phoneView(viewAt(stops, to, lastSlideShot(stops)), sideways, there?.kind);
  return { words: wordsCardKey(deckId, v2.words, v2.slide?.id) === wordsNow, data: dataNow !== null && !!there && `${deckId}/${there.key}` === dataNow };
}
