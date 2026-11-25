// Reload onto the newest build keeping what is on the screen (the build pill's own address: the talk and slide, or the patient with settings, view and camera).
import { reloadUrl, cachePrefix } from '../ui/shell/build-pill.ts';
import { clock } from '../clock/frame.ts';

export async function reloadKeepingState(): Promise<void> {
  let state: string | null = null;
  try { state = (await import('../ui/shell/share-wire.ts')).shareLinkNow(); } catch { /* (the app is not up: the page's own address) */ }
  location.replace(reloadUrl(location.href, Date.now(), state));
}

/** Drops this copy's service worker and caches (this scope's only: the 2D app and other apps on the origin keep theirs). */
export async function dropThisCopy(): Promise<void> {
  const scope = new URL('./', location.href), pre = cachePrefix(location.href), jobs: Promise<unknown>[] = [];
  if (navigator.serviceWorker?.getRegistrations) jobs.push(navigator.serviceWorker.getRegistrations().then((rs) => Promise.all(rs.filter((r) => r.scope === scope.href).map((r) => r.unregister()))));
  if ('caches' in window) jobs.push(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith(pre)).map((k) => caches.delete(k)))));
  await Promise.all(jobs);
}

/**
 * Load the newest build, which an installed home-screen app has no other way to do: drop this copy, then reload onto the address of what is on the screen. The one path the build pill and
 * Settings › Diagnostics › Update now both take. A copy that is slow to drop is not waited on for more than 3 s.
 */
export function loadNewestBuild(): Promise<void> {
  const t = clock.after(() => { void reloadKeepingState(); }, 3000);
  return dropThisCopy().catch(() => undefined).then(() => { clock.cancel(t); return reloadKeepingState(); });
}
