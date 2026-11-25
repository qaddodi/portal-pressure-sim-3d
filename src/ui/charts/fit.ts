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


/** The zoom a box lives under that is a TRANSFORM, not layout: the card zoom (`card-zoom.ts`) writes an inline `scale` on the card and its plate, and a rect read inside it is that many times too large (the layout box, and the
 *  chart's and the card's own sizes taken from a rect, are not). Everything that sizes itself from a rect divides this out too: read at 2.2 times, a chart laid itself out 2.2 times too wide (cut at the right edge) and the card
 *  was then sized to the taller chart, and so grew again under the zoom (the zoomed card ran past the screen and over its neighbour, 22 Nov). 1 when there is none. */
export function scaleOf(el: Element): number {
  let k = 1;
  for (let a: Element | null = el; a && a !== el.ownerDocument.body; a = a.parentElement) {
    const sc = parseFloat((a as HTMLElement).style?.getPropertyValue('scale') ?? '');
    if (sc > 0 && Number.isFinite(sc)) k *= sc;
  }
  return k;
}

/** The box's width in its own pixels: its rect divided by the zoom it lives under (the card's fit, `fitOf`, passed when already read) and by the transform scale (`scaleOf`). */
export const ownWidth = (el: Element, z: number = fitOf(el)): number => Math.round(el.getBoundingClientRect().width / (z * scaleOf(el)));

const MOTION = /(?:^|;)\s*(?:translate|scale|transform-origin|transform|opacity)\s*:[^;]*/g;
const stripped = (s: string | null) => (s ?? '').replace(MOTION, '').replace(/[;\s]+/g, ' ').trim();
/** Whether style attributes changed in something other than motion (`translate`, `scale`, `transform`, `opacity`: the clock's per-frame writes and the card zoom). Those never change the size of a box or the zoom it lives
 *  under, so a pass that looks again "when the card's style changes" ignores them: it ran on every frame of a card zoom and of a rail glide (needs `attributeOldValue`). */
export function sizeStyleMoved(records: readonly MutationRecord[], host?: Element): boolean {
  return records.some((r) => {
    // A class on an ANCESTOR of the chart (`col`, `tool-open`, a layout step) switches a `zoom` rule on or off with no style written and no size of the box changed: the chart stood laid out for the
    // zoom it was measured under (Prehepatic 7: words 1.85 times their size once the card's zoom went). Only a class on the chart's own ancestors counts: a class elsewhere never moves its zoom.
    if (r.attributeName === 'class') return !!host && (r.target as Element).contains(host) && r.oldValue !== (r.target as Element).getAttribute('class');
    return stripped(r.oldValue) !== stripped((r.target as Element).getAttribute('style'));
  });
}
