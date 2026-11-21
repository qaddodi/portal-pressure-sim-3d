// The room a slide's data card leaves its instrument (2D presenter-zoom.js toolRoom → `--pz-room`): the card's height cap, less its padding and every other part it holds (the
// header, the gaps). Every picture sizes itself against it, never against the window: the guideline flowchart stood 624 px tall in a 768 px window (shunts, slide 5) and was cut off
// at the card's foot, because the deck handed it no room and it drew the whole chart. Here it is measured the way 2D measures it, and handed down twice: as the `--pz-room` custom
// property on the card (the stylesheets' rules read it: the profile, the plane) and as a number in `ToolRoom` (the pictures the page's own code draws: the path card).
import { createContext, useContext, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { toolRoomOf } from '../tests/slide/copied/tool-room.copied.js';
import { observeThenFit } from '../layout/fit-later.ts';

/** The height cap of the data card the instrument is in, px (the plan's `maxH.data`); 0 where the card has none (a phone's stacked card, a card standing alone). */
export const DataCap = createContext(0);
/** The room the instrument has, px; 0 when it has none (the picture then keeps its own budget). */
export const ToolRoom = createContext(0);
export const useToolRoomValue = () => useContext(ToolRoom);

const px = (v: string) => parseFloat(v) || 0;

/** The room of the card `box` stands in: measured from the card, never from the instrument's own height (it never enters its own budget). Pure on the numbers it is handed. */
export function roomOfBox(box: HTMLElement, cap: number): number {
  const card = box.closest<HTMLElement>('.pz-data'), inner = box.parentElement;
  if (!card || !inner || !(cap > 0)) return 0;
  const parts: number[] = [];
  let rows = 0;
  for (const c of Array.from(inner.children) as HTMLElement[]) {
    const s = getComputedStyle(c);
    if (s.display === 'none' || s.position === 'absolute' || s.position === 'fixed') continue;
    rows++;
    if (c !== box) parts.push(c.offsetHeight + px(s.marginTop) + px(s.marginBottom));
  }
  const pad = (el: HTMLElement) => { const s = getComputedStyle(el); return px(s.paddingTop) + px(s.paddingBottom) + px(s.borderTopWidth) + px(s.borderBottomWidth); };
  return toolRoomOf({ cap, rows, parts: parts as never[], gap: px(getComputedStyle(inner).rowGap), pad: pad(card) + (inner === card ? 0 : pad(inner)) });
}

/** A ref for the instrument's box, and the room it has (0 until measured). Sets `--pz-room` on the card too, as 2D does, and takes it off when the card has none. */
export function useToolRoom(): [RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const cap = useContext(DataCap);
  const [room, setRoom] = useState(0);
  useLayoutEffect(() => {
    const box = ref.current;
    if (!box) return;
    const card = box.closest<HTMLElement>('.pz-data');
    const apply = () => {
      const r = roomOfBox(box, cap);
      setRoom((was) => (was === r ? was : r));
      if (card) { if (r > 0) card.style.setProperty('--pz-room', `${r}px`); else card.style.removeProperty('--pz-room'); }
    };
    apply();
    // the parts round the instrument (its header's tiles wrap, a font arrives) change the room; the instrument itself does not (--pz-room is written on the card they stand in: after the delivery, never inside it)
    const off = observeThenFit(Array.from(box.parentElement?.children ?? []).filter((c) => c !== box), apply);
    return () => { off(); card?.style.removeProperty('--pz-room'); };
  }, [cap]);
  return [ref, room];
}
