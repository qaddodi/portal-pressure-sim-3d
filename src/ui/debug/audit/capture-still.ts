// The capture's last word on "is this slide still": nothing printed on a card, a tile or a label is changing. The other checks in capture-all.ts ask the page's own systems
// (the camera, the clock's motion list, the running
// animations, the engine's morph); this one asks the screen, so a counter, a tile or a reading that moves for ANY reason, one the others do not know of, holds the picture
// back until it has stopped (capture 2274649a: one
// picture of Albumin 3 "Needle out" said "0.4 L removed", the same slide on another device "0.8 L removed"). Pure, so tests/capture-still.test.ts runs it without a page.

/** The parts of the page that print readings: the cards, the instrument cards, the callouts' layer, the strips, and a playing case's bar and stop cards. */
export const READING_ROOTS = '.dk-card, .dk-plate, .pz-data, .pz-shade, .pz-panel, .pz-case, .instrument-view, .lb-layer, .vdock, .dk-strip, .case-layer';
/** What is never a reading of the slide: the tool's own panels and the toast. */
export const READING_SKIP = '[data-debug], [data-capture-skip], .sh-toast';

/** Everything the given elements print, as segments (their words and numbers, white space folded), joined: two reads differ when anything printed differs. */
export const readingsOf = (els: Iterable<{ textContent: string | null }>): string => [...els].map((e) => (e.textContent ?? '').replace(/\s+/g, ' ').trim()).filter(Boolean).join('|');

/** The first segments that are in `now` and not in `was`, clipped, to say what changed. */
export function whatChanged(was: string, now: string): string {
  const old = new Set(was.split('|')), fresh = now.split('|').filter((s) => !old.has(s));
  return fresh.slice(0, 2).map((s) => (s.length > 40 ? `${s.slice(0, 38)}…` : s)).join(', ') || 'a reading went';
}

/** Watches the readings poll by poll: a change starts a hold of `holdMs` of unchanged readings (a counter that ticks every so often is never taken between two ticks). The
 *  first read is the baseline, not a change. */
export function readingWatch(holdMs: number): { see(sig: string, now: number): string; readonly changes: number } {
  let last: string | null = null, changedAt = -Infinity, changes = 0, what = '';
  return {
    see(sig, now) {
      if (last !== null && sig !== last) { changedAt = now; changes++; what = whatChanged(last, sig); }
      last = sig;
      return now - changedAt < holdMs ? `a reading on a card changed (${what})` : '';
    },
    get changes() { return changes; },
  };
}
