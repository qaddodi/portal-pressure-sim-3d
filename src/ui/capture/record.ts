// Settings > Record window: a video of this window, as it is on screen, saved when the person stops it. The browser asks what to share
// (this tab is offered first where it can say so), MediaRecorder writes it (WebM, or MP4 where that is what the browser writes), and it
// downloads under the capture files' name. The phases and the shortcut are record-model.ts; what happens on each step is record-run.ts.
// Loaded with the Settings sheet, never fetched on a tap: Safari lets a page ask to share a screen only inside the tap itself, so there
// is no import() between the press and the browser's question.
import { create } from 'zustand';
import { useShell } from '../shell/store.ts';
import { useEngine } from '../../engine/index.ts';
import { saveBlob } from '../deck/download.ts';
import { commitOf } from '../../boot/release.ts';
import { RECORD } from '../shell/words.ts';
import { canRecordWindow, pickRecordMime, recordFileName, type RecordPhase } from './record-model.ts';
import { createRecordRun, type RecorderLike, type StreamLike } from './record-run.ts';

/** What Record window is doing now (the Settings row reads it). */
export const useRecording = create<{ phase: RecordPhase }>(() => ({ phase: 'idle' }));

/** Can this browser record the window: it can share a screen and write video. Looked for in the page, not read from the user agent, so an iPhone (neither) and an old browser
    do not see the row. */
export function recordAvailable(): boolean {
  if (typeof navigator === 'undefined' || typeof MediaRecorder === 'undefined') return false;
  return canRecordWindow({ getDisplayMedia: navigator.mediaDevices?.getDisplayMedia?.bind(navigator.mediaDevices), MediaRecorder });
}

/** The share options this page asks for. preferCurrentTab and the rest are Chrome's: a browser that does not know them ignores them. */
type ShareOptions = DisplayMediaStreamOptions & { preferCurrentTab?: boolean; selfBrowserSurface?: 'include' | 'exclude'; surfaceSwitching?: 'include' | 'exclude' };
const SHARE: ShareOptions = { video: { displaySurface: 'browser' }, audio: false, preferCurrentTab: true, selfBrowserSurface: 'include', surfaceSwitching: 'exclude' };

/** The window being shared (the run holds it as a StreamLike; the recorder wants the real stream). */
let shared: MediaStream | null = null;
async function ask(): Promise<StreamLike> {
  const md = navigator.mediaDevices;
  try { shared = await md.getDisplayMedia(SHARE); }
  catch (e) {
    // a browser that refuses the hints (a TypeError) is asked again plainly; a person's "no" is not asked twice
    if ((e as { name?: string } | null)?.name !== 'TypeError') throw e;
    shared = await md.getDisplayMedia({ video: true, audio: false });
  }
  return shared;
}

const run = createRecordRun({
  ask,
  recorder: (): RecorderLike => {
    if (!shared) throw new Error('no window is being shared');
    const mime = pickRecordMime(typeof MediaRecorder.isTypeSupported === 'function' ? (m) => MediaRecorder.isTypeSupported(m) : undefined);
    return new MediaRecorder(shared, mime ? { mimeType: mime } : undefined);
  },
  save: (video, ext) => {
    const sh = useShell.getState(), at = new Date();
    const name = recordFileName(sh.view, useEngine.getState().presetId ?? sh.patientId, commitOf(import.meta.env.VITE_BUILD) || 'local', at, ext === 'mp4' ? 'video/mp4' : 'video/webm');
    saveBlob(video, name, 20000);
  },
  tell: (note) => {
    const sh = useShell.getState();
    if (note === 'recording') sh.say(RECORD.on, 'info', { label: RECORD.stop, run: () => { void run.press(); } });
    else if (note === 'saved') sh.say(RECORD.saved);
    else sh.say(RECORD.failed, 'bad');
  },
  onPhase: (phase) => useRecording.setState({ phase }),
});

/** The row or the shortcut: start recording (the Settings sheet lets go first, so it is not the first thing in the video), or stop and save. Call it from the tap or the key,
    with nothing awaited before it. */
export function toggleRecording(): Promise<void> {
  if (!recordAvailable()) return Promise.resolve();
  if (run.phase() === 'idle') useShell.getState().close();
  return run.press();
}
