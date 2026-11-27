// A panel's phone sheet as React holds it (menu unification, stage 3): the stop it stands at (Peek, Half or Full; Half each time it opens), the one pull wired to it
// (sheet-pull.ts) and the one grab bar's tap (sheet-stops.ts grabStep). Treat, History, Compare, Why, the action card and the case's stop card use this; Tests keeps its
// stop in its own store (tests/store.ts sheetSize) and wires the same pull and grab itself.
// The stop is a data attribute (`data-sheet`) the surface's stylesheet sizes it by, from the custom properties of its stops (sheet-stops.ts stopVars): no height is written
// in a frame, the sheet is laid out once at its new stop and the pull eases its edge from where the finger left it.
import { useEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { flushSync } from 'react-dom';
import { attachSheetPull, easeBack } from './sheet-pull.ts';
import { grabStep, PANEL_FITS, stopsFor, stopVars, type Detent, type SheetPanel, type Stops } from './sheet-stops.ts';
import { useSurfaceMode } from './mode.ts';
import { useUi } from '../ui-store.ts';
import { useCaseBarUp } from '../case/room.ts';
import { useShell } from '../shell/store.ts';
import { readMetric } from '../layout-snap.ts';
import { reduced } from '../a11y/motion.ts';
// (what a pulled sheet, its grab bar and its Peek look like; kept out of node tests, which import sheet-pull.ts alone)
import '../shell/sheet-swipe.css';

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
  // (a sheet whose element comes later than its first render, as Treat's waits for the patient, is wired when it is there: after every render the hook looks at the element)
  const wired = useRef<{ el: HTMLElement; off: () => void } | null>(null);
  useEffect(() => {
    const card = o.ref.current, pos = (o.pos ?? o.ref).current, w = wired.current;
    if (w && w.el === card) return;
    w?.off(); wired.current = null;
    if (!card || !pos) return;
    const off = attachSheetPull(card, pos, {
      tag: o.tag,
      enabled: () => live.current.on,
      // (a sheet that eases its own height is not lifted by the finger on the way up, which would lift its clipped foot off the dock: it gives a quarter, a hint, and the let-go grows it)
      heights: () => { const g = live.current, h0 = height(); return { h0, full: g.ownEase ? h0 : g.stops.full, peek: g.stops.peek, at: g.at }; },
      setSize: (to) => { flushSync(() => setAt(to)); return live.current.ownEase ? null : height(); },
      close: o.close ? () => flushSync(() => live.current.close?.()) : undefined,
    });
    wired.current = { el: card, off };
  });
  useEffect(() => () => { wired.current?.off(); wired.current = null; }, []);
  const grab = () => {
    const g = live.current, pos = (g.pos ?? g.ref).current;
    if (!g.on || !pos) return;
    const h0 = height();
    flushSync(() => setAt(grabStep(g.at)));
    if (!g.ownEase && !reduced()) easeBack(pos, height() - h0, g.tag);
  };
  return { at, set: setAt, grab };
}

/**
 * A shell frame's sheet, for the panels still on a Frame (History, Compare, Why): their stops on this screen, the one pull and the grab bar while surfaces are sheets; null
 * for a frame that is no such panel (it keeps the close-only pull down). The panel's stylesheet sizes it by `data-sheet` and the stops' custom properties (shell.css).
 */
export function useFrameSheet(kind: string, ref: RefObject<HTMLElement | null>, open: boolean): (SheetCtl & { style?: CSSProperties; data?: Detent }) | null {
  const panel = kind in PANEL_FITS ? (kind as SheetPanel) : null;
  const vp = useUi((s) => s.vp), device = useUi((s) => s.device), sheet = useSurfaceMode() === 'sheet';
  const caseUp = useCaseBarUp();
  const stops = useMemo(() => stopsFor(vp, device, PANEL_FITS[panel ?? 'history']), [vp, device, panel, caseUp]);  // eslint-disable-line react-hooks/exhaustive-deps
  const ctl = usePanelSheet({ ref, on: !!panel && sheet && open, stops, close: closeShell, tag: `${kind}-sheet` });
  if (!panel) return null;
  // (`data`: the stop as the stylesheet reads it, only while it is a sheet)
  return sheet ? { ...ctl, style: stopVars(stops) as CSSProperties, data: ctl.at } : ctl;
}
const closeShell = () => useShell.getState().close();
