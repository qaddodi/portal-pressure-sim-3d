// Offline: registers the service worker the build writes (scripts/pwa.mjs), as the 2D app does (main.js): only in a production build, once the page has loaded and been left
// alone a moment, so the first paint and the first touches never wait for it. A new version takes over this tab's files while it is open (the worker claims its pages): the page
// keeps running the files it began with, so, once, it is offered a reload: never by itself, and not while a talk plays (it is put up again when the talk ends).
// The first install, with no worker before it, is not an update; and a page opened after a deploy is already on the new files, so nothing is offered to it.
import { useShell } from '../ui/shell/store.ts';
import { reloadKeepingState } from '../boot/reload.ts';
import { talkOn } from '../state/deck.ts';

export const UPDATE_TOAST = 'A new version of the simulator is ready.';
/** How long a held offer waits before it asks again (a talk is on). */
export const RETRY_MS = 30000;

/** How often a tab that stays open asks the host whether a newer build is out, and the least gap between two asks (a tab brought back to the front asks at once, not twice in a breath).
 *  A page that is never navigated gets no update check from the browser (a phone's home-screen app resumes from sleep without one), so the page asks for itself. */
export const CHECK_MS = 5 * 60_000, CHECK_GAP_MS = 20_000;
/** Whether the tab takes the newer build now, by itself: only when it is out of sight (nothing on the screen jumps), a build is waiting, and no talk plays. */
export const takesOverNow = (s: { pending: boolean; hidden: boolean; mode: string }): boolean => s.pending && s.hidden && s.mode !== 'deck';

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
    const ch = new MessageChannel(), t = setTimeout(() => res(null), 2000);
    ch.port1.onmessage = (e) => { clearTimeout(t); res(e.data); };
    try { sw.postMessage('pps:files', [ch.port2]); } catch { clearTimeout(t); res(null); }
  });
}

/** The offer: one line at the foot with a Reload button; in a talk it waits and asks again. */
export function offerReload(say = useShell.getState().say, retry = (fn: () => void) => { setTimeout(fn, RETRY_MS); }): void {
  const offer = () => {
    if (talkOn()) { retry(offer); return; }
    say(UPDATE_TOAST, 'info', { label: 'Reload', run: () => location.reload() });
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
  // A newer build took over this tab's files: it is taken up as soon as the tab is out of sight (a tab left in the background, or a phone's app put away, comes back on the newest
  // build with nothing seen to change); while the tab is in front it is offered once, never forced. (Mohammad kept landing on old builds: 20 Nov.)
  let pending = false;
  const takeOver = () => { if (takesOverNow({ pending, hidden: document.hidden, mode: talkOn() ? 'deck' : 'figure' })) { pending = false; void reloadKeepingState(); } };
  if (sw.controller) {
    let offered = false;
    sw.addEventListener('controllerchange', async () => {
      if (offered) return;
      const now = sw.controller;
      if (now && holdsAll(loadedAssets(), await askFiles(now))) return;
      if (offered) return;
      offered = true; pending = true;
      if (document.hidden) takeOver(); else offerReload();
    });
    document.addEventListener('visibilitychange', () => { if (document.hidden) takeOver(); });
  }
  const idle = (fn: () => void) => { const ric = (window as { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => void }).requestIdleCallback; if (ric) ric(fn, { timeout: 5000 }); else setTimeout(fn, 1500); };
  // (once the worker is active the page asks it to hold the parts opened later: 'pps:fill', scripts/pwa.mjs)
  /** Asks the host for a newer worker when the tab comes to the front, comes back online or has stayed open CHECK_MS (the browser asks only on a navigation, and once a day otherwise). */
  const watchForNewBuild = (reg: ServiceWorkerRegistration) => {
    let last = Date.now();
    const ask = () => { if (Date.now() - last < CHECK_GAP_MS || document.hidden) return; last = Date.now(); reg.update().catch(() => undefined); };
    document.addEventListener('visibilitychange', ask);
    addEventListener('pageshow', ask); addEventListener('online', ask);
    setInterval(ask, CHECK_MS);
  };
  const go = () => idle(() => {
    sw.register('./sw.js').then((reg) => { watchForNewBuild(reg); return sw.ready; }).then((r) => idle(() => r.active?.postMessage('pps:fill')))
      .catch((e) => console.warn('[pwa] no offline copy:', e));
  });
  if (document.readyState === 'complete') go(); else addEventListener('load', go, { once: true });
}
