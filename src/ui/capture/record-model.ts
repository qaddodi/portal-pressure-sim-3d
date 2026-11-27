// Settings > Record window: the pure parts (no page, no browser), so node can test them.
// Where the row shows (feature detection, never the user agent), which video format this browser can write, the file's name, the shortcut,
// and the one state machine that says what Record window is doing (idle, asking the browser, recording, saving the file).
import { captureFileName } from './capture-model.ts';

/** What the row needs from the browser: the screen-share call and the recorder. Both are looked for, neither is sniffed from the user agent. */
export interface RecordEnv { getDisplayMedia?: unknown; MediaRecorder?: unknown }
/** True where Record window can work: the browser can share a screen or tab (navigator.mediaDevices.getDisplayMedia) and write video (MediaRecorder).
 *  An iPhone has neither, so the row is not shown there. */
export const canRecordWindow = (env: RecordEnv): boolean => typeof env.getDisplayMedia === 'function' && typeof env.MediaRecorder === 'function';

/** The video formats to try, best first: WebM (Chrome, Edge, Firefox) then MP4 (Safari). */
export const RECORD_MIMES = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4;codecs=avc1', 'video/mp4'] as const;
/** The first format the browser says it can write. `isSupported` is MediaRecorder.isTypeSupported; a browser without it (or with none of ours) gets '' and writes its own default. */
export function pickRecordMime(isSupported: ((mime: string) => boolean) | undefined): string {
  if (!isSupported) return '';
  for (const m of RECORD_MIMES) { try { if (isSupported(m)) return m; } catch { /* a browser that throws for a type does not write it */ } }
  return '';
}
/** The file's extension for a recorder's mime type ("video/mp4;codecs=avc1" is mp4); webm unless it says mp4. */
export const recordExt = (mime: string): 'mp4' | 'webm' => (/^video\/mp4/i.test(mime) ? 'mp4' : 'webm');

/** The video's name: the same as a capture's (the view, the patient, the build, the time), with the format's extension. */
export const recordFileName = (view: string, patient: string | null, commit: string, at: Date, mime: string): string => captureFileName(view, patient, commit, at, recordExt(mime));

/** The shortcut: Alt (Option) + Shift + R, read by its place on the board (Option makes another character on a Mac). */
export const isRecordKey = (e: { code?: string; key?: string; altKey?: boolean; shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean; repeat?: boolean }): boolean =>
  !!e.altKey && !!e.shiftKey && !e.ctrlKey && !e.metaKey && !e.repeat && (e.code === 'KeyR' || (e.key ?? '').toLowerCase() === 'r');

/** What Record window is doing. */
export type RecordPhase = 'idle' | 'asking' | 'recording' | 'saving';
/** What can happen to it: the row or the shortcut pressed, the person said yes in the browser's picker, said no (or closed it), the share ended (the browser bar's "Stop
    sharing", or the window closed), the file was handed over, or something broke. */
export type RecordEvent = 'press' | 'granted' | 'refused' | 'ended' | 'saved' | 'failed';
/** The next phase. A press while idle asks the browser; a press while recording stops it; a press while the browser is asking or the file is being saved does nothing (it is
    already on its way). Events that make no sense in a phase leave it as it is. */
export function recordStep(phase: RecordPhase, event: RecordEvent): RecordPhase {
  switch (phase) {
    case 'idle': return event === 'press' ? 'asking' : 'idle';
    case 'asking': return event === 'granted' ? 'recording' : event === 'refused' || event === 'failed' ? 'idle' : 'asking';
    case 'recording': return event === 'press' || event === 'ended' ? 'saving' : event === 'failed' ? 'idle' : 'recording';
    case 'saving': return event === 'saved' || event === 'failed' ? 'idle' : 'saving';
  }
}

/** The row's words for a phase: what it offers now. While recording it is Stop; while the file is being made it says so and a press does nothing. */
export function recordRow(phase: RecordPhase, words: { row: string; stopRow: string; savingRow: string }): string {
  return phase === 'recording' ? words.stopRow : phase === 'saving' ? words.savingRow : words.row;
}
