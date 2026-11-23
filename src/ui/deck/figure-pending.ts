// Whether the figure is still waiting for the slide on show: the cards come in on the numbers baked at build time, but the live figure eases to the slide's patient only once the second engine has
// worked the slide's state out (decks/hp/link.ts). Until then the figure shows the slide before's patient, so a label on it would print that patient's pressure ("IVC 4.4 mmHg" on the web slide, whose
// chart read 16: Where resistance 7, capture 4bf601dd). The labels wait (they fade out where they stand and ease back in) until the figure is on the slide, or GIVE_UP_MS has passed.
import { clock } from '../../clock/frame.ts';

export const FIGURE_GIVE_UP_MS = 8000;
let since = -1;

/** The talk's link says whether the figure is yet to reach the slide on show (true at the moment the slide changes, false once its state is in). */
export function setFigurePending(pending: boolean): void {
  if (!pending) since = -1;
  else if (since < 0) since = clock.now();
}
/** True while the figure has not reached the slide on show (never longer than FIGURE_GIVE_UP_MS). */
export const figurePending = (): boolean => since >= 0 && clock.now() - since < FIGURE_GIVE_UP_MS;
