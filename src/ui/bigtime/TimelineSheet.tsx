import { useEffect, useState } from 'react';
import { clock } from '../../clock/frame.ts';
import { Frame } from '../shell/Frame.tsx';
import { useShell } from '../shell/store.ts';
import { TimelineCard } from './TimelineCard.tsx';
import { useBig } from './store.ts';
import { BT } from './words.ts';
import './bigtime.css';

const OUT_MS = 320;

/** The timeline chart: a big card over the figure, opened from History's "See as a chart". Its contents are made while it is open and for the fade after (nothing draws while it is shut). */
export function TimelineSheet() {
  const open = useShell((s) => s.sheet === 'timeline');
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    if (open) { useBig.getState().set({ raised: false, cursor: null }); setMounted(true); return; }
    const t = clock.after(() => setMounted(false), OUT_MS, 'bigtime-unmount');
    return () => clock.cancel(t);
  }, [open]);
  return <Frame kind="timeline" label={BT.title} head={null}>{mounted && <TimelineCard />}</Frame>;
}
