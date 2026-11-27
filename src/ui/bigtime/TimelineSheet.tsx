import { useLayoutEffect, useRef } from 'react';
import { Panel } from '../surface/Panel.tsx';
import { GrabBar } from '../surface/parts.tsx';
import { usePresence } from '../surface/presence.ts';
import { leaveMs } from '../surface/motion.ts';
import { sheetMode, useSurfaceMode } from '../surface/mode.ts';
import { useShell } from '../shell/store.ts';
import { useSheetSwipe } from '../shell/use-sheet-swipe.ts';
import { TimelineCard } from './TimelineCard.tsx';
import { useBig } from './store.ts';
import { BT } from './words.ts';
import './bigtime.css';

/** The timeline chart: the one full-width panel (surface/kinds.ts, column `full`), opened from History's "See as a chart" or the play bar's Chart. Its open state stands in
 *  the menus' slot (useShell.sheet), as it did on the old Frame. The panel shell gives it the open state, `inert`, its role and the stacking order; its box is its own
 *  head-less card (bigtime.css: centred, capped at 1340 x 800), and it takes no room from the figure, which it covers (surface/wire.ts usePanelShell). Like every panel
 *  it does not close on a press outside: Done, Esc, the play bar's Chart or a pull on a phone closes it. Its contents are made while it is open and for its leave after
 *  (nothing draws while it is shut). */
export function TimelineSheet() {
  const ref = useRef<HTMLElement>(null);
  const open = useShell((s) => s.sheet === 'timeline');
  const { shown } = usePresence(open, leaveMs('panel', useSurfaceMode()));
  // (each opening starts with the graph panel lowered and no cursor, before the first paint)
  useLayoutEffect(() => { if (open) useBig.getState().set({ raised: false, cursor: null }); }, [open]);
  // (a phone's chart follows a pull down and closes past a short one, as 2D's sheets do)
  useSheetSwipe(ref, () => useShell.getState().close(), sheetMode);
  return (
    <Panel ref={ref} id="timeline" open={open} className="sh-sheet" data-kind="timeline" data-place="top" aria-label={BT.title}>
      <GrabBar />
      <div className="sh-sheet-body">{shown && <TimelineCard />}</div>
    </Panel>
  );
}
