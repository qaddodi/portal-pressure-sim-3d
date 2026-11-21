// Focus across a talk. The free-play chrome stays mounted under it (its CSS fade is kept) but is `inert` for the whole talk (Shell.tsx), so Tab and a reader never reach
// the hidden Tests, Treat, Settings or Search. Focus goes into the talk when it opens and back to where it was when it ends.
let from: { focus(o?: { preventScroll?: boolean }): void; isConnected: boolean } | null = null;

/** Remember what had the focus, just before the talk takes the page (talk.ts begin). A second talk started over the first keeps the first's. */
export function rememberFocus(el: unknown, keep = false) {
  if (keep && from) return;
  from = el && typeof (el as { focus?: unknown }).focus === 'function' && el !== (typeof document !== 'undefined' ? document.body : null) ? el as typeof from : null;
}

/** Give the focus back (the talk has ended and the chrome is no longer inert): to the remembered control while it is still there, else to `fallback`. */
export function restoreFocus(fallback: { focus(o?: { preventScroll?: boolean }): void } | null) {
  const t = from && from.isConnected ? from : fallback;
  from = null;
  t?.focus({ preventScroll: true });
}
