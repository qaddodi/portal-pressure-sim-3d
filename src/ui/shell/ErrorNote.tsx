import { useState } from 'react';
import { useCrashNet, dismissBroken, detailsNow } from '../../boot/crash-net.ts';
import { reloadKeepingState } from '../../boot/reload.ts';
import { ERROR_NOTE, feedbackEmail } from './words.ts';
import './shell.css';

/** The quiet recovery when errors no boundary sees have left the app broken (boot/crash-net.ts): a pill over the figure's note with Reload (back on the same talk or patient), Copy details and Keep going.
 *  Always mounted, so it fades in and out on opacity, never pops (the same pill as the lost-context note). */
export function ErrorNote() {
  const broken = useCrashNet((s) => s.broken);
  const [copied, setCopied] = useState(false);
  const email = feedbackEmail();   // (the address is in the build, never in the source: no address, no button)
  return (
    <div className="sh-glnote sh-errnote" role="status" aria-live="polite" aria-hidden={!broken} inert={!broken} style={{ opacity: broken ? 1 : 0, pointerEvents: broken ? 'auto' : 'none' }}>
      <span>{ERROR_NOTE.text}</span>
      <button type="button" onClick={() => { void reloadKeepingState(); }}>{ERROR_NOTE.reload}</button>
      <button type="button" className="sh-glnote-alt" onClick={() => { void navigator.clipboard?.writeText(detailsNow(ERROR_NOTE.text)).then(() => setCopied(true), () => undefined); }}>{copied ? ERROR_NOTE.copied : ERROR_NOTE.copy}</button>
      {email ? <button type="button" className="sh-glnote-alt" onClick={() => { void import('./send-feedback.ts').then((m) => m.sendFeedback(email)); }}>{ERROR_NOTE.send}</button> : null}
      <button type="button" className="sh-glnote-alt" onClick={() => { setCopied(false); dismissBroken(); }}>{ERROR_NOTE.keep}</button>
    </div>
  );
}
