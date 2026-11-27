// A panel's phone sheet as React holds it (menu unification, stage 3): the stop it stands at (Peek, Half or Full; Half each time it opens), the one pull wired to it
// (sheet-pull.ts) and the one grab bar's tap (sheet-release.ts grabStep). Treat, History, Compare, Why, the action card and the case's stop card use this; Tests keeps its
// stop in its own store (tests/store.ts sheetSize) and wires the same pull and grab itself.
// The stop is a data attribute (`data-sheet`) the surface's stylesheet sizes it by, from the custom properties of its stops (sheet-stops.ts stopVars): no height is written
// in a frame, the sheet is laid out once at its new stop and the pull eases its edge from where the finger left it.
import { useEffect, useRef, useState, type RefObject } from 'react';
import { flushSync } from 'react-dom';
import { attachSheetPull, easeBack } from './sheet-pull.ts';
import { grabStep } from './sheet-release.ts';
import type { Detent, Stops } from './sheet-stops.ts';
import { readMetric } from '../layout-snap.ts';
import { reduced } from '../a11y/motion.ts';
import '../shell/sheet-swipe.css';
import './sheet.css';

export interface SheetOpts {
  /** the sheet (what the finger is on) and the box that moves (the sheet itself unless given) */
  ref: RefObject<HTMLElement | null>;
  pos?: RefObject<HTMLElement | null>;
  /** a sheet now (useSurfaceMode() === 'sheet') and open */
  on: boolean;
  stops: Stops;
  /** a pull past Peek closes it (none: it rests at Peek, as the case's stop card does) */
  close?(): void;
  /** the sheet's height as the finger sees it (its box's by default); a sheet that eases its own height (the stop card) says how tall it shows */
  shown?(): number;
  /** the sheet eases its own height (its box stands still): the pull eases only the finger's offset */
  ownEase?: boolean;
  tag: string;
}
export interface SheetCtl {
  /** the stop it stands at */
  at: Detent;
  set(d: Detent): void;
  /** the grab bar's tap */
  grab(): void;
}

export function usePanelSheet(o: SheetOpts): SheetCtl {
  const [at, setAt] = useState<Detent>('half');
  const live = useRef({ ...o, at });
  live.current = { ...o, at };
  // (each opening starts at Half)
  useEffect(() => { if (o.on) setAt('half'); }, [o.on]);
  const height = () => { const g = live.current, el = (g.pos ?? g.ref).current; return g.shown ? g.shown() : el ? readMetric(el, 'offsetHeight') : 0; };
  useEffect(() => {
    const card = o.ref.current, pos = (o.pos ?? o.ref).current;
    if (!card || !pos) return;
    return attachSheetPull(card, pos, {
      tag: o.tag,
      enabled: () => live.current.on,
      heights: () => { const g = live.current; return { h0: height(), full: g.stops.full, peek: g.stops.peek, at: g.at }; },
      setSize: (to) => { flushSync(() => setAt(to)); return live.current.ownEase ? null : height(); },
      close: o.close ? () => flushSync(() => live.current.close?.()) : undefined,
    });
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps
  const grab = () => {
    const g = live.current, pos = (g.pos ?? g.ref).current;
    if (!g.on || !pos) return;
    const h0 = height();
    flushSync(() => setAt(grabStep(g.at)));
    if (!g.ownEase && !reduced()) easeBack(pos, height() - h0, g.tag);
  };
  return { at, set: setAt, grab };
}
