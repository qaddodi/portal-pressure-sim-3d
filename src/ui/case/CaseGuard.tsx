// The case's guard on the page (docs/approved/play-the-case.md, screens mac-leave, phone-leave, phone-off): the question a course-changing step asks while a case plays, in the shell's own
// dialog frame (Stay is the default), and, once the case is left, the line over the play bar that keeps the way back. Both stay in the page and fade; neither blanks before it goes.
import { useEffect, useRef } from 'react';
import { useGuard, stayInCase, leaveForStep, type Ask } from './guard.ts';
import { useCase } from './store.ts';
import { Icon } from '../shell/icons.tsx';
import './case.css';

/** "Draining fluid changes this patient's course." with Leave and Stay. Esc and the scrim are Stay. */
export function CaseGuardDialog() {
  const ask = useGuard((s) => s.ask);
  const last = useRef<Ask | null>(null);
  // (kept while it fades out, so it never blanks first)
  if (ask) last.current = ask;
  const stay = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!ask) return;
    stay.current?.focus({ preventScroll: true });
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); stayInCase(); } };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [ask]);
  const w = (ask ?? last.current)?.words;
  return (
    <>
      <div className="sh-scrim" data-open={!!ask} onPointerDown={() => { if (ask) stayInCase(); }} />
      <div className="sh-dialog sh-dialog--deck cs-guard" data-open={!!ask} role="alertdialog" aria-modal="true" aria-label={w?.title} inert={!ask}>
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
      </div>
    </>
  );
}

// (the runner is read when the button is pressed: a left case has loaded it already, and the boot entry stays without it)
const back = (): void => { void import('./run.ts').then((m) => m.backToCase()); };

/** "Your own course from Day 70 · Back to the case", over the play bar while the case is left. */
export function CaseOwnLine({ hidden }: { hidden: boolean }) {
  const left = useCase((s) => s.phase === 'left');
  const day = useCase((s) => s.leftDay);
  const kept = useRef<number | null>(null);
  // (the day stays while the line fades out)
  if (left && day != null) kept.current = day;
  const open = left && !hidden;
  return (
    <div className="cs-own" data-open={open} role="group" aria-label="Your own course" inert={!open}>
      <span className="cs-own-w"><b>Your own course</b> from Day {Math.round(kept.current ?? 0)}</span>
      <button type="button" className="cs-own-back" onClick={back}><Icon n="undo" /><span>Back to the case</span></button>
    </div>
  );
}
