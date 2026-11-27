import { useLayoutEffect } from 'react';
import { Frame } from '../shell/Frame.tsx';
import { HistoryList } from './HistoryList.tsx';
import { HIST } from './words.ts';
import { useShell } from '../shell/store.ts';
import { useUi } from '../ui-store.ts';
import { readBox, readPlace } from '../layout-snap.ts';
import { useHistoryRoom } from './room.ts';
import './history.css';

/** The panel's box while it is open beside the figure (not the phone's sheet from the foot): from its layout size and place, which no arrival transform changes. */
function panelBox(): { x: number; y: number; w: number; h: number } | null {
  const el = document.querySelector<HTMLElement>('.sh-sheet[data-kind="history"]');
  const root = el?.closest<HTMLElement>('.sh-root');
  if (!el || !root || root.dataset.bottom === 'true') return null;
  const p = readPlace(el), r = readBox(p.parent ?? root);   // (offsetLeft and offsetTop are from the box it is placed in)
  return { x: Math.round(r.left + p.left), y: Math.round(r.top + p.top), w: p.width, h: p.height };
}

/** Publishes the panel's box for the camera and the figure's names while it is open (history/room.ts); cleared when it shuts. */
function usePublishPanel(): void {
  const open = useShell((s) => s.sheet === 'history');
  const vp = useUi((s) => s.vp), device = useUi((s) => s.device);
  useLayoutEffect(() => {
    const b = open ? panelBox() : null, was = useHistoryRoom.getState().rect;
    if (!b && !was) return;
    if (b && was && b.x === was.x && b.y === was.y && b.w === was.w && b.h === was.h) return;
    useHistoryRoom.setState({ rect: b });
  }, [open, vp, device]);
  useLayoutEffect(() => () => useHistoryRoom.setState({ rect: null }), []);
}

/** History: a panel at the right on a laptop or an iPad on its side (2D: the card in Treat's place), a sheet from the foot on a phone. Kept current while open. */
export function HistorySheet() {
  usePublishPanel();
  return <Frame kind="history" label={HIST.title}><HistoryList /></Frame>;
}
