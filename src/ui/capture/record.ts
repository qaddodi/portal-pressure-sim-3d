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
import { canRecordWindow, noteWords, pickRecordMime, recordFileName, recordSize, recordBitrate, RECORD_FPS, type RecordPhase } from './record-model.ts';
import { createRecordRun, raiseToFullSize, type RecorderLike, type StreamLike } from './record-run.ts';

/** What Record window is doing now (the Settings row and the stop button read it). */
export const useRecording = create<{ phase: RecordPhase }>(() => ({ phase: 'idle' }));

/** Can this browser record the window: it can share a screen and write video. Looked for in the page, not read from the user agent, so an iPhone (neither) and an old browser
    do not see the row. */
export function recordAvailable(): boolean {
  if (typeof navigator === 'undefined' || typeof MediaRecorder === 'undefined') return false;
  return canRecordWindow({ getDisplayMedia: navigator.mediaDevices?.getDisplayMedia?.bind(navigator.mediaDevices), MediaRecorder });
}

/** The share options this page asks for. preferCurrentTab and the rest are Chrome's: a browser that does not know them ignores them. */
type ShareOptions = DisplayMediaStreamOptions & { preferCurrentTab?: boolean; selfBrowserSurface?: 'include' | 'exclude'; surfaceSwitching?: 'include' | 'exclude' };
/** The size of what is shared in device pixels: the browser window as the screen draws it (its CSS size times the pixel ratio; the screen's own size where the window's is not known).
 *  Asking for the whole screen's pixels instead made Safari fit a tall window to a wide request and hand back the window's CSS size, half of what it holds. */
function nativeSize(): { w: number; h: number } {
  return recordSize({ w: outerWidth > 0 ? outerWidth : screen.width, h: outerHeight > 0 ? outerHeight : screen.height }, devicePixelRatio || 1);
}
/** The picture asked for at full size: the window's own pixels, no scaling, and 60 frames (`ideal`: a browser that has less gives what it has). */
function quality(): MediaTrackConstraints & { resizeMode?: 'none' | 'crop-and-scale' } {
  const size = nativeSize();
  return { width: { ideal: size.w }, height: { ideal: size.h }, frameRate: { ideal: RECORD_FPS }, resizeMode: 'none' };
}
/** The ways to ask a track again for the full size, gentlest first: the same ideals, a floor the browser must meet or refuse, then the exact size (width and height together, so the shape is kept).
 *  A browser that cannot give a size refuses it and the track stays as it was. */
function upgrades(): MediaTrackConstraints[] {
  const size = nativeSize();
  return [quality(), { width: { min: size.w }, height: { min: size.h } }, { width: { exact: size.w }, height: { exact: size.h } }];
}
const share = (): ShareOptions => ({ video: { displaySurface: 'browser', ...quality() }, audio: false, preferCurrentTab: true, selfBrowserSurface: 'include', surfaceSwitching: 'exclude' });

/** The window being shared (the run holds it as a StreamLike; the recorder wants the real stream). */
let shared: MediaStream | null = null;
/** What the last recording was made at (the size and rate the browser gave, the bit rate asked), told with the saved line so the quality can be read off it. */
let saved = '';
/** Asks the track again for the full size where it came in smaller (Chrome lets a display track be raised after the fact).
 *  What it really gives is written to the console, so a cap is seen, never guessed. */
async function fullSize(stream: MediaStream): Promise<void> {
  const track = stream.getVideoTracks()[0];
  if (!track) return;
  const size = nativeSize();
  const gave = await raiseToFullSize(track, upgrades(), size, RECORD_FPS);
  console.info(`[record] the browser gives ${gave} (asked for ${size.w} x ${size.h} at ${RECORD_FPS})`);
}
async function ask(): Promise<StreamLike> {
  const md = navigator.mediaDevices;
  try { shared = await md.getDisplayMedia(share()); }
  catch (e) {
    // a browser that refuses the hints (a TypeError) is asked again plainly; a person's "no" is not asked twice
    if ((e as { name?: string } | null)?.name !== 'TypeError') throw e;
    shared = await md.getDisplayMedia({ video: true, audio: false });
  }
  await fullSize(shared);
  return shared;
}

const run = createRecordRun({
  ask,
  recorder: (): RecorderLike => {
    if (!shared) throw new Error('no window is being shared');
    const mime = pickRecordMime(typeof MediaRecorder.isTypeSupported === 'function' ? (m) => MediaRecorder.isTypeSupported(m) : undefined);
    // the bit rate follows what the track really delivers, so a big screen is not starved
    const got = shared.getVideoTracks()[0]?.getSettings() ?? {};
    const videoBitsPerSecond = recordBitrate(got.width ?? screen.width, got.height ?? screen.height, got.frameRate ?? RECORD_FPS);
    const fps = Math.round(got.frameRate ?? RECORD_FPS);
    const full = nativeSize(), small = (got.width ?? 0) < full.w - 2 || (got.height ?? 0) < full.h - 2;
    saved = `${got.width ?? '?'} × ${got.height ?? '?'}, ${fps} fps, ${Math.round(videoBitsPerSecond / 1_000_000)} Mbps${small ? ` (the window is ${full.w} × ${full.h} pixels)` : ''}.`;
    return new MediaRecorder(shared, mime ? { mimeType: mime, videoBitsPerSecond } : { videoBitsPerSecond });
  },
  save: (video, ext) => {
    const sh = useShell.getState(), at = new Date();
    const name = recordFileName(sh.view, useEngine.getState().presetId ?? sh.patientId, commitOf(import.meta.env.VITE_BUILD) || 'local', at, ext === 'mp4' ? 'video/mp4' : 'video/webm');
    saveBlob(video, name, 20000);
  },
  tell: (note) => {
    // (no note while recording: the stop button beside Settings says it, and a note would be in the video)
    const w = noteWords(note, RECORD, note === 'saved' ? saved : '');
    if (w) useShell.getState().say(w.text, w.tone);
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
