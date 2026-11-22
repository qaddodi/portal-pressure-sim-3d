// 2D's "a row of choices is one row" (presenter-ladders.js abShort): where the choices' full names would wrap, each button that has a compact label takes it (the full name stays its accessible name and tooltip), never a
// second row, never a smaller size, on every screen. The 3D port had no such step, so six full names ("Portal vein thrombosis", "Sinusoidal obstruction"...) wrapped to two-line buttons of ragged widths in a tall
// card (Mohammad, 20 Nov, Sites and causes 10/14: "disgusting teaching card with the buttons").

/** Does the row of choices wrap or overflow with its full names? (the distinct tops of its buttons, and the row's scroll and client widths, read with the full names showing) */
export const rowWraps = (tops: readonly number[], scrollW: number, clientW: number): boolean => new Set(tops.map(Math.round)).size > 1 || scrollW > clientW + 1;

/** The smallest a choice may be set to fit one row: 0.8 of its size (11 px of 14). Under it the row wraps rather than shrink further. */
export const MIN_AB_ZOOM = 0.8;

/** What a row of choices that still overflows with its compact labels does next: `tight` (the buttons' own padding and the gap between them closed up, in CSS) and the zoom that makes the rest fit,
 *  worked out from the row's content width and the room it has (1 when it already fits). `fits` false: even the smallest does not fit, so the row keeps the compact labels and wraps. */
export function tightFit(contentW: number, roomW: number): { zoom: number; fits: boolean } {
  if (contentW <= roomW + 1) return { zoom: 1, fits: true };
  const z = Math.floor((roomW / contentW) * 100) / 100;
  return z >= MIN_AB_ZOOM ? { zoom: z, fits: true } : { zoom: MIN_AB_ZOOM, fits: false };
}

/** Measure `row` with every full name showing; where that wraps, show the compact labels; where those wrap too, close the padding and gap up (data-tight) and scale the buttons to fit one row
 *  (--ab-z), so six choices stand on one row on a phone (Mohammad, 21 Nov, Sites and causes 10/14: "the buttons … same row to be elegant"). Reads layout, so it runs while the card is still waiting
 *  to come in (CardFrame's gate). */
export function fitChoiceRow(row: HTMLElement): boolean {
  row.removeAttribute('data-compact'); row.removeAttribute('data-tight'); row.style.removeProperty('--ab-z');
  const compactable = row.querySelector('.pz-abb[data-short]') !== null;   // (a row with no compact labels still closes up and scales)
  const all = [...row.querySelectorAll<HTMLElement>('.pz-abb')];
  const wraps = () => rowWraps(all.map((b) => b.offsetTop), row.scrollWidth, row.clientWidth);
  if (!wraps()) return false;
  if (compactable) { row.setAttribute('data-compact', ''); if (!wraps()) return true; }
  row.setAttribute('data-tight', '');   // (one row, no wrapping: the content's width is then the row's scroll width)
  const { zoom } = tightFit(row.scrollWidth, row.clientWidth);
  if (zoom < 1) row.style.setProperty('--ab-z', String(zoom));
  return true;
}
