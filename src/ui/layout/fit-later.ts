import { clock } from '../../clock/frame.ts';
// A fit pass that writes onto what it observes (a class on the element, a size, a custom property) must not run inside the ResizeObserver's own delivery: the write changes the size of an
// observed element in the same frame, the observer has nothing deeper left to deliver it to, and the browser reports "ResizeObserver loop completed with undelivered notifications"
// (15 times in the ?audit v2 run, the first on a summary-table slide). The pass runs from a timer instead (as use-bar-fit.ts does): after the frame's observers have been delivered, once however many
// of them fired, and painted with the next frame. The first pass of a card is still run by its own layout effect, before the first paint, so nothing shows unfitted.

/** Observes `targets`; `fit` runs once, after the delivery, when any of them changes size. Returns what to call to let go (it also drops a pass that is waiting). */
export function observeThenFit(targets: readonly (Element | null | undefined)[], fit: () => void): () => void {
  if (typeof ResizeObserver === 'undefined') return () => undefined;
  let t = 0, live = true;
  const ro = new ResizeObserver(() => { if (!t) t = clock.after(() => { t = 0; if (live) fit(); }, 0); });
  for (const e of targets) if (e) ro.observe(e);
  return () => { live = false; ro.disconnect(); clock.cancel(t); };
}
