// Offline: registers the service worker the build writes (scripts/pwa.mjs). Only in a production build, after the page has loaded, so the first paint never waits for it.
export function registerPwa(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  const go = () => { navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('[pwa] no offline copy:', e)); };
  if (document.readyState === 'complete') go(); else addEventListener('load', go, { once: true });
}
