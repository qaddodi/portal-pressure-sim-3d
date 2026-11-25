// ?safe=top,right,bottom,left (CSS px; the preview copy and a local run): the screen's safe edges given by hand, for a page in a frame that stands for a phone or a tablet (the promotion
// pictures, promo/frames.ts FRAME_SAFE). A frame has no island and no home bar, so env(safe-area-inset-*) is 0 in it; the app reads its safe edges from --safe-t/r/b/l (shell/global.css,
// where they are env()), never env() in a rule, so setting the four here lays the page out round the island and the home bar as the device does. Pure but for applySafe.

/** Top, right, bottom, left, in CSS px. */
export type SafeEdges = readonly [number, number, number, number];

/** The edges an address names (`47,0,34,0`; one number is all four, two are top-bottom and left-right, as CSS reads them), or null when there is none or it is not numbers. */
export function parseSafe(v: string | null): SafeEdges | null {
  if (v === null || v.trim() === '') return null;
  const n = v.split(',').map((s) => Number(s.trim()));
  if (!n.length || n.length > 4 || n.some((x) => !Number.isFinite(x) || x < 0 || x > 200)) return null;
  const [t, r = t, b = t, l = r] = n as [number, number?, number?, number?];
  return [t, r, b, l];
}

/** The edges as the address writes them (`47,0,34,0`). */
export const safeText = (e: SafeEdges): string => e.join(',');

/** Put the edges on the page: inline on <html>, over global.css's env() values. */
export function applySafe(e: SafeEdges, root: HTMLElement = document.documentElement): void {
  (['t', 'r', 'b', 'l'] as const).forEach((k, i) => root.style.setProperty(`--safe-${k}`, `${e[i]}px`));
}
