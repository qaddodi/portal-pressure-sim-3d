// The one live state of the Readouts tiles, kept for the page's life (2D builds the pane once and keeps it): the shown state (display-state.js, copied) stepped on the one clock, and the ReadoutsLive that
// works the tiles' numbers, bands and bars out from it. The pane binds to it while it is on screen: a model frame feeds it (engine `onFrame`, every frame), a glide steps it on the clock's tween phase.
import { clock } from '../../../clock/frame.ts';
import { latest, onFrame, patient, useEngine } from '../../../engine/index.ts';
import { createShownState, noteJump } from './copied/display-state.copied.js';
import { ReadoutsLive } from './live.ts';
import { reduceMotionMQ } from '../copied/motion.copied.js';
import { hiddenNow, useMeasured } from '../hidden.ts';
import { useShell } from '../../shell/store.ts';
import { useCompare } from '../../compare/store.ts';

const TAG = 'readouts';
interface ShownApi { set(key: string, T: number, o?: { snap?: boolean; small?: number; eps?: number; across?: boolean }): number; or(key: string, fb: number): number; get(key: string): number | undefined; isMoving(key: string): boolean; delete(key: string): void; on(cb: () => void): () => void }
// (the shown state's scheduler: one callback on the clock's tween phase, asked for with an invalidate: frames come only while a number or a bar is on its way)
let askId = 0;
const waiting = new Map<number, () => void>();
const ask = (cb: (t: number) => void): number => {
  const id = ++askId;
  const off = clock.on('tween', (f) => { off(); waiting.delete(id); cb(f.time); });
  waiting.set(id, off);
  clock.invalidate(TAG);
  return id;
};
const cancel = (id: number): void => { waiting.get(id)?.(); waiting.delete(id); };

export const shownState = createShownState({ ask, cancel } as never) as unknown as ShownApi;
let live: ReadoutsLive | null = null;
export function liveReadouts(): ReadoutsLive {
  if (live) return live;
  const l = new ReadoutsLive({ shown: shownState, reduce: () => reduceMotionMQ.matches, later: (fn, ms) => clock.after(fn, ms), unlater: (h) => clock.cancel(h as number) });
  shownState.on(() => l.follow());
  return (live = l);
}

const ctxNow = () => ({ running: useShell.getState().transport.running, hidden: hiddenNow(), then: (useCompare.getState().snap?.metrics ?? null) as never, params: patient.params, now: clock.now() });

/** The pane is on screen: feed the tiles every model frame, and again when what they depend on changes with no frame to say so. Returns the unbind. */
export function bindReadouts(): () => void {
  const l = liveReadouts();
  l.mount();
  const feed = () => { const f = latest.frame; if (f) l.feed(f.metrics, ctxNow()); };
  feed();
  const offFrame = onFrame((f) => { if (f.jump) noteJump(); const g = latest.frame ?? f; l.feed(g.metrics, ctxNow()); });
  const offs = [
    useCompare.subscribe((s, p) => { if (s.snap !== p.snap) l.refresh(ctxNow() as never); }),
    useMeasured.subscribe(() => l.refresh(ctxNow() as never)),
    useShell.subscribe((s, p) => { if (s.transport.running !== p.transport.running || s.mode !== p.mode) l.refresh(ctxNow() as never); }),
    useEngine.subscribe((s, p) => { if (s.presetId !== p.presetId) { noteJump(); l.reset(); feed(); } }),
  ];
  return () => { offFrame(); for (const o of offs) o(); l.unmount(); };
}
