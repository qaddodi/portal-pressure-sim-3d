// The build pill's pure parts (the tab itself is BuildPill.tsx).

/** The text after "PREVIEW · ": the commit of `VITE_BUILD` ("branch@commit"), or nothing in a local run. */
export const buildLabel = (build: string | undefined): string => { const c = (build ?? '').split('@').pop() ?? ''; return c && c !== 'dev' && c !== 'local' ? c : ''; };
/** What the build's own checks found (`VITE_CHECKS`, scripts/build.mjs: "types: 3 errors, lint failed"), or nothing when they were clean: the pill shows it so a broken branch is never a quiet one. */
export const buildChecks = (raw: string | undefined): string => (raw ?? '').trim();
/** Whether any of those checks is a failure: "tests: 0 failing" is a count, not a fault, so a clean suite leaves the pill orange. */
export const checksFailed = (raw: string | undefined): boolean => buildChecks(raw).split(', ').some((c) => c !== '' && !/^tests: 0 failing/.test(c));
export const BADGE_H = 16;
/** The pill's words: always the commit this page RUNS; when a newer build is out (`newer`: its commit, '' when not known; the pill is one line wide, so only the running commit is named) the pill says so first, so a stale tab is never mistaken for the newest. */
export const updateText = (label: string, checks: string, newer: string | null): string =>
  newer === null ? `PREVIEW${label ? ` · ${label}` : ''}${checks ? ` · ${checks}` : ''}`
    : `NEW BUILD · TAP TO UPDATE${label ? ` · on ${label}` : ''}`;   // (short: one line on a phone; the new commit is in the build note once reloaded)

/** This copy's service worker scope and cache-name prefix (2D: `pps@<scope path>@`; the 3D app's caches use `pps3d@`). */
export const cachePrefix = (href: string) => `pps3d@${new URL('./', href).pathname}@`;
/** The address to reload to: this page's own, with `r` set to now, and (when `state` is given: the link to what is on the screen, share-wire.ts shareLinkNow) the talk and slide, or the
 *  patient with its settings, view, selection and camera, in place of whatever the address said when the page was opened (the page's address does not follow the screen, so reloading it
 *  alone went back to where the page had started: Mohammad, 20 Nov, "when I hit the preview pill to refresh we should be in the same slide again"). The page's other query words stay. */
export function reloadUrl(href: string, now: number, state?: string | null): string {
  const u = new URL(href);
  if (state) {
    const s = new URL(state, href);
    for (const k of ['script', 'slide', 'preset', 'home']) u.searchParams.delete(k);
    for (const k of ['script', 'slide']) { const v = s.searchParams.get(k); if (v != null) u.searchParams.set(k, v); }
    u.hash = s.hash;
  }
  u.searchParams.set('r', String(now));
  return u.href;
}
