// About the model, References and Privacy: the 2D app's own dialog (util.js openModal: .modal > header + .body, on the 2D stylesheet), its pages copied by scripts/copy-about.mjs
// from openAbout() and openPrivacy() and drawn here node for node. References is About scrolled to its list (2D: openAbout('refs')). Where the dialog stands, how it comes and goes
// and how it closes are the dialog shell's (surface/Dialog.tsx; the 2D .modal-back is not used); its leave is leaveMs('dialog') on the motion scale (surface/motion.ts).
import { useState } from 'react';
import { ABOUT, PRIVACY, type Page } from './about.copied.ts';
import { draw } from './draw.ts';
import { useShell } from './store.ts';
import { registerFeature } from './features.ts';
import { STORAGE_PREFIX } from '../../state/settings.ts';
import { resetUrl } from './reset.ts';
import { thisRelease } from '../../boot/release.ts';
import { Dialog, DialogPage, useDialogPresence } from '../surface/Dialog.tsx';

/** A wide page (2D openModal's `wide`) is wider than the shell's page width. */
const WIDE = { width: 'min(960px, 100%)' } as const;

/** 2D clearRow(): "Clear my data on this device" asks in place, in the dialog's own words, and its two answers; Cancel brings the button back. */
function ClearRow() {
  const [asking, setAsking] = useState(false);
  const wipe = () => {
    try { for (const k of Object.keys(localStorage)) if (k.startsWith(STORAGE_PREFIX)) localStorage.removeItem(k); } catch { /* storage unavailable: nothing was stored */ }
    useShell.setState({ dialog: null }); useShell.getState().say('Done. Everything saved on this device is cleared.');
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

/** One page dialog, About (and References, its list) or Privacy: the 2D page body in the dialog shell's page (surface/Dialog.tsx DialogPage), drawn while it is up and for its leave. */
function PageOf({ which, open, section }: { which: 'about' | 'privacy'; open: boolean; section: 'refs' | null }) {
  const present = useDialogPresence(open);
  const page = pageOf(which);
  const sub = page.sub && which === 'about' ? `${page.sub} · ${thisRelease()}` : page.sub ?? null;
  return present ? (
    <DialogPage open={open} title={page.title} sub={sub} section={open ? section : null} onClose={close}>{draw(page.body, 0, () => <ClearRow />)}</DialogPage>
  ) : null;
}

const close = () => useShell.setState({ dialog: null });

export function PageDialog() {
  const dialog = useShell((s) => s.dialog);
  const section = useShell((s) => s.aboutSection);
  return (
    <>
      <Dialog id="about" size="l" open={dialog === 'about'} label={ABOUT.title} onCancel={close} className="modal" style={ABOUT.wide ? WIDE : undefined}>
        <PageOf which="about" open={dialog === 'about'} section={section} />
      </Dialog>
      <Dialog id="privacy" size="l" open={dialog === 'privacy'} label={PRIVACY.title} onCancel={close} className="modal" style={PRIVACY.wide ? WIDE : undefined}>
        <PageOf which="privacy" open={dialog === 'privacy'} section={null} />
      </Dialog>
    </>
  );
}
