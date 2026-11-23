// The card's height glide, with one owner (Plan 46). A card that changes height after it has landed glides: the frame is held at one height (`animH`) and clipped to the other while
// the words stand at their final place at once (a shift written on the content's own children). The one rule: whenever no glide is running, no height is held and no shift is on.
// Pure and node-testable: the host (CardFrame) lends three things, the animations, the held height and the shift.
//
// Root cause it replaces (Mohammad, 23 Nov, slide 12 on an iPhone: the name tab on the title, the chart cut at its foot): `sink` held `animH` and shifted the words, and let go of both only in
// its own `onfinish`. Every other glide cancels a running one first, and a cancelled animation never finishes: a sink cut short by a reveal (a plane's chart drawn, then grown, inside 340 ms)
// left the frame at its old height and the words moved for good. And the shift was a `transform` on `.dk-in`, which made it the name tab's containing block, so the tab stood on the title.

export type GlideAnchor = 'foot' | 'mid' | 'top';

export interface GlideHost {
  /** cancel every running animation (the card's clip and the plate's scale) and forget them */
  cancelAnims(): void;
  /** the height the frame is held at while a glide runs (null: the card's own height) */
  setAnimH(h: number | null): void;
  /** put the words `px` down from their place (0 puts them back) */
  shiftWords(px: number): void;
}

/** How far the words stand below their final place while the frame still has its old height: a card on the foot loses all of `d` at its top, a centred one half. */
export const wordShift = (anchor: GlideAnchor, d: number): number => (anchor === 'foot' ? d : anchor === 'mid' ? d / 2 : 0);

/** Let go of everything a glide holds, at once. Every start, every cancel and every finish goes through here, so nothing is left held. */
export function settle(h: GlideHost): void {
  h.cancelAnims();
  h.setAnimH(null);
  h.shiftWords(0);
}

/** A card gets shorter: the frame stays `prev` high and is clipped down to `next`; the words are already where the shorter card puts them. */
export function beginSink(h: GlideHost, prev: number, next: number, anchor: GlideAnchor): void {
  settle(h);
  h.setAnimH(prev);
  const s = wordShift(anchor, prev - next);
  if (s) h.shiftWords(s);
}

/** A card gets taller: it is `next` high at once and is revealed down to it. A glide it cuts short leaves nothing behind. */
export function beginReveal(h: GlideHost, next: number): void {
  settle(h);
  h.setAnimH(next);
}

/** A sink ran to its end: the new height is let in (React commits it), and `committed` then takes the clip and the shift off after that commit, so no frame shows the full old card. */
export function finishSink(h: GlideHost): void { h.setAnimH(null); }
/** A reveal ran to its end: nothing is held. */
export function finishReveal(h: GlideHost): void { settle(h); }
/** The held height has just become null in the committed tree. */
export function committed(h: GlideHost, animH: number | null): void { if (animH == null) { h.cancelAnims(); h.shiftWords(0); } }

/** The marker a shifted child carries, so only what the glide shifted is put back. */
const MARK = 'gshift';
interface ShiftChild { style: { translate: string }; dataset: Record<string, string | undefined> }
/** Write the shift as each content child's own `translate` (it composes with the `transform` and `zoom` the children already use), NEVER on the card's inner: a transform there would make the inner
 *  the containing block of the absolutely placed name tab, and the tab would stand on the title (`tests/card-tab-anchor.test.ts`). The tab is a child too, so it moves with the words, as the card's corner does. */
export function shiftWords(inner: { children: ArrayLike<unknown> } | null, px: number): void {
  if (!inner) return;
  for (let i = 0; i < inner.children.length; i++) {
    const c = inner.children[i] as ShiftChild;
    if (px) { c.style.translate = `0 ${px}px`; c.dataset[MARK] = '1'; }
    else if (c.dataset[MARK]) { c.style.translate = ''; delete c.dataset[MARK]; }
  }
}
