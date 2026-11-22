// Offline: registers the service worker the build writes (scripts/pwa.mjs), as the 2D app does (main.js): only in a production build, once the page has loaded and been left
// alone a moment, so the first paint and the first touches never wait for it. A new version takes over this tab's files while it is open (the worker claims its pages): the page
// keeps running the files it began with, so, once, it is offered a reload: never by itself, and not while a talk plays (it is put up again when the talk ends).
// The first install, with no worker before it, is not an update; and a page opened after a deploy is already on the new files, so nothing is offered to it.
import { useShell } from '../ui/shell/store.ts';
import { reloadKeepingState } from '../boot/reload.ts';
import { startUpdateWatch } from './update.ts';
import { splashHeld } from '../boot/ready.ts';
import { talkOn } from '../state/deck.ts';
import { lowData } from '../boot/data-saver.ts';

import { clock } from '../clock/frame.ts';
import { whenQuietOnce } from '../clock/idle.ts';
import { stamp } from '../boot/timeline.ts';
export const UPDATE_TOAST = 'A new version of the simulator is ready.';
/** How long a held offer waits before it asks again (a talk is on). */
export const RETRY_MS = 30000;

/** How often a tab that stays open asks the host whether a newer build is out, and the least gap between two asks (a tab brought back to the front asks at once, not twice in a breath).
 *  A page that is never navigated gets no update check from the browser (a phone's home-screen app resumes from sleep without one), so the page asks for itself. */
export const CHECK_MS = 5 * 60_000, CHECK_GAP_MS = 20_000;
export { takesOverNow } from './update.ts';   // (when the tab takes the newer build by itself: src/pwa/update.ts)

/** The built files this page loaded (the module scripts and style sheets under assets/): the hashed names a new worker either still holds or has dropped. */
export function loadedAssets(doc: Document = document): string[] {
  return [...doc.querySelectorAll('script[type="module"][src], link[rel="stylesheet"][href]')]
    .map((n) => n.getAttribute('src') ?? n.getAttribute('href') ?? '')
    .map((u) => u.replace(/^(\.\/|\/)/, ''))
    .map((u) => { try { return new URL(u, doc.baseURI).pathname.replace(/^.*?(assets\/.*)$/, '$1'); } catch { return u; } })
    .filter((u) => /^assets\//.test(u));
}
/** True when every file this page loaded is among the files the new worker holds (an update that changed none of them is no news to this tab). */
export const holdsAll = (mine: readonly string[], held: unknown): boolean => Array.isArray(held) && mine.length > 0 && mine.every((u) => held.includes(u));

function askFiles(sw: ServiceWorker): Promise<unknown> {
  return new Promise((res) => {
    const ch = new MessageChannel(), t = clock.after(() => res(null), 2000);
    ch.port1.onmessage = (e) => { clock.cancel(t); res(e.data); };
    try { sw.postMessage('pps:files', [ch.port2]); } catch { clock.cancel(t); res(null); }
  });
}

/** Where the person is asked once whether this site may keep its files (a home-screen app on an iPhone is then less likely to lose its copy; a refusal is harmless). */
export const PERSIST_KEY = 'pps:persist-asked';
/** Asks the browser to keep this site's storage, once per device (the answer is not asked again whatever it was). Resolves true only when the browser said yes. */
export async function persistOnce(storage: { persist?: () => Promise<boolean> } | undefined, flag: Pick<Storage, 'getItem' | 'setItem'> | null): Promise<boolean> {
  if (!storage?.persist) return false;
  try { if (flag?.getItem(PERSIST_KEY)) return false; flag?.setItem(PERSIST_KEY, '1'); } catch { /* a browser that keeps nothing asks each visit: harmless */ }
  try { return await storage.persist(); } catch { return false; }
}
const door = (): Pick<Storage, 'getItem' | 'setItem'> | null => { try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; } };

/** The offer: one line at the foot with a Reload button; in a talk it waits and asks again. */
/** Asks the worker to hold the parts opened later; it answers on the port when it has (the boot timeline's "fill done"). */
function askFill(sw: ServiceWorker | null): void {
  if (!sw) return;
  const ch = new MessageChannel();
  ch.port1.onmessage = () => stamp('fill');
  try { sw.postMessage('pps:fill', [ch.port2]); } catch { /* (no answer: the timeline reads "–") */ }
}
export function offerReload(say = useShell.getState().say, retry = (fn: () => void) => { clock.after(fn, RETRY_MS); }): void {
  const offer = () => {
    if (talkOn()) { retry(offer); return; }
    say(UPDATE_TOAST, 'info', { label: 'Reload', run: () => { void reloadKeepingState(); } }, true);   // (sticky: a note that fades is a note he misses)
  };
  offer();
}

/** Whether this page may install the offline copy: a built page, a browser with service workers, a real address, not another page's frame and not an ?embed address. */
export function mayRegister(env: { prod: boolean; hasWorker: boolean; protocol: string; search: string; framed: boolean }): boolean {
  return env.prod && env.hasWorker && env.protocol !== 'file:' && !env.framed && !new URLSearchParams(env.search).has('embed');
}

/** Is the worker that took over a different build from the one this page runs? (null: it did not answer, taken as new). */
export const isUpdate = (mine: readonly string[], held: readonly string[] | null): boolean => !holdsAll(mine, held);

export function registerPwa(): void {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return;
  let framed = true;
  try { framed = window.self !== window.top; } catch { /* (another site's frame) */ }
  if (!mayRegister({ prod: import.meta.env.PROD, hasWorker: 'serviceWorker' in navigator, protocol: location.protocol, search: location.search, framed })) return;
  const sw = navigator.serviceWorker;
  const watching = startUpdateWatch(() => offerReload());
  // A newer build took over this tab's files: the page's updater is told (src/pwa/update.ts: it eases onto the newest build at a safe moment, and the pill and a sticky note say so meanwhile).
  // The page also asks the host for the build itself, so a tab is told even when no worker update is ever seen. (Mohammad kept landing on old builds: 20 and 22 Nov.)
  if (sw.controller) {
    let offered = false;
    sw.addEventListener('controllerchange', async () => {
      if (offered) return;
      const now = sw.controller;
      if (now && holdsAll(loadedAssets(), await askFiles(now))) return;
      if (offered) return;
      offered = true;
      watching.found('');
    });
  }
  // (once the worker is active the page asks it to hold the parts opened later: 'pps:fill', scripts/pwa.mjs)
  /** Asks the host for a newer worker when the tab comes to the front, comes back online or has stayed open CHECK_MS (the browser asks only on a navigation, and once a day otherwise). */
  const watchForNewBuild = (reg: ServiceWorkerRegistration) => {
    let last = Date.now();
    const ask = () => { if (Date.now() - last < CHECK_GAP_MS || document.hidden) return; last = Date.now(); reg.update().catch(() => undefined); };
    document.addEventListener('visibilitychange', ask);
    addEventListener('pageshow', ask); addEventListener('online', ask);
    clock.every(ask, CHECK_MS);
  };
  // (the worker is registered, then asked to fill its cache, in the background slot: clock/idle.ts. Network jobs, not about the picture: they go after maxWaitMs even while something moves)
  // (not while the cover is up: the worker's install copies megabytes into the cache, and the first frame is what the person waits for)
  const go = (): void => { if (splashHeld()) { clock.after(go, 500); return; } install(); };
  const install = () => whenQuietOnce(() => {
    // (once the worker is active, its install list is held: the site may keep it (persistOnce); the fill of the parts opened later waits on Save-Data and 2g, those parts are fetched on use and kept)
    sw.register('./sw.js').then((reg) => { watchForNewBuild(reg); return sw.ready; }).then((r) => { void persistOnce(navigator.storage, door()); if (!lowData()) whenQuietOnce(() => askFill(r.active), { tag: 'sw-fill', maxWaitMs: 8000 }); })
      .catch((e) => console.warn('[pwa] no offline copy:', e));
  }, { tag: 'sw-register', delayMs: 1500, maxWaitMs: 8000 });
  if (document.readyState === 'complete') go(); else addEventListener('load', go, { once: true });
}
