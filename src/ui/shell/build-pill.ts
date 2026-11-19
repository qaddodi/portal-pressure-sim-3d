// The build pill's pure parts (the tab itself is BuildPill.tsx).

/** The text after "PREVIEW · ": the commit of `VITE_BUILD` ("branch@commit"), or nothing in a local run. */
export const buildLabel = (build: string | undefined): string => { const c = (build ?? '').split('@').pop() ?? ''; return c && c !== 'dev' && c !== 'local' ? c : ''; };
export const BADGE_H = 16;

/** This copy's service worker scope and cache-name prefix (2D: `pps@<scope path>@`; the 3D app's caches use `pps3d@`). */
export const cachePrefix = (href: string) => `pps3d@${new URL('./', href).pathname}@`;
/** The address to reload to: this page's own, with `r` set to now. */
export function reloadUrl(href: string, now: number): string { const u = new URL(href); u.searchParams.set('r', String(now)); return u.href; }
