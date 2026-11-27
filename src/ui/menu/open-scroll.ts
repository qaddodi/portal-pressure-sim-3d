/** Where a menu list rests when it opens on the current row. scrollIntoView({ block: 'nearest' }) leaves the list wherever the
 *  current row just clears the foot, which is part-way down some other row: that row showed cut off at the list's top edge, under the tabs
 *  (Mac promotion picture, Histories tab, 26 Nov 2026). The list rests on a row's top instead, the first one at or below that spot, so the
 *  current row stays in view and no row is cut at the top. If that top is past the list's end, the list gets the room to rest there. */

/** `tops`: every row's and heading's top in the list's own scroll space, ascending. Returns the scroll position to rest at, and the extra
 *  room the list's foot needs for it to be reachable (0 when it already is). */
export function restOnRow(scrollTop: number, tops: readonly number[], maxScroll: number): { top: number; room: number } {
  if (scrollTop <= 0.5) return { top: scrollTop, room: 0 };
  let top = scrollTop;
  for (const t of tops) if (t >= scrollTop - 0.5) { top = t; break; }
  return { top, room: Math.max(0, Math.ceil(top - maxScroll)) };
}

import { readBox, readStyle } from '../layout-snap.ts';

/** the same, on the live list: `scroller` is what scrolls (the list, or the sheet's column holder), `list` the open tab's column */
export function restOpenList(scroller: HTMLElement, list: HTMLElement): void {
  // (the menu may be mid-arrival, scaled a little: boxes are read against the scroller's own, then put back to its own pixels)
  const sb = readBox(scroller), k = sb.height > 0 && scroller.clientHeight > 0 ? sb.height / scroller.clientHeight : 1;
  const gap = 2;   // (a hair above the row, so its rounded hover and the heading's top are not shaved)
  const rows = Array.from(list.querySelectorAll<HTMLElement>('.um-gl, .um-g li'));
  const tops = rows.map((e) => readBox(e)).filter((b) => b.height > 0).map((b) => (b.top - sb.top) / k + scroller.scrollTop - gap).sort((a, b) => a - b);
  const r = restOnRow(scroller.scrollTop, tops, scroller.scrollHeight - scroller.clientHeight);
  if (r.room > 0) list.style.paddingBottom = `${parseFloat(readStyle(list).paddingBottom) + r.room}px`;
  if (r.top !== scroller.scrollTop) scroller.scrollTop = r.top;
}
