// Offline: registers the service worker the build writes (scripts/pwa.mjs), as the 2D app does (main.js): only in a production build, once the page has loaded and been left
// alone a moment, so the first paint and the first touches never wait for it. A new version takes over this tab's files while it is open (the worker claims its pages): the page
// keeps running the files it began with, so, once, it is offered a reload: never by itself, and not while a talk plays (it is put up again when the talk ends).
// The first install, with no worker before it, is not an update; and a page opened after a deploy is already on the new files, so nothing is offered to it.
import { useShell } from '../ui/shell/store.ts';

export const UPDATE_TOAST = 'A new version of the simulator is ready.';
/** How long a held offer waits before it asks again (a talk is on). */
export const RETRY_MS = 30000;

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
    if (useShell.getState().mode === 'deck') { retry(offer); return; }
    say(UPDATE_TOAST, 'info', { label: 'Reload', run: () => location.reload() });
  };
  offer();
}

export function registerPwa(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator) || location.protocol === 'file:') return;
  const sw = navigator.serviceWorker;
  if (sw.controller) {
    let offered = false;
    sw.addEventListener('controllerchange', async () => {
      if (offered) return;
      const now = sw.controller;
      if (now && holdsAll(loadedAssets(), await askFiles(now))) return;
      if (offered) return;
      offered = true;
      offerReload();
    });
  }
  const go = () => {
    const idle = (window as { requestIdleCallback?: (fn: () => void) => void }).requestIdleCallback ?? ((fn: () => void) => { setTimeout(fn, 1500); });
    idle(() => { sw.register('./sw.js').catch((e) => console.warn('[pwa] no offline copy:', e)); });
  };
  if (document.readyState === 'complete') go(); else addEventListener('load', go, { once: true });
}
