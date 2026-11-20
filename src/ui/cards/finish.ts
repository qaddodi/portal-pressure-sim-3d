import { rail, OUT_DONE, PARALLAX } from './rail.ts';
import { D_SMALL, reduced } from '../a11y/motion.ts';
import { leaveTalk } from '../shell/talk.ts';
import { lapseNext } from '../deck/lapse-next.ts';

let finishing = false;

/** The talk ends from its last slide (a swipe, Next, the arrow key): the cards on screen go out the way the talk was going, fading, and the talk is let go once they are gone,
 *  so the figure comes back under them and nothing snaps off. Without a card on screen (or none that can be moved) it leaves at once. */
export function finishTalk(): void {
  if (finishing) return;
  if (lapseNext()) return;   // (the last slide's days still running: the first Next runs them out, as 2D's Next does, and the talk ends on the next)
  const cards = typeof document === 'undefined' ? [] : [...document.querySelectorAll<HTMLElement>('.dk-card[data-card]:not([data-phase="out"])')];
  if (!cards.length) { leaveTalk(); return; }
  finishing = true;
  const reduce = reduced();
  for (const card of cards) {
    const plate = card.previousElementSibling?.classList.contains('dk-plate') ? (card.previousElementSibling as HTMLElement) : null;
    const data = card.getAttribute('data-card') === 'ladder' || card.getAttribute('data-card') === 'table';
    rail.leave(plate ? [card, plate] : [card], { dir: 1, par: data ? PARALLAX.data : PARALLAX.words, reduce });
  }
  setTimeout(() => { finishing = false; leaveTalk(); }, (reduce ? D_SMALL : OUT_DONE) + 40);
}
