// Measure now. A chart takes its size from an observer that reports after the frame (fit-later.ts), so for a frame or two after its box changes size the picture inside is the old size in the
// new box. A change that eases its figures from the old size to the new one (tests/dock/figure-glide.ts) needs every picture at the new size in the same task, before the first paint, so each
// chart that measures itself (Chart.tsx, Cv.tsx useCv) enrols its own measure here and the glide calls `resyncNow()` inside a synchronous React flush.
const measures = new Set<() => void>();

/** Enrols a measure (it reads the box and sets state); returns the remover. */
export function onResync(fn: () => void): () => void {
  measures.add(fn);
  return () => { measures.delete(fn); };
}

/** Runs every enrolled measure. Call it inside `flushSync` so the charts take their new size before the next paint. */
export function resyncNow(): void { for (const fn of [...measures]) fn(); }
