// Reduce Motion, in one place (the 2D app's motion.js policy; docs/accessibility.md). With Reduce Motion nothing travels, but nothing pops either
// (owner, 15 Nov 2026: "Nothing can pop in or out"): whatever appears, disappears or changes look cross-fades, over fadeMs below, never in one frame.
// Two moves keep a short form instead of a jump, because a jump of the whole figure is harder to follow: the camera's glide and the lobule dive run
// REDUCED_MOVE_MS. The figure still follows the hand (following is not an animation). Pure: no DOM at import, so a Node test loads it.

/** A state change; a word, chip, row or popover; a card, sheet, menu or lens crossfade (the 2D app's D_FLIP, D_SMALL, D_SURFACE, ms). */
export const D_FLIP = 120, D_SMALL = 240, D_SURFACE = 420;
/** Under Reduce Motion, how long the moves that keep a short form take (the camera's glide), ms. */
export const REDUCED_MOVE_MS = 300;

const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
/** Whether Reduce Motion is on right now (the page's one read of the media query: tests/a11y-motion.test.ts keeps a second one out of new code). */
export const reduced = (): boolean => !!mq?.matches;
/** Call `fn` when the setting changes. Returns the remover. */
export function onReducedChange(fn: (on: boolean) => void): () => void {
  if (!mq) return () => undefined;
  const h = () => fn(mq.matches);
  mq.addEventListener('change', h);
  return () => mq.removeEventListener('change', h);
}

/** `ms` as Reduce Motion has it for a move: the same, or at most REDUCED_MOVE_MS. (`on`: the answer to use, default reduced().) */
export const reducedMs = (ms: number, on: boolean = reduced()): number => (on ? Math.min(ms, REDUCED_MOVE_MS) : ms);
/** A fade's length as Reduce Motion has it: a fade is not motion, so it stays, between D_SMALL and D_SURFACE; never 0. Without Reduce Motion, `ms` itself. */
export const fadeMs = (ms: number, on: boolean = reduced()): number => (on ? Math.max(D_SMALL, Math.min(ms, D_SURFACE)) : ms);
