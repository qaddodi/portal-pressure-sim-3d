// The one place a one-off layout read may live (lint rule `layout-read`, scripts/lint-rules.mjs). The Capture walks the whole page once, on a tap, never in a frame:
// it reads each element's box and computed style here, so the page's own files keep their read allowance falling.

/** An element's box on the page, in CSS px (transforms included). */
export const readBox = (el: Element): DOMRect => el.getBoundingClientRect();
/** An element's computed style. */
export const readStyle = (el: Element, pseudo?: string): CSSStyleDeclaration => getComputedStyle(el, pseudo);
/** The box of a run of text inside a text node, or of one word of it: one rect per line the run covers. */
export function readTextRects(node: Text, from: number, to: number): DOMRect[] {
  const range = document.createRange();
  range.setStart(node, from); range.setEnd(node, to);
  return [...range.getClientRects()];
}
/** A layout metric of an element in layout px (offsetHeight, clientWidth, …): the size before any transform, as the card's own fit zoom leaves it. */
export const readMetric = (el: HTMLElement, k: 'offsetHeight' | 'offsetWidth' | 'clientHeight' | 'clientWidth'): number => el[k];
