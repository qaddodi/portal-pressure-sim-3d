// Whether the figure is still waiting for the slide on show: the cards come in on the numbers baked at build time, but the live figure eases to the slide's patient only once the second engine has
// worked the slide's state out (decks/hp/link.ts). Until then the figure shows the slide before's patient, so a label on it would print that patient's pressure ("IVC 4.4 mmHg" on the web slide, whose
// chart read 16: Where resistance 7, capture 4bf601dd). The labels wait (they fade out where they stand and ease back in) until the figure is on the slide, however long that takes: a label never prints the slide before's patient (reviewer, build e4810ea9: RAP 3.2 and PV 14.1 against 28.2 and 40.6). The link clears it when the state is in, or when the talk's states failed.

let since = -1;

/** The talk's link says whether the figure is yet to reach the slide on show (true at the moment the slide changes, false once its state is in). */
export function setFigurePending(pending: boolean): void {
  if (!pending) since = -1;
  else if (since < 0) since = 1;
}
/** True while the figure has not reached the slide on show. There is no timeout and no fallback to the old readings. */
export const figurePending = (): boolean => since >= 0;

/** True while the slide's own state has not come in, however long that takes (it used to give up after 8 s of the page's clock, which a sped-up capture spent in a fraction of a real second:
 *  the labels then printed the patient of the slide before, Who should get a TIPS 9 RAP 3.2 and PV 14.1 against 28.2 and 40.6, Doppler 5 25 against 12 cm/s). The capture waits on this one. */
export const figureWaiting = (): boolean => since >= 0;
