// What a capture frame has handed up so far, kept by the outer page (capture-outer.ts) so that Stop, a crash, a hang or a frame that is slow to stop still ends in a zip of
// everything that was finished, in every size.
// A frame sends each talk's (or case's) files as that talk ends (`part`) and the rest when it ends (`done`); a frame that never says `done` has still given every talk it
// finished. Pure: tests/capture-stop.test.ts.
import type { ZipFile } from '../../capture/zip.ts';

/** After Stop, a frame that has not ended in this long is cut off, and what it had finished is kept. */
export const STOP_GRACE_MS = 60000;
/** True once Stop was pressed `grace` ms ago or more (`stopAt` is -1 while it has not been pressed). */
export const stopOverdue = (stopAt: number, now: number, grace: number = STOP_GRACE_MS): boolean => stopAt >= 0 && now - stopAt > grace;

export interface Ended { files: ZipFile[]; notes: string[]; why?: string }

export function fileKeeper(): { add(files: readonly ZipFile[]): void; readonly size: number; end(res: Ended): Ended } {
  const kept = new Map<string, Uint8Array>();
  return {
    add(files) { for (const f of files) kept.set(f.name, f.data); },
    get size() { return kept.size; },
    /** The frame's end, however it came: everything kept plus what it ended with (a later file of a name replaces an earlier one); a reason it did not finish says how many files were kept. */
    end(res) {
      for (const f of res.files) kept.set(f.name, f.data);
      const why = res.why && kept.size ? `${res.why}; the ${kept.size} files it had finished are kept` : res.why;
      return { files: [...kept].map(([name, data]) => ({ name, data })), notes: res.notes, ...(why ? { why } : {}) };
    },
  };
}
