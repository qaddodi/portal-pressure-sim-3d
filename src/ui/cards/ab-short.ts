import { layoutOf, isSideways, pzh, clamp } from '../layout/rules2d.ts';
// 2D's "a row of choices is one row" (presenter-ladders.js abShort): where the choices' full names would wrap, each button that has a compact label takes it (the full name stays its accessible name and tooltip), never a
// second row, never a smaller size, on every screen. The 3D port had no such step, so six full names ("Portal vein thrombosis", "Sinusoidal obstruction"...) wrapped to two-line buttons of ragged widths in a tall
// card (Mohammad, 20 Nov, Sites and causes 10/14: "disgusting teaching card with the buttons").

/** Does the row of choices wrap or overflow with its full names? (the distinct tops of its buttons, and the row's scroll and client widths, read with the full names showing) */
export const rowWraps = (tops: readonly number[], scrollW: number, clientW: number): boolean => new Set(tops.map(Math.round)).size > 1 || scrollW > clientW + 1;

/** The smallest a choice may be set to fit one row: 0.8 of its size (11 px of 14), or, where its type is larger, the zoom that leaves its label 12 px on the screen (`zoomFloor`). Under it the row stands in two balanced rows. */
export const MIN_AB_ZOOM = 0.8;
/** The words' floor on the screen, px (the app's: nothing is set under it). */
export const AB_FLOOR_PX = 12;

/** The zoom a row may shrink to: the smaller of the old 0.8 and the zoom that leaves its labels `AB_FLOOR_PX` on the screen (a label of 16.6 px: 0.72; of 14 px: 0.8, as before). */
export const zoomFloor = (labelPx: number): number => (labelPx > 0 ? Math.max(0.5, Math.min(MIN_AB_ZOOM, AB_FLOOR_PX / labelPx)) : MIN_AB_ZOOM);

/** What a row of choices that still overflows with its compact labels does next: `tight` (the buttons' own padding and the gap between them closed up, in CSS) and the zoom that makes the rest fit,
 *  worked out from the row's content width and the room it has (1 when it already fits). `fits` false: even the smallest does not fit one row: the row then stands in two balanced rows (`rowSplit`). */
export function tightFit(contentW: number, roomW: number, floor = MIN_AB_ZOOM): { zoom: number; fits: boolean } {
  if (contentW <= roomW + 1) return { zoom: 1, fits: true };
  const z = Math.floor((roomW / contentW) * 100) / 100;
  return z >= floor ? { zoom: z, fits: true } : { zoom: floor, fits: false };
}

/** The two rows a row of `n` choices that cannot stand in one stands in: the first holds ceil(n / 2), the second the rest, so the rows are as equal as they can be (six: 3 and 3; five: 3 and 2). */
export const rowSplit = (n: number): [number, number] => [Math.ceil(n / 2), Math.floor(n / 2)];

/** Does a grid of `n` choices in `cols` columns leave ONE button alone on its last row (three choices in two columns: 2 + 1)? That button is then spread across the whole row (Mohammad, 25
 * Nov: "if two rows, never one button only on row 2"). */
export const loneOnLastRow = (n: number, cols: number): boolean => cols > 1 && n > cols && n % cols === 1;

export type RowStep = 'full' | 'compact' | 'tight' | 'two';
/** The step a row ends at, from what fits (pure: fitChoiceRow reads the widths, this decides): the full names, the compact labels, the tight row (padding and gap closed, zoomed to the floor), else two balanced rows. Never a nowrap row that overflows. */
export function rowStep(o: { fullFits: boolean; compactable: boolean; compactFits: boolean; contentW: number; roomW: number; floor: number }): { step: RowStep; zoom: number } {
  if (o.fullFits) return { step: 'full', zoom: 1 };
  if (o.compactable && o.compactFits) return { step: 'compact', zoom: 1 };
  const { zoom, fits } = tightFit(o.contentW, o.roomW, o.floor);
  return fits ? { step: 'tight', zoom } : { step: 'two', zoom: 1 };
}

/** A choice's label size on this screen, px (no layout read: 2D's own clamps): on a wide or short screen the smaller of the label size and .82 of the body's (css3d-over-2d.css), else 0 (a phone's row keeps the 0.8 floor). */
export function labelPxOf(vw: number, vh: number): number {
  const lay = layoutOf(vw, vh);
  if (lay === 'stack' || lay === 'tab' || isSideways(vw, vh)) return 0;
  const p = pzh(vw, vh);
  return Math.min(clamp(2.022 * p, 14, 24.5), clamp(2.311 * p, 17, 28) * 0.82);
}

/** Measure `row` with every full name showing; where that wraps, show the compact labels; where those wrap too, close the padding and gap up (data-tight) and scale the buttons to fit one row
 *  (--ab-z, never under the floor in px: `labelPx`, from labelPxOf); where even that does not fit, two balanced rows (data-two, --ab-cols). Every button is one line (CSS: nowrap), so a row never overflows its card: it
 *  is never `nowrap` and wider than its room. Reads layout, so it runs while the card is still waiting to come in (CardFrame's gate), and again only when the card's width changes. */
export function fitChoiceRow(row: HTMLElement, labelPx = 0): boolean {
  for (const a of ['data-compact', 'data-tight', 'data-two', 'data-lone']) row.removeAttribute(a);
  row.style.removeProperty('--ab-z'); row.style.removeProperty('--ab-cols');
  const compactable = row.querySelector('.pz-abb[data-short]') !== null;   // (a row with no compact labels still closes up and scales)
  const all = [...row.querySelectorAll<HTMLElement>('.pz-abb')];
  const wraps = () => rowWraps(all.map((b) => b.offsetTop), row.scrollWidth, row.clientWidth);
  if (!wraps()) return false;
  let compactFits = false;
  if (compactable) { row.setAttribute('data-compact', ''); compactFits = !wraps(); if (compactFits) return true; }
  row.setAttribute('data-tight', '');   // (one row, no wrapping: the content's width is then the row's scroll width)
  const { step, zoom } = rowStep({ fullFits: false, compactable, compactFits, contentW: row.scrollWidth, roomW: row.clientWidth, floor: zoomFloor(labelPx) });
  if (step === 'tight') { if (zoom < 1) row.style.setProperty('--ab-z', String(zoom)); return true; }
  row.removeAttribute('data-tight');
  const cols = rowSplit(all.length)[0];
  row.setAttribute('data-two', ''); row.style.setProperty('--ab-cols', String(cols));
  if (loneOnLastRow(all.length, cols)) row.setAttribute('data-lone', '');
  return true;
}
