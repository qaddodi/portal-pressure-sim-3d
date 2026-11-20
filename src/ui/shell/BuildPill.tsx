// The build pill: the 2D app's orange "PREVIEW · <commit>" tab hanging from the top edge, ported 1:1 (2D: scripts/preview-badge.mjs). It says which build this page is
// (the short commit the deploy stamped in, the same one dist/build-info.txt holds). Tapping it loads the newest build, which an installed home-screen app has no other way
// to do: it drops this copy's service worker and caches (only this scope's; the 2D app and other apps on the origin keep theirs), then reloads with a cache-busting
// address that keeps the page's own query (the same talk and slide, or the same patient with its settings, view and camera: the address of what is on the screen, shareLinkNow). Absolute, not fixed, as in 2D: the page never scrolls, so it stays in place.
import { useState } from 'react';
import { buildLabel, cachePrefix, reloadUrl, BADGE_H } from './build-pill.ts';
import { shareLinkNow } from './share-wire.ts';

async function dropThisCopy(): Promise<void> {
  const scope = new URL('./', location.href), pre = cachePrefix(location.href), jobs: Promise<unknown>[] = [];
  if (navigator.serviceWorker?.getRegistrations) jobs.push(navigator.serviceWorker.getRegistrations().then((rs) => Promise.all(rs.filter((r) => r.scope === scope.href).map((r) => r.unregister()))));
  if ('caches' in window) jobs.push(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith(pre)).map((k) => caches.delete(k)))));
  await Promise.all(jobs);
}

export function BuildPill() {
  const [busy, setBusy] = useState(false);
  const label = buildLabel(import.meta.env.VITE_BUILD as string | undefined);
  // (the address that reopens what is on the screen: the talk and its slide, or the patient with its settings, view and camera; read when the page is left, not when the pill was drawn)
  const go = () => { let state: string | null = null; try { state = shareLinkNow(); } catch { /* (the app is not up: the page's own address) */ } location.replace(reloadUrl(location.href, Date.now(), state)); };
  const reload = () => {
    if (busy) return;
    setBusy(true);
    const t = setTimeout(go, 3000);
    dropThisCopy().catch(() => undefined).then(() => { clearTimeout(t); go(); });
  };
  return (
    <div id="preview-badge" role="button" tabIndex={0} onClick={reload} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') reload(); }}
      style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', top: 'env(safe-area-inset-top)', zIndex: 2147483647, cursor: 'pointer', WebkitTapHighlightColor: 'transparent', padding: '0 8px', borderRadius: '0 0 8px 8px', background: '#c9430d', color: '#fff', font: `700 12px/${BADGE_H}px system-ui,sans-serif`, letterSpacing: '.04em', whiteSpace: 'nowrap', boxShadow: '0 1px 4px rgba(0,0,0,.35)' }}>
      {busy ? 'RELOADING…' : `PREVIEW${label ? ` · ${label}` : ''}`}
    </div>
  );
}
