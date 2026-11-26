// What a capture frame has handed up so far, written to storage by the outer page (capture-outer.ts, the promotion page) so that Stop, a crash, a hang or a frame that is slow to stop
// still ends in a zip of everything that was finished, in every size.
// A frame sends each talk's (or case's) files as that talk ends (`part`) and the rest when it ends (`done`); a frame that never says `done` has still given every talk it
// finished. Pure: tests/capture-stop.test.ts.
import type { ZipFile } from '../../capture/zip.ts';

/** After Stop, a frame that has not ended in this long is cut off, and what it had finished is kept. */
export const STOP_GRACE_MS = 60000;
/** True once Stop was pressed `grace` ms ago or more (`stopAt` is -1 while it has not been pressed). */
export const stopOverdue = (stopAt: number, now: number, grace: number = STOP_GRACE_MS): boolean => stopAt >= 0 && now - stopAt > grace;

export interface Ended { files: ZipFile[]; notes: string[]; why?: string }

/** What a page does with what its frames hand up: write it to storage as it arrives (capture-store.ts) and keep only the count. There is no in-memory way: every capture page is on the one store.
 *  `add` queues a write (in order), `end` waits for them all. `prefix` puts the files in
 *  the frame's own folder in the zip (`iphone/`). A frame that crashes or is cut off after Stop has still given every talk it finished. */
export interface FrameSink { add(files: readonly ZipFile[]): void; readonly count: number; end(res: Ended): Promise<{ notes: string[]; why?: string; count: number }> }
export function frameSink(write: (files: ZipFile[]) => Promise<void>, prefix: string): FrameSink {
  let chain: Promise<void> = Promise.resolve(), count = 0;
  const names = new Set<string>();
  const put = (files: readonly ZipFile[]): void => {
    const fs = files.map((f) => ({ name: `${prefix}${f.name}`, data: f.data }));
    for (const f of fs) names.add(f.name);
    count = names.size;
    chain = chain.then(() => write(fs));
  };
  return {
    add: put,
    get count() { return count; },
    async end(res) {
      put(res.files);
      await chain;
      const why = res.why && count ? `${res.why}; the ${count} files it had finished are kept` : res.why;
      return { notes: res.notes, count, ...(why ? { why } : {}) };
    },
  };
}
