import { clock } from '../../clock/frame.ts';
// Errors the page caught, counted (the 2D app's caught.js): a window error, an unhandled rejection, and any `caught(site, error)` a module reports. The screen report's health
// part, the Sweep and the Full check read the count; none of it runs per frame.
interface Caught { site: string; message: string; at: number }
const list: Caught[] = [];
let installed = false;

export function caught(site: string, e: unknown): void {
  list.push({ site, message: String((e as { message?: string } | null)?.message ?? e).slice(0, 240), at: Math.round(typeof performance !== 'undefined' ? clock.now() : 0) });
  if (list.length > 50) list.shift();
}
export const caughtCount = (): number => list.length;
export const caughtList = (): readonly Caught[] => list.slice();
export const resetCaught = (): void => { list.length = 0; };

/** Start counting the page's own errors (once; the debug tools call it at boot). */
export function installCaught(win: Window = window): void {
  if (installed) return;
  installed = true;
  win.addEventListener('error', (e) => caught('window', e.error ?? e.message));
  win.addEventListener('unhandledrejection', (e) => caught('promise', e.reason));
}
