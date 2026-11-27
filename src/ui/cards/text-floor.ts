// The smallest lettering a card holds, as the screen draws it (L2, owner 27 Nov: the 12 px floor holds for a summary table too).
// A panel's fit zooms its contents down only as far as its smallest words allow: the zoom that brings those to 12 px (card-fit.ts floorOf).
// A table's smallest words are its finding lines, its heads and its legend, not the teaching line above it, so the floor is judged by them;
// the fit used the line's size, and a table's 12 px heads and findings went to nine on a phone (capture 3531bdfa, 16.15 and 22.13).
// Pure on the sizes it is handed; `smallestPx` reads them off the page (through layout-snap, the one place a style is read).
import { readStyle } from '../layout-snap.ts';

/** Lettering under this is not lettering (a visually hidden label, a heading row's collapsed kicker): left out of the judgement. */
export const NOT_LETTERING_PX = 6;

/** The smallest of the sizes that are lettering; Infinity when there is none. */
export function smallestOf(sizes: readonly number[]): number {
  let m = Infinity;
  for (const s of sizes) if (Number.isFinite(s) && s >= NOT_LETTERING_PX && s < m) m = s;
  return m;
}

/** The smallest font size (px, at a zoom of 1) of the text a card shows, its visually hidden labels and empty text left out. Infinity when it holds none. */
export function smallestPx(root: Element, cap = 600): number {
  const sizes: number[] = [];
  const walk = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let n = 0;
  for (let t = walk.nextNode(); t && n < cap; t = walk.nextNode(), n++) {
    const el = t.parentElement;
    if (!t.textContent?.trim() || !el || el.closest('.sr-only')) continue;
    sizes.push(parseFloat(readStyle(el).fontSize));
  }
  return smallestOf(sizes);
}
