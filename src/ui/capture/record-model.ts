// Settings > Record window: the pure parts (no page, no browser), so node can test them.
// Where the row shows (feature detection, never the user agent), which video format this browser can write, the file's name, the shortcut,
// and the one state machine that says what Record window is doing (idle, asking the browser, recording, saving the file).
import { captureFileName } from './capture-model.ts';

/** What the row needs from the browser: the screen-share call and the recorder. Both are looked for, neither is sniffed from the user agent. */
export interface RecordEnv { getDisplayMedia?: unknown; MediaRecorder?: unknown }
/** True where Record window can work: the browser can share a screen or tab (navigator.mediaDevices.getDisplayMedia) and write video (MediaRecorder).
 *  An iPhone has neither, so the row is not shown there. */
export const canRecordWindow = (env: RecordEnv): boolean => typeof env.getDisplayMedia === 'function' && typeof env.MediaRecorder === 'function';

/** The video formats to try, best first: MP4 (plays everywhere, QuickTime and Messages included; Safari, and Chrome from 126) then WebM. A browser that writes both gets MP4. */
export const RECORD_MIMES = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'] as const;
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

/** The frame rate asked for. */
export const RECORD_FPS = 60;
/** The size to ask the browser for: the screen's own pixels (its CSS size times the pixel ratio), the most it can show, so nothing is scaled down on the way.
 *  Asked as `ideal`, so a browser that has less gives what it has. */
export function recordSize(screen: { w: number; h: number }, ratio: number): { w: number; h: number } {
  const r = ratio > 0 ? ratio : 1;
  return { w: Math.max(2, Math.round(screen.w * r)), h: Math.max(2, Math.round(screen.h * r)) };
}
/** Bits per second for the recorder, from what the track really delivers: about 0.2 bit per pixel per frame (a screen of text and fine lines is mostly still,
 *  so this is near lossless to the eye), kept between 8 and 80 Mbps. A 3024 x 1964 screen at 60 frames is about 71 Mbps; a 1440 x 900 one at 60 is 16 Mbps. */
export function recordBitrate(w: number, h: number, fps: number): number {
  const raw = Math.round(Math.max(0, w) * Math.max(0, h) * Math.max(1, fps) * 0.2);
  return Math.min(80_000_000, Math.max(8_000_000, raw));
}

/** What the person is told for each note: nothing while recording (the stop button says it, and a note would be in the video), the saved line, or the failure line. Every note is listed, so none falls into another's words. */
export function noteWords(note: 'recording' | 'saved' | 'failed', words: { saved: string; failed: string }): { text: string; tone: 'info' | 'bad' } | null {
  switch (note) {
    case 'recording': return null;
    case 'saved': return { text: words.saved, tone: 'info' };
    case 'failed': return { text: words.failed, tone: 'bad' };
  }
}

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

/** The mime type the video really has: the recorder's own, else the type its first piece carries, else what was asked for. The file's extension follows this, never what was hoped for. */
export const actualMime = (recorderMime: string, pieceMime: string, asked: string): string => recorderMime || pieceMime || asked;
