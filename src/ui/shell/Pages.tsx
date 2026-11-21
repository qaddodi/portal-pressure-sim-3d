// About the model, References and Privacy: the 2D app's own dialog (util.js openModal: .modal-back > .modal > header + .body), its pages copied by scripts/copy-about.mjs
// from openAbout() and openPrivacy() and drawn here node for node on the 2D stylesheet. References is About scrolled to its list (2D: openAbout('refs')).
import { useEffect, useRef, useState } from 'react';
import { ABOUT, PRIVACY, type Page } from './about.copied.ts';
import { draw } from './draw.ts';
import { useShell } from './store.ts';
import { registerFeature } from './features.ts';
import { Icon } from './icons.tsx';
import { STORAGE_PREFIX } from '../../state/settings.ts';
import { resetUrl } from './reset.ts';
import { thisRelease } from '../../boot/release.ts';

import { clock } from '../../clock/frame.ts';
const LEAVE_MS = 180;   // 2D --d-flip: the dialog sinks back, then is hidden (closeModal)

/** 2D clearRow(): "Clear my data on this device" asks in place, in the dialog's own words, and its two answers; Cancel brings the button back. */
function ClearRow() {
  const [asking, setAsking] = useState(false);
  const wipe = () => {
    try { for (const k of Object.keys(localStorage)) if (k.startsWith(STORAGE_PREFIX)) localStorage.removeItem(k); } catch { /* storage unavailable: nothing was stored */ }
    useShell.setState({ dialog: null }); useShell.getState().say('Your data on this device has been cleared.');
    location.replace(resetUrl(location.href));
  };
  return asking ? (
    <div className="btn-row">
      <p className="clear-q" role="alert">Delete everything this simulator has stored on this device?</p>
      <div className="btn-row"><button type="button" className="btn" autoFocus onClick={() => setAsking(false)}>Keep it</button><button type="button" className="btn danger-fill" onClick={wipe}>Delete it</button></div>
    </div>
  ) : <div className="btn-row"><button type="button" className="btn" onClick={() => setAsking(true)}>Clear my data on this device</button></div>;
}

const pageOf = (d: 'about' | 'privacy'): Page => (d === 'about' ? ABOUT : PRIVACY);
export const openAbout = (section: 'refs' | null = null) => useShell.setState({ sheet: null, dialog: 'about', aboutSection: section });
registerFeature('guide-about', () => openAbout());
registerFeature('guide-references', () => openAbout('refs'));
registerFeature('guide-privacy', () => useShell.setState({ sheet: null, dialog: 'privacy', aboutSection: null }));

export function PageDialog() {
  const dialog = useShell((s) => s.dialog);
  const section = useShell((s) => s.aboutSection);
  const want = dialog === 'about' || dialog === 'privacy' ? dialog : null;
  // the page stays while the dialog sinks back
  const [shown, setShown] = useState<'about' | 'privacy' | null>(null);
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    if (want) { setShown(want); setLeaving(false); return; }
    if (!shown) return;
    setLeaving(true);
    const t = clock.after(() => { setShown(null); setLeaving(false); }, LEAVE_MS);
    return () => clock.cancel(t);
  }, [want, shown]);
  const modal = useRef<HTMLDivElement>(null);
  const head = useRef<HTMLElement>(null);
  const mark = useRef<HTMLDivElement>(null);
  // the title and its close button stay in view over a long page; a hairline marks the edge once it has scrolled under them
  useEffect(() => {
    const m = mark.current, root = modal.current;
    if (!m || !root || !shown || typeof IntersectionObserver !== 'function') return;
    const io = new IntersectionObserver(([e]) => head.current?.classList.toggle('scrolled', !e.isIntersecting), { root, rootMargin: '2px 0px 0px 0px' });
    io.observe(m);
    return () => io.disconnect();
  }, [shown]);
  useEffect(() => {
    if (!want || !modal.current) return;
    const el = section ? modal.current.querySelector<HTMLElement>(`[data-sec="${section}"]`) : null;
    if (el) el.scrollIntoView({ block: 'start' }); else modal.current.scrollTop = 0;
  }, [want, section]);
  const page = shown ? pageOf(shown) : null;
  const close = () => useShell.setState({ dialog: null });
  const sub = page?.sub && shown === 'about' ? `${page.sub} · ${thisRelease()}` : page?.sub ?? null;
  return (
    <div className={`modal-back${shown ? (leaving ? ' leaving' : ' show') : ''}`} id="modalBack" onPointerDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="modal" id="modal" role="dialog" aria-modal="true" aria-label={page?.title ?? 'Dialog'} ref={modal} inert={!want} style={page?.wide ? { width: 'min(960px, 100%)' } : undefined}>
        {page && (
          <>
            <div ref={mark} className="modal-top-mark" aria-hidden="true" style={{ height: 1, marginBottom: -1 }} />
            <header ref={head}>
              <div style={{ flex: 1, minWidth: 0 }}><h2>{page.title}</h2>{sub ? <div className="sub">{sub}</div> : null}</div>
              <button type="button" className="ib" aria-label="Close" onClick={close}><Icon n="close" /></button>
            </header>
            <div className="body">{draw(page.body, 0, () => <ClearRow />)}</div>
          </>
        )}
      </div>
    </div>
  );
}
