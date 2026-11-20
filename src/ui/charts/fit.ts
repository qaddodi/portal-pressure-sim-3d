// The zoom a chart's box lives under (the card's fit), so a chart sizes itself in its own pixels, not the screen's.

/** The zoom a box lives under: the product of its ancestors' CSS `zoom` (the card's fit puts `zoom: var(--pz-fit)` on the card's contents, and a ladder grid its own), 1 when there is none.
 *  A rect is in screen pixels, so a chart that sized itself from one drew too wide for its own box by the zoom's inverse. */
export function fitOf(el: Element): number {
  let k = 1;
  for (let a: Element | null = el; a && a !== el.ownerDocument.body; a = a.parentElement) {
    const z = parseFloat(getComputedStyle(a).getPropertyValue('zoom'));
    if (z > 0 && Number.isFinite(z)) k *= z;
  }
  return k;
}

