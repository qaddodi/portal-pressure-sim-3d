// Where the debug tools may run: the preview copy (/preview/), a local run, and nothing else. The live site never loads them (the build's
// VITE_CHANNEL is 'preview' only for the integration branch's build, scripts/build.mjs and .github/workflows/pages.yml).
// Pure: handed a location, so a Node test drives it.

interface Loc { pathname: string; hostname: string; search: string }

/** Is this the preview copy or a local run? The live site never offers the debug tools. */
export function isPreview(loc: Loc = location): boolean {
  return /\/preview\//.test(loc.pathname) || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(loc.hostname);
}

/** The address's own value of a flag ('' for a bare flag, null when absent). The one place the debug tools read the address (flags.ts is the table). */
export function param(search: string, name: string): string | null {
  const v = new URLSearchParams(search).get(name);
  return v === null ? null : v;
}
