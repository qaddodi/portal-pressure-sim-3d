// The build pill: the 2D app's orange "PREVIEW · <commit>" tab hanging from the top edge, ported 1:1 (2D: scripts/preview-badge.mjs). It says which build this page is
// (the short commit the deploy stamped in, the same one dist/build-info.txt holds). Tapping it loads the newest build, which an installed home-screen app has no other way
// to do: it drops this copy's service worker and caches (only this scope's; the 2D app and other apps on the origin keep theirs), then reloads with a cache-busting
// address that keeps the page's own query (the same talk and slide, or the same patient with its settings, view and camera: the address of what is on the screen, shareLinkNow). Absolute, not fixed, as in 2D: the page never scrolls, so it stays in place.
import { useState } from 'react';
import { buildLabel, pillColor, updateText, BADGE_H } from './build-pill.ts';
import { useUpdate } from '../../pwa/update-state.ts';
import { useSettings } from '../../state/settings.ts';
import { loadNewestBuild } from '../../boot/reload.ts';

export function BuildPill() {
  const [busy, setBusy] = useState(false);
  const shown = useSettings((s) => s.showBuildPill);   // (Settings › Diagnostics › Preview pill; the build is then named in that menu)
  const newer = useUpdate((u) => u.commit);   // (a newer build is out: the pill says so, in green, and keeps showing the commit this page runs)
  const label = buildLabel(import.meta.env.VITE_BUILD as string | undefined);
  // (the shared path: boot/reload.ts loadNewestBuild, which Settings › Diagnostics › Update now takes too)
  const reload = () => { if (busy) return; setBusy(true); void loadNewestBuild(); };
  if (!shown) return null;
  return (
    <div id="preview-badge" data-capture-skip="" role="button" tabIndex={0} onClick={reload} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') reload(); }}
      style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', top: 'var(--safe-t)', zIndex: 2147483647, cursor: 'pointer', WebkitTapHighlightColor: 'transparent', padding: '0 8px', borderRadius: '0 0 8px 8px', background: pillColor(newer), color: '#fff', font: `700 12px/${BADGE_H}px system-ui,sans-serif`, letterSpacing: '.04em', whiteSpace: 'nowrap', boxShadow: '0 1px 4px rgba(0,0,0,.35)' }}>
      {busy ? 'RELOADING…' : updateText(label, newer)}
    </div>
  );
}
