// The panel shell (menu unification, stage 2: reports/menu-unification.md 3.2 "Panel shell"): what every panel shares on a wide screen (float mode), so a panel passes only its
// content. It owns
//   - the place: the column, the width, the top under the bar, the height (fitted up to the room, or tall), and the step left of the panels opened before it in the right
//     column, all from one pure rule (panel-place.ts), written as custom properties panel.css places the box by;
//   - the box it publishes to the one room channel (room.ts), from its own measured height, so the figure pans aside, the names keep off it and the zoom pill steps aside;
//   - the one open and close motion (panel.css: in from its column's edge by --panel-in and faded over the leave time of a panel, motion.ts leaveCss), always in the page;
//   - the stacking: the newest panel above (the open order, wire.ts usePanelOrder), every menu and dialog above every panel;
//   - NO close on a press outside (owner, 27 Nov, section 6 question 1: you work on the figure while a panel is open); Esc, its X, its opener and the slot table close it.
// The mount point is the caller's: every panel is put inside #app through the cards' SheetClip (shell/InApp.tsx), where the lifted 2D stylesheets reach it.
// Sheet mode (a phone, an upright iPad) is the panel's own as before: the shell adds nothing there.
import { forwardRef, useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type HTMLAttributes, type ReactNode, type RefObject } from 'react';
import { useUi } from '../ui-store.ts';
import { useShell } from '../shell/store.ts';
import { useSheetSwipe } from '../shell/use-sheet-swipe.ts';
import { sheetMode, useSurfaceMode } from './mode.ts';
import { useColumnStep, usePanelOrder } from './wire.ts';
import { panelPlace, placedBox, PANEL_IN } from './panel-place.ts';
import { publishPanel } from './room.ts';
import { leaveCss } from './motion.ts';
import { GrabBar } from './parts.tsx';
import { PanelHead } from './PanelHead.tsx';
import type { PanelId } from './kinds.ts';
import './panel.css';

export interface PanelProps extends Omit<HTMLAttributes<HTMLElement>, 'id'> {
  /** which panel (surface/kinds.ts) */
  id: PanelId;
  open: boolean;
  /** the panel's paper is a child plate (Treat, the action card): its words and plate fade by their own rules, the box itself is never faded (a fading ancestor ends the glass) */
  plate?: boolean;
  /** the element's own id */
  domId?: string;
  children: ReactNode;
}

/** What the shell puts on a panel's element: its marks (panel.css reads them) and, in float mode, the custom properties that place it. */
export interface PanelShell { float: boolean; attrs: Record<string, string | boolean | undefined>; vars: Record<string, string> | null }

/** The panel shell for an element the caller draws (Treat and the action card keep their 2D markup and their own sheet mode): the place, the height it publishes to the
 *  one room channel, the stacking and the motion, in float mode. `Panel` is this hook on a plain section. */
export function usePanelShell(id: PanelId, open: boolean, own: RefObject<HTMLElement | null>, plate?: boolean): PanelShell {
  const float = useSurfaceMode() === 'float';
  const vp = useUi((s) => s.vp), device = useUi((s) => s.device);
  const step = useColumnStep(id);
  const z = usePanelOrder((s) => (s.order as readonly string[]).indexOf(id));
  const place = float ? panelPlace(id, vp, device, { step }) : null;
  // the box's own height, from an observer (never read in a frame): a fitted panel publishes as much of the room as it takes
  const [h, setH] = useState(0);
  useLayoutEffect(() => {
    const el = own.current;
    if (!float || !open || !el || typeof ResizeObserver !== 'function') { setH(0); return; }
    const ro = new ResizeObserver((es) => { const b = es[0]?.borderBoxSize?.[0], v = Math.round(b ? b.blockSize : es[0]?.contentRect.height ?? 0); setH((o) => (o === v ? o : v)); });
    ro.observe(el);
    return () => ro.disconnect();
  }, [float, open]);
  // the one room channel: open in float mode, the box it stands in at rest (its step included); a sheet's room is its own (Treat's, the action card's)
  const rect = place && open && h > 0 ? placedBox(place, h) : null;
  const key = rect ? `${rect.x},${rect.y},${rect.w},${rect.h}` : '';
  useEffect(() => {
    if (!float) return;
    publishPanel(id, rect && place ? { rect, side: place.column === 'left' ? 'left' : 'right' } : null);
    return () => publishPanel(id, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [float, id, key]);
  const px = (n: number) => `${Math.round(n)}px`;
  const vars = place ? {
    '--pl-x': px(place.rect.x), '--pl-y': px(place.rect.y), '--pl-w': px(place.rect.w), '--pl-max-h': px(place.maxH), '--pl-step': px(place.step),
    '--pl-in-x': px(place.column === 'left' ? -PANEL_IN : place.column === 'right' ? PANEL_IN : 0), '--pl-z': String(Math.max(0, z)), '--pl-leave': `${leaveCss('panel', 'float')}ms`,
  } : null;
  const attrs = { 'data-panel': id, 'data-surface': float ? 'float' : 'sheet', 'data-column': place?.column, 'data-tall': place?.tall || undefined, 'data-plate': plate || undefined };
  return { float, attrs, vars };
}

/** A panel's box: placed, measured, published and moved by the shell in float mode; the caller's own in sheet mode. */
export const Panel = forwardRef<HTMLElement, PanelProps>(function Panel({ id, open, plate, domId, className, style, children, ...rest }, fwd) {
  const own = useRef<HTMLElement | null>(null);
  const setRef = useCallback((el: HTMLElement | null) => {
    own.current = el;
    if (typeof fwd === 'function') fwd(el); else if (fwd) fwd.current = el;
  }, [fwd]);
  const { attrs, vars } = usePanelShell(id, open, own, plate);
  return (
    <section ref={setRef} id={domId} {...rest} className={`sf-panel${className ? ` ${className}` : ''}`} {...attrs} data-open={open} inert={!open} style={{ ...style, ...vars } as CSSProperties}>
      {children}
    </section>
  );
});

/** The plain panel of the shell's own panels (History, Compare, Why): the grab bar, the one panel head and the body, in the shell sheet's markup (.sh-sheet), so a phone's
 *  sheet is drawn and pulled as before. Each has its own open flag (shell/store.ts `panels`), so a menu opens over it and two stand together. */
export function ShellPanel({ id, label, head, children }: { id: 'history' | 'compare' | 'why'; label: string; head?: string; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const open = useShell((s) => s.panels[id]);
  const close = () => useShell.getState().closePanel(id);
  // (a phone's sheet follows a pull down and closes past a short one, as 2D's)
  useSheetSwipe(ref, close, sheetMode);
  return (
    <Panel ref={ref} id={id} open={open} className="sh-sheet" data-kind={id} data-place="top" role="dialog" aria-label={label}>
      <GrabBar />
      <PanelHead title={head ?? label} closeLabel={`Close ${label}`} onClose={close} />
      <div className="sh-sheet-body">{children}</div>
    </Panel>
  );
}
