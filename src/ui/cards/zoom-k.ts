// How much a card zoom (card-zoom.ts) has grown the cards it carries, for the charts inside them (Plan 43, Mohammad 23 Nov). The zoom is a CSS `scale`, so a chart's canvas, drawn at its box times the
// device ratio, would be stretched over `scale` screen pixels: soft lines and soft numbers. A canvas asks `zoomKOf(its element)` for the factor it lives under and draws that many more pixels; it
// listens with `onZoomK` and is told on the two changes only (the zoom opens, the zoom has gone home), never per frame. Pure: no clock, no page.

/** What a chart reads of a card zoom: the factor, and the elements that ride with it. */
export interface ZoomHolder { k: number; els: { contains?(n: unknown): boolean }[] }

const holders = new Set<ZoomHolder>();
const ears = new Set<() => void>();
const tell = () => { for (const f of [...ears]) f(); };

/** The zoom's factor for `el`: that of the zoom whose cards hold it (the focus or a card riding along), else 1. */
export function zoomKOf(el: Element | null | undefined): number {
  if (!el) return 1;
  for (const h of holders) for (const r of h.els) if ((r as unknown) === el || r.contains?.(el)) return h.k;
  return 1;
}

/** Called when a zoom opens or has gone home (twice per zoom). Returns the way to stop listening. */
export function onZoomK(fn: () => void): () => void {
  ears.add(fn);
  return () => { ears.delete(fn); };
}

/** For card-zoom.ts: a zoom took hold of its cards (the factor is the zoom's whole growth, from the first frame of the glide in). */
export function zoomKHold(h: ZoomHolder): void { holders.add(h); tell(); }
/** For card-zoom.ts: the zoom's cards are back at rest. */
export function zoomKRelease(h: ZoomHolder): void { if (holders.delete(h)) tell(); }
