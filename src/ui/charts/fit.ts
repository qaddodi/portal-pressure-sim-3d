// The zoom a chart's box lives under (the card's fit), so a chart sizes itself in its own pixels, not the screen's.

/** The zoom a box lives under: the product of its ancestors' CSS `zoom` (the card's fit puts `zoom: var(--pz-fit)` on the card's contents, and a ladder grid its own), 1 when there is none.
 *  A rect is in screen pixels, so a chart that sized itself from one drew too wide for its own box by the zoom's inverse. */
export function fitOf(el: Element): number {
  let k = 1;
  for (let a: Element | null = el; a && a !== el.ownerDocument.body; a = a.parentElement) {
    const z = parseFloat(getComputedStyle(a).getPropertyValue('zoom'));
    if (z > 0 && Number.isFinite(z)) k *= z;
    // a ladder's cell draws its chart once at the instrument's own size and scales it down as one piece (`.pz-cc > .pz-prof { transform: scale(var(--lad-k)) }`, 2D presenter.js fitChart): the rect is the scaled
    // width, the chart's own box the unscaled one. Measured scaled, the chart was laid out at the cell's width and then scaled down again.
    if (a.classList?.contains('pz-cc')) { const ls = parseFloat((a as HTMLElement).style.getPropertyValue('--lad-k')); if (ls > 0 && Number.isFinite(ls)) k *= ls; }
  }
  return k;
}

