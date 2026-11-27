// The case's guard on the page (docs/approved/play-the-case.md, screens mac-leave, phone-leave, phone-off): the question a course-changing step asks while a case plays, in the dialog shell
// (surface/Dialog.tsx; Stay is the default), and, once the case is left, the line over the play bar that keeps the way back. Both stay in the page and fade; neither blanks before it goes.
import { useRef } from 'react';
import { useGuard, stayInCase, leaveForStep, type Ask } from './guard.ts';
import { useCase } from './store.ts';
import { Icon } from '../shell/icons.tsx';
import { Dialog } from '../surface/Dialog.tsx';
import './guard.css';

/** "Draining fluid changes this patient's course." with Leave and Stay. Esc and a press outside are Stay, and Stay has the focus. */
export function CaseGuardDialog() {
  const ask = useGuard((s) => s.ask);
  const last = useRef<Ask | null>(null);
  // (kept while it fades out, so it never blanks first)
  if (ask) last.current = ask;
  const stay = useRef<HTMLButtonElement>(null);
  const w = (ask ?? last.current)?.words;
  return (
    <Dialog id="case-guard" size="s" open={!!ask} role="alertdialog" label={w?.title ?? ''} onCancel={() => { if (ask) stayInCase(); }} initialFocus={stay}
      className="sh-dialog sh-dialog--deck cs-guard">
      {w && <>
        <div className="cs-kicker">{w.kicker}</div>
        <h2>{w.title}</h2>
        <p>{w.body}</p>
        {w.keep && <p>{w.keep}</p>}
        <div className="sh-btns">
          <button type="button" className="sh-btn cs-leave" onClick={leaveForStep}>{w.leave}</button>
          <button type="button" ref={stay} className="sh-btn" data-primary="true" onClick={stayInCase}>{w.stay}</button>
        </div>
      </>}
    </Dialog>
  );
}

// (the runner is read when the button is pressed: a left case has loaded it already, and the boot entry stays without it)
const back = (): void => { void import('./run.ts').then((m) => m.backToCase()); };

/** "Your own course from Day 70 · Back to the case", over the play bar while the case is left. */
/** `away`: a talk is on, so the line gives way (it eases out with the rest, data-open; it is not the DOM's `hidden`). */
export function CaseOwnLine({ away }: { away: boolean }) {
  const left = useCase((s) => s.phase === 'left');
  const day = useCase((s) => s.leftDay);
  const kept = useRef<number | null>(null);
  // (the day stays while the line fades out)
  if (left && day != null) kept.current = day;
  const open = left && !away;
  return (
    <div className="cs-own" data-open={open} role="group" aria-label="Your own course" inert={!open}>
      <span className="cs-own-w"><b>Your own course</b> from Day {Math.round(kept.current ?? 0)}</span>
      <button type="button" className="cs-own-back" onClick={back}><Icon n="undo" /><span>Back to the case</span></button>
    </div>
  );
}
