// Record window's mark while it records: the stop button beside the Settings gear (a ring with a square in it, pulsing red; it may be in the video). Nothing is drawn when nothing records.
import { RECORD } from '../shell/words.ts';
import { useRecording, toggleRecording } from './record-model.ts';
import './record.css';

/** The width one more 44 px button gives the presenter pill while Stop stands in it. */
export const RECORD_STOP_W = 44;

/** A ring with a square in it (the recorder's stop). */
const StopMark = () => (
  <svg className="sh-ic rec-mark" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.8" /><rect x="9" y="9" width="6" height="6" rx="1" fill="currentColor" />
  </svg>
);

/** The stop button: nothing unless a recording is running. `tab`: the thumb bar's tab with its word under it; otherwise a round icon button like the Settings gear's. */
export function RecordStop({ tab = false }: { tab?: boolean }) {
  const on = useRecording((s) => s.phase === 'recording');
  if (!on) return null;
  const press = () => { void toggleRecording(); };
  return tab
    ? <button type="button" className="nb-tab rec-stop" aria-label={RECORD.stopButton} title={RECORD.stopHint} onClick={press}><StopMark /><span className="nb-l">Stop</span></button>
    : <button type="button" className="ib rec-stop" aria-label={RECORD.stopButton} title={RECORD.stopHint} onClick={press}><StopMark /></button>;
}

/** True while the stop button is on screen (the presenter pill makes room for it). */
export const useRecordingNow = (): boolean => useRecording((s) => s.phase === 'recording');
