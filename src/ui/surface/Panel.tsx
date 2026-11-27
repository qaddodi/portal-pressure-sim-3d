// The panel shell (menu unification, stage 2: reports/menu-unification.md 3.2 "Panel shell"): what every panel shares on a wide screen (float mode), so a panel passes only its
// content. It owns
//   - the place: the column, the width, the top under the bar, the height (fitted up to the room, or tall), and the step left of the panels opened before it in the right
//     column, all from one pure rule (panel-place.ts), written as custom properties panel.css places the box by;
//   - the box it publishes to the one room channel (room.ts), from its own measured height, so the figure pans aside, the names keep off it and the zoom pill steps aside;
//   - the one open and close motion (panel.css: in from its column's edge by --panel-in and faded over the leave time of a panel, motion.ts leaveCss), always in the page;
//   - the stacking: the newest panel above (the open order, wire.ts usePanelOrder), every menu and dialog above every panel;
//   - the role (a non-modal dialog, kinds.ts PANEL_ROLE) and the full-width chart's place: its own card's box, no room taken (it covers the figure);
//   - NO close on a press outside (owner, 27 Nov, section 6 question 1: you work on the figure while a panel is open); Esc, its X, its opener and the slot table close it.
// The mount point is the caller's: every panel is put inside #app through the cards' SheetClip (shell/InApp.tsx), where the lifted 2D stylesheets reach it.
// Sheet mode (a phone, an upright iPad) is the panel's own as before: the shell adds nothing there.
import { forwardRef, useCallback, useRef, type CSSProperties, type HTMLAttributes, type ReactNode } from 'react';
import { useShell } from '../shell/store.ts';
import { useSheetSwipe } from '../shell/use-sheet-swipe.ts';
import { sheetMode } from './mode.ts';
import { usePanelShell } from './wire.ts';
import { GrabBar, SheetGrab } from './parts.tsx';
import { useFrameSheet } from './use-sheet.ts';
import { PanelHead } from './PanelHead.tsx';
import type { PanelId } from './kinds.ts';

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
  // (a phone's sheet stops at Peek, Half and Full by the one pull, surface/use-sheet.ts; the close-only pull down is for when it has no stops)
  const sheet = useFrameSheet(id, ref, open);
  useSheetSwipe(ref, close, sheetMode, !sheet);
  return (
    <Panel ref={ref} id={id} open={open} className="sh-sheet" data-kind={id} data-place="top" data-sheet={sheet?.data} style={sheet?.style} aria-label={label}>
      {sheet ? <SheetGrab label={`Resize ${label}`} onGrab={sheet.grab} /> : <GrabBar />}
      <PanelHead title={head ?? label} closeLabel={`Close ${label}`} onClose={close} />
      <div className={`sh-sheet-body${sheet ? ' sf-body' : ''}`}>{children}</div>
    </Panel>
  );
}
