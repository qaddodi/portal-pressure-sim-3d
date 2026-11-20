import { stopTalk } from '../shell/talk.ts';
import { lapseNext } from '../deck/lapse-next.ts';

/** The talk ends from its last slide (a swipe, Next, the arrow key): the one way out, `stopTalk` (shell/talk.ts), the same as Esc and ✕: the cards and the bar fade out, the figure dims while the
 *  patient the person came with is put back, and the dim lifts. Without a card on screen (or none that can be moved) the talk still ends the same way. */
export function finishTalk(): void {
  if (lapseNext()) return;   // (the last slide's days still running: the first Next runs them out, as 2D's Next does, and the talk ends on the next)
  stopTalk();
}
