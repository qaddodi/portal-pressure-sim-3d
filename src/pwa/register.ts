// Offline: registers the service worker the build writes (scripts/pwa.mjs), as the 2D app does (its src/ui/main.js). Only in a production build, never inside another
// page's frame or an ?embed address, and only once the first picture is up and the page has loaded and gone idle, so the worker's install (every boot file, fetched at
// once) does not compete with the first paint. Once the worker is active the page asks it to hold the parts opened later ('pps:fill').
// A new version that takes over a tab already open is offered once as a toast with Reload (never a reload by itself, and held while a talk plays): the page keeps
// running the files it began with, and the worker serves it the older build's files it has not opened yet.
import { useShell } from '../ui/shell/store.ts';
import { useDeck } from '../state/deck.ts';

export const UPDATE_READY = 'A new version of the simulator is ready.';
export const UPDATE_RELOAD = 'Reload';

/** Whether this page may install the offline copy: a built page, a browser with service workers, a real address, not an embed. */
export function mayRegister(env: { prod: boolean; hasWorker: boolean; protocol: string; search: string; framed: boolean }): boolean {
  return env.prod && env.hasWorker && env.protocol !== 'file:' && !env.framed && !new URLSearchParams(env.search).has('embed');
}

/** Is the worker that took over a different build from the one this page runs? `mine`: the hashed files this page loaded; `held`: the files the new worker holds
 *  (null when it did not answer). A page opened after a deploy is already on the new files: that is no update for it. */
export function isUpdate(mine: readonly string[], held: readonly string[] | null): boolean {
  if (!held || mine.length === 0) return true;
  return !mine.every((f) => held.includes(f));
}

/** The hashed files this page was built from, as the worker lists them ("assets/…"). */
function pageFiles(doc: Document): string[] {
  return [...doc.querySelectorAll('script[type="module"][src], link[rel="stylesheet"][href]')]
    .map((n) => (n.getAttribute('src') ?? n.getAttribute('href') ?? '').replace(/^\.\//, '')).filter((u) => u.startsWith('assets/'));
}

function filesOf(sw: ServiceWorker): Promise<string[] | null> {
  return new Promise((res) => {
    const ch = new MessageChannel(), t = setTimeout(() => res(null), 2000);
    ch.port1.onmessage = (e) => { clearTimeout(t); res(Array.isArray(e.data) ? (e.data as string[]) : null); };
    try { sw.postMessage('pps:files', [ch.port2]); } catch { clearTimeout(t); res(null); }
  });
}

function offerReload(): void {
  if (useDeck.getState().mode === 'deck') { setTimeout(offerReload, 30000); return; }   // (not over a slide: asked again once the talk is over)
  useShell.getState().say(UPDATE_READY, 'info', { label: UPDATE_RELOAD, run: () => location.reload() });
}

export function registerPwa(): void {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return;
  let framed = true;
  try { framed = window.self !== window.top; } catch { /* (another site's frame) */ }
  if (!mayRegister({ prod: import.meta.env.PROD, hasWorker: 'serviceWorker' in navigator, protocol: location.protocol, search: location.search, framed })) return;
  const sw = navigator.serviceWorker;
  if (sw.controller) {   // (the first install, with no worker before it, is not an update)
    let offered = false;
    sw.addEventListener('controllerchange', () => {
      if (offered || !sw.controller) return;
      void filesOf(sw.controller).then((held) => { if (offered || !isUpdate(pageFiles(document), held)) return; offered = true; offerReload(); });
    });
  }
  const idle = (fn: () => void) => { const ric = (window as { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => void }).requestIdleCallback; if (ric) ric(fn, { timeout: 5000 }); else setTimeout(fn, 1500); };
  const go = () => idle(() => {
    sw.register('./sw.js').then(() => sw.ready).then((r) => idle(() => r.active?.postMessage('pps:fill')))
      .catch((e) => console.warn('[pwa] no offline copy:', e));
  });
  if (document.readyState === 'complete') go(); else addEventListener('load', go, { once: true });
}
