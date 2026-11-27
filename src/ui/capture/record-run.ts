// Settings > Record window, the part that talks to the browser, with the browser handed in (so node can run it against stand-ins):
// ask to share the window, record what is shared, and hand the video over when the person stops it (the row, the shortcut, or the
// browser's own "Stop sharing"). The phases are record-model.ts's recordStep; this is only what happens on each step.
// No app imports: record.ts wires the real ones.
import { recordStep, recordExt, actualMime, type RecordEvent, type RecordPhase } from './record-model.ts';

/** The bits of a MediaStream this needs. */
export interface StreamLike { getTracks(): { stop(): void }[]; getVideoTracks(): { addEventListener(type: 'ended', fn: () => void): void }[] }
/** A handler typed so a real MediaRecorder (whose handler takes the full BlobEvent) fits where a stand-in's takes only the data. */
type Handler<E> = { bivarianceHack(e: E): void }['bivarianceHack'];
/** The bits of a MediaRecorder this needs. */
export interface RecorderLike {
  readonly state: string; readonly mimeType: string;
  ondataavailable: Handler<{ data: Blob }> | null; onstop: Handler<unknown> | null; onerror: Handler<unknown> | null;
  start(timesliceMs: number): void; stop(): void;
}
/** What the person is told about. */
export type RecordNote = 'recording' | 'saved' | 'failed';
export interface RecordDeps {
  /** Asks the browser to share the window (the picker). Called straight from the press, with nothing awaited before it: Safari lets a page ask only inside the tap. Rejects
      when the person says no. */
  ask(): Promise<StreamLike>;
  /** A recorder on the stream, in the format this browser writes best ('' lets it choose). */
  recorder(): RecorderLike;
  /** Hands the finished video over (a download), named for its format. */
  save(video: Blob, ext: 'mp4' | 'webm'): void;
  tell(note: RecordNote): void;
  onPhase(phase: RecordPhase): void;
}

/** The browser's "no": the person closed or cancelled the picker (Chrome: NotAllowedError, Safari: NotAllowedError, an older Firefox: AbortError). Nothing broke, so nothing is said. */
export const isRefusal = (e: unknown): boolean => { const n = (e as { name?: string } | null)?.name; return n === 'NotAllowedError' || n === 'AbortError'; };

/** How often the recorder hands over what it has (so a page that dies mid-way has lost a second, not the whole take). */
export const RECORD_SLICE_MS = 1000;

/** The bits of a video track the full-size step uses. */
export interface TrackLike { getSettings(): { width?: number; height?: number; frameRate?: number }; applyConstraints(c: MediaTrackConstraints): Promise<void> }
/**
 * Asks a track that came in smaller than the screen for the full size (Chrome lets a display track be raised after the fact). Best effort and never rejects: a browser that refuses
 * (OverconstrainedError, NotAllowedError, a track that has ended) keeps what it gave, and the recording goes on. Returns what the track really delivers, for the console.
 */
export async function raiseToFullSize(track: TrackLike, want: MediaTrackConstraints, size: { w: number; h: number }, fps: number): Promise<string> {
  try {
    const got = track.getSettings();
    if ((got.width ?? 0) < size.w || (got.height ?? 0) < size.h || (got.frameRate ?? 0) < fps - 1) await track.applyConstraints(want);
  } catch { /* the browser keeps what it gave */ }
  try { const now = track.getSettings(); return `${now.width ?? '?'} x ${now.height ?? '?'} at ${Math.round(now.frameRate ?? 0)} fps`; } catch { return 'an unknown size'; }
}

export function createRecordRun(deps: RecordDeps): { press(): Promise<void>; phase(): RecordPhase } {
  let phase: RecordPhase = 'idle';
  let stopNow: (() => void) | null = null;
  const go = (e: RecordEvent) => { const next = recordStep(phase, e); if (next !== phase) { phase = next; deps.onPhase(next); } };
  // (set once a file has been handed over: from then on nothing can be reported as failed, a good recording is never followed by "Couldn't record")
  let delivered = false;
  const fail = () => { if (delivered) return; go('failed'); deps.tell('failed'); };

  async function press(): Promise<void> {
    if (phase === 'recording') { stopNow?.(); return; }
    if (phase !== 'idle') return;
    delivered = false;
    go('press');
    let stream: StreamLike;
    try { stream = await deps.ask(); }
    catch (e) { if (isRefusal(e)) go('refused'); else { console.warn('[record] the window could not be shared', e); fail(); } return; }
    let rec: RecorderLike;
    const chunks: Blob[] = [];
    try { rec = deps.recorder(); } catch (e) { console.warn('[record] no recorder for this window', e); stream.getTracks().forEach((t) => t.stop()); fail(); return; }
    rec.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunks.push(e.data); };
    // a recorder error is not the end of what it recorded: it is stopped like any stop and what it holds is saved; only an empty result is a failure
    rec.onerror = (e) => { console.warn('[record] the recorder reported an error', e); finish('ended'); };
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      if (phase !== 'saving') return;   // (it broke first: already told)
      const type = actualMime(rec.mimeType, chunks.find((c) => c.type)?.type ?? '', '');
      const video = new Blob(chunks, { type: type || 'video/webm' });
      if (video.size === 0) { fail(); return; }
      try { deps.save(video, recordExt(type)); delivered = true; } catch (e) { console.warn('[record] the video could not be handed over', e); fail(); return; }
      go('saved'); deps.tell('saved');
    };
    // the stop, from the row, the shortcut or the browser's bar: the same once, whichever comes first
    function finish(ev: 'press' | 'ended'): void {
      if (phase !== 'recording') return;
      go(ev);
      try { if (rec.state !== 'inactive') rec.stop(); else rec.onstop?.(undefined); } catch { fail(); }
    }
    stopNow = () => finish('press');
    stream.getVideoTracks()[0]?.addEventListener('ended', () => finish('ended'));
    try { rec.start(RECORD_SLICE_MS); } catch (e) { console.warn('[record] the recorder would not start', e); stream.getTracks().forEach((t) => t.stop()); fail(); return; }
    go('granted'); deps.tell('recording');
  }
  return { press, phase: () => phase };
}
