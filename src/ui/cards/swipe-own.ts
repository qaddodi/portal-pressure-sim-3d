// One decision for the whole slide surface (Mohammad, 20 Nov: "swipe right or left anywhere on the slide and up and down anywhere on the slide"): which touches are a real control's
// own, and which way a finger that has moved a few pixels is going. The sideways recogniser (useCardDrag: the talk moves, the cards follow) and the vertical one (useDockSwipe: the
// instrument card goes to its handle or comes back) both ask here, so a touch is never given to both and a control is never taken from.

/** What a touch that starts on it stays its own: a field, a slider, a link, the hold-to-strain button, a dialog or menu or the slide list, anything marked `data-no-swipe`, and every strip a finger moves along sideways (a timeline or an over-time chart, a procedure's step rail, a scrolling row): those carry `data-scrub`, so a sideways drag on them moves the strip and never the cards or the slide. Everywhere else on the card a sideways swipe still changes slides.
 *  Every other button (a question, a compare button, the pill's) is only a place the finger happens to start: a tap on it is still a tap, a swipe from it is a swipe. */
export const OWN = 'a, input, select, textarea, [role="slider"], .range-wrap, .pz-strain, [data-no-swipe], [data-scrub], [role="dialog"], [role="menu"], [aria-modal="true"], .menu, .modal, .sh-sheet, .pz-jump, .pz-black';
export const ownsTouch = (t: Element | null | undefined): boolean => !t || !!t.closest?.(OWN);

/** How far a finger moves before its direction is decided (px). */
export const AXIS_AT = 8;
let cur: { id: number; axis: 'x' | 'y' | null } | null = null;
/** A new touch begins: nothing is decided yet. */
export function axisStart(id: number): void { cur = { id, axis: null }; }
/** The touch's axis: null until it has moved AXIS_AT px, then sideways ('x') when it has gone further across than up or down, else vertical ('y'), and it stays so for the whole touch. */
export function axisOf(id: number, dx: number, dy: number): 'x' | 'y' | null {
  if (!cur || cur.id !== id) cur = { id, axis: null };
  if (!cur.axis && Math.max(Math.abs(dx), Math.abs(dy)) >= AXIS_AT) cur.axis = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';
  return cur.axis;
}
export function axisEnd(id: number): void { if (cur && cur.id === id) cur = null; }
