// 2D's "a row of choices is one row" (presenter-ladders.js abShort): where the choices' full names would wrap, each button that has a compact label takes it (the full name stays its accessible name and tooltip), never a
// second row, never a smaller size, on every screen. The 3D port had no such step, so six full names ("Portal vein thrombosis", "Sinusoidal obstruction"...) wrapped to two-line buttons of ragged widths in a tall
// card (Mohammad, 20 Nov, Sites and causes 10/14: "disgusting teaching card with the buttons").

/** Does the row of choices wrap or overflow with its full names? (the distinct tops of its buttons, and the row's scroll and client widths, read with the full names showing) */
export const rowWraps = (tops: readonly number[], scrollW: number, clientW: number): boolean => new Set(tops.map(Math.round)).size > 1 || scrollW > clientW + 1;

/** Measure `row` with every full name showing, then set `data-compact` (the compact labels show) only if it would wrap. Reads layout, so it runs while the card is still waiting to come in (CardFrame's gate). */
export function fitChoiceRow(row: HTMLElement): boolean {
  const bs = [...row.querySelectorAll<HTMLElement>('.pz-abb[data-short]')];
  if (!bs.length) return false;
  row.removeAttribute('data-compact');
  const all = [...row.querySelectorAll<HTMLElement>('.pz-abb')];
  const wraps = rowWraps(all.map((b) => b.offsetTop), row.scrollWidth, row.clientWidth);
  if (wraps) row.setAttribute('data-compact', '');
  return wraps;
}
