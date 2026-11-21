// How the Tests card changes instrument (2D dock.js pickNow / stageIn / pickCommit / paneOut, the owner's rule "nothing pops", 15 and 17 Nov 2026):
//   1. a tab for an instrument still on its way waits for it, the pane on show stays up (afterLoad);
//   2. the new pane is built first, hidden in place (`.active.staging`: opacity 0, ignoring touches, in the same grid cell), given two frames to size and draw, at most STAGE_MAX ms;
//   3. then the card swaps in one task: the new pane is `.landed` (no entrance of its own) and the old one stays over it as `.pane-out`, fading out over D_FLIP, then goes.
// A swipe keeps its own way (swipe.ts: the neighbour was built beside the finger; its pane lands without staging or fade). The latest ask wins; a swipe, a close or STAGE_MAX ends the wait.
// The pane that changes with the Pressure tab's own switch (Along the circuit / Over time) is the same tab: it swaps in place and plays the CSS crossfade.
import { useCallback, useEffect, useRef, useState } from 'react';
import { clock } from '../../../clock/frame.ts';
import type { PaneId } from '../panes.ts';
import { tabOf } from '../panes.ts';
import { afterLoad } from './lazy.ts';
// @ts-ignore plain JS copied from the 2D app
import { afterMs } from '../copied/motion.copied.js';

export const STAGE_MAX = 320;
/** A card opening cold waits at most this long (its code loading, then two frames) before it shows, whatever the pane does. */
export const COLD_MAX = 600;

export interface Leaver { id: PaneId; key: number }
export interface Swap {
  /** the pane on show */
  shown: PaneId;
  /** a pane being built beside it, hidden */
  staged: PaneId | null;
  /** panes fading out where they stood */
  leaving: Leaver[];
  /** the card has just opened and its pane is not yet built and drawn: the card stays hidden (the same wait a warm swap makes: code in, two frames, then it shows), so no shell shows over an empty plot */
  cold: boolean;
  /** the pane that has just landed: it plays no entrance of its own */
  landed: PaneId | null;
  /** a pane (the swipe's) that is taken in as it stands: no staging, no fade-out of the one it slid away from */
  swipedTo(id: PaneId): void;
  /** a fade-out finished */
  left(key: number): void;
  /** the build in place is given up (a swipe began, the card closed) */
  cancelStage(): void;
}

/** `canStage`: whether a pane may be built first (the card is up and drawn, nothing is being swiped, no second instrument is being picked). Read when the ask is made. */
export function usePaneSwap(open: boolean, pane: PaneId, second: PaneId | null, canStage: () => boolean): Swap {
  const [shown, setShown] = useState<PaneId>(pane), [staged, setStaged] = useState<PaneId | null>(null), [landed, setLanded] = useState<PaneId | null>(null);
  const [leaving, setLeaving] = useState<Leaver[]>([]), [cold, setCold] = useState(false);
  const shownRef = useRef(shown), seq = useRef(0), keys = useRef(0), skip = useRef<PaneId | null>(null), stop = useRef<(() => void) | null>(null), secondWas = useRef<PaneId | null>(second), wasOpen = useRef(false);
  shownRef.current = shown;
  const cancel = useCallback(() => { seq.current++; stop.current?.(); stop.current = null; setStaged(null); setCold(false); }, []);
  const leave = useCallback((ids: PaneId[]) => { if (ids.length) setLeaving((l) => [...l.filter((x) => !ids.includes(x.id)), ...ids.map((id) => ({ id, key: ++keys.current }))]); }, []);

  useEffect(() => {
    // (a card that was closed comes in with its pane as it is: the card's own fade is the entrance, nothing is built first or faded out)
    const fresh = !wasOpen.current;
    wasOpen.current = open;
    if (!open) { cancel(); setShown(pane); setLeaving([]); setLanded(null); return; }
    if (fresh) {
      // (a cold open: the pane is built in place under a hidden card, and the card shows once its code is in and two frames have drawn it: the one sequence a warm swap makes)
      cancel(); setShown(pane); setLeaving([]); setLanded(null); setCold(true);
      const mine = seq.current, h = clock.hold('tests-stage');
      let n = 0, ended = false, timer = 0, off = () => undefined as void;
      const end = () => { if (ended) return; ended = true; clock.cancel(timer); off(); h.release(); if (seq.current === mine) setCold(false); };
      stop.current = end;
      const go = () => {
        if (ended || seq.current !== mine) return;
        off = clock.on('tags', () => { if (++n >= 2) end(); });
      };
      timer = clock.after(end, afterMs(COLD_MAX));   // (the net, from the ask: a pane that never loads still shows)
      if (!afterLoad(pane, go)) go();
      return;
    }
    const cur = shownRef.current;
    if (pane === cur) { cancel(); return; }
    if (tabOf(pane) === tabOf(cur)) { cancel(); setShown(pane); setLanded(null); return; }   // (the Pressure tab's own switch: in place, the CSS crossfade)
    if (skip.current === pane) { skip.current = null; cancel(); setShown(pane); setLanded(pane); setLeaving((l) => l.filter((x) => x.id !== pane)); return; }
    cancel();
    const mine = seq.current;
    const commit = () => {
      if (seq.current !== mine) return;
      stop.current = null;
      leave([cur]);
      setLeaving((l) => l.filter((x) => x.id !== pane));
      setShown(pane); setStaged(null);
    };
    const go = () => {
      if (seq.current !== mine) return;
      if (!canStage()) { setLanded(null); commit(); return; }
      setStaged(pane);
      const h = clock.hold('tests-stage');
      let n = 0, ended = false, timer = 0, off = () => undefined as void;
      const end = (swap: boolean) => {
        if (ended) return;
        ended = true; clock.cancel(timer); off(); h.release();
        if (swap) clock.after(() => { if (seq.current === mine) { setLanded(pane); commit(); } }, 0);   // (the swap is written in a task of its own, never inside a frame)
      };
      off = clock.on('tags', () => { if (++n >= 2) end(true); });
      timer = clock.after(() => end(true), afterMs(STAGE_MAX));
      stop.current = () => end(false);
    };
    if (!afterLoad(pane, go)) go();
  }, [open, pane, cancel, leave, canStage]);

  // a second instrument that goes (a tab picked, the card too small for two) fades out where it stood
  useEffect(() => {
    const was = secondWas.current;
    secondWas.current = second;
    if (open && was && was !== second && was !== pane) leave([was]);
  }, [second, pane, open, leave]);

  const swipedTo = useCallback((id: PaneId) => { skip.current = id; }, []);
  const left = useCallback((key: number) => setLeaving((l) => l.filter((x) => x.key !== key)), []);
  return { shown, staged, leaving, cold, landed, swipedTo, left, cancelStage: cancel };
}
