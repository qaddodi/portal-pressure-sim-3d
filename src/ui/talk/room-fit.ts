// A slide's instrument (the Doppler, FibroScan, endoscope and abdomen panes) is drawn at the size its card asked for, 220 px at most (ToolCardBody `plot`), whatever room the data card leaves it (--pz-room,
// tool-room.ts). Capture 52ef8e63, Endoscopy 3 on the iPad: the room was 280 px, the pane 407, and the disc ran off the card's foot. One fit for every pane on that path: the pane's size is the one number they
// all draw from, so it is walked down (or back up) until the pane's own height meets the room, by the secant of the last two measurements (a pane with one picture grows 1 px per px, one with two grows 2).
export const FIT_MIN = 110;
export interface FitStep { size: number; h: number }

/** The next size to try: `asked` when it fits, else the size whose height meets `room`, from the last two (size, height) pairs (a slope of one when there is only one), kept between FIT_MIN and `asked`.
 *  Null when the height does not follow the size (the pictures stand beside the readings: nothing to fit) or the room is none. */
export function nextFit(room: number, asked: number, cur: FitStep, prev: FitStep | null): number | null {
  if (!(room > 0)) return null;
  if (cur.h <= room + 0.5 && cur.size >= asked) return null;
  let slope = 1;
  if (prev && Math.abs(prev.size - cur.size) >= 1) slope = (cur.h - prev.h) / (cur.size - prev.size);
  if (!(slope > 0.2)) return null;
  const want = Math.round(Math.max(FIT_MIN, Math.min(asked, cur.size + (room - cur.h) / slope)));
  return want === cur.size ? null : want;
}

import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { readMetric } from '../layout-snap.ts';
import { observeThenFit } from '../layout/fit-later.ts';

const MAX_STEPS = 8;
/** The size the instrument's pictures are drawn at: `asked`, or less where the card's room is short. `host` is the box the pane stands in; `room` the card's room for it (0: none, the asked size). */
export function useRoomFit(host: RefObject<HTMLElement | null>, room: number, asked: number): number {
  const [size, setSize] = useState(asked);
  const st = useRef<{ prev: FitStep | null; steps: number; room: number; asked: number }>({ prev: null, steps: 0, room: 0, asked: 0 });
  useLayoutEffect(() => {
    const el = host.current;
    if (!el || !(room > 0)) { setSize(asked); return; }
    const S = st.current;
    if (S.room !== room || S.asked !== asked) { S.prev = null; S.steps = 0; S.room = room; S.asked = asked; setSize(asked); }
    let cur = S.asked === asked ? size : asked;
    const apply = () => {
      if (S.steps >= MAX_STEPS) return;
      const here: FitStep = { size: cur, h: readMetric(el, 'offsetHeight') };
      const n = nextFit(room, asked, here, S.prev);
      S.prev = here;
      if (n == null) return;
      S.steps++; cur = n; setSize(n);
    };
    apply();
    return observeThenFit([el], apply);
  }, [host, room, asked, size]);
  return room > 0 ? size : asked;
}
