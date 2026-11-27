// Where History's list rests when it opens on the figure's moment (Mac promotion pictures of history:<case>:timeline, 27 Nov 2026: the top entry cut mid-line under the chapter heading:
// "BEFORE → 8 DAYS LATER" and "EVENT" rows, "Confusion, treated"). Root cause: the moment is scrolled to the top (under the sticky heading, scroll-margin-top), but when it is near the list's
// end the list cannot scroll that far and stops at its end, part-way through the moment before it. The list then rests on a moment's top instead (the menu's fix, menu/open-scroll.ts: the first
// top at or below where it stopped), given the room at its foot to rest there.
import { restOnRow } from '../menu/open-scroll.ts';
import { readBox, readStyle } from '../layout-snap.ts';

/** `tops`: the top every moment rests at (under the heading) in the list's scroll space, ascending.
 *  A list that reached the place it asked for stays; one stopped by its end rests on a moment's top. */
export function restHistory(scrollTop: number, asked: number, tops: readonly number[], maxScroll: number): { top: number; room: number } {
  if (scrollTop >= asked - 0.5) return { top: scrollTop, room: 0 };   // (it got where it was sent)
  return restOnRow(scrollTop, tops, maxScroll);
}

/** On the live list: `scroller` is what scrolls (the list, or the story held sideways), `list` the moments' holder, `moment` the one scrolled to (already scrolled into view). */
export function restOpenHistory(scroller: HTMLElement, list: HTMLElement, moment: HTMLElement): void {
  const sb = readBox(scroller), k = sb.height > 0 && scroller.clientHeight > 0 ? sb.height / scroller.clientHeight : 1;
  const heading = list.querySelector<HTMLElement>('.hs-ch-h'), head = heading ? readBox(heading).height / k : 0;
  const inScroll = (e: Element) => (readBox(e).top - sb.top) / k + scroller.scrollTop;
  const slots = Array.from(list.querySelectorAll<HTMLElement>('.hs-slot'));
  const tops = slots.map((e) => Math.max(0, inScroll(e) - head)).sort((a, b) => a - b);
  const asked = Math.max(0, inScroll(moment) - parseFloat(readStyle(moment).scrollMarginTop || '0'));
  const r = restHistory(scroller.scrollTop, asked, tops, scroller.scrollHeight - scroller.clientHeight);
  if (r.room > 0) list.style.paddingBottom = `${parseFloat(readStyle(list).paddingBottom) + r.room}px`;
  if (r.top !== scroller.scrollTop) scroller.scrollTop = r.top;
}
