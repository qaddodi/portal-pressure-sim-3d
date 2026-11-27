import { useLayoutEffect, useRef, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { useShell, type Sheet as SheetId } from './store.ts';
import { useOutsidePress } from '../surface/outside.ts';
import { Icon } from './icons.tsx';
import { useSheetSwipe, frameIsSheet } from './use-sheet-swipe.ts';
import { PanelHead } from '../surface/PanelHead.tsx';
import { isPanel, type PanelId } from '../surface/kinds.ts';
import { useUi } from '../ui-store.ts';
import { readBox, readPlace } from '../layout-snap.ts';
import { useSurfaceMode } from '../surface/mode.ts';
import { publishPanel } from '../surface/room.ts';
import { useColumnStep } from '../surface/wire.ts';

/** The panels on a Frame, which a press outside never closes. */
const STAYS: ReadonlySet<string> = new Set(['history', 'compare', 'why']);

/** A panel's box while it is open beside the figure: from its layout size and place, which no arrival transform changes, less its step in the column (a translate). */
function frameBox(el: HTMLElement, step: number): { x: number; y: number; w: number; h: number } | null {
  const root = el.closest<HTMLElement>('.sh-root');
  if (!root) return null;
  const p = readPlace(el), r = readBox(p.parent ?? root);   // (offsetLeft and offsetTop are from the box it is placed in)
  return { x: Math.round(r.left + p.left - step), y: Math.round(r.top + p.top), w: p.width, h: p.height };
}

/** A panel kind's Frame (History, Compare, Why) publishes its box to the one room channel while it stands beside the figure (surface/room.ts); the timeline chart, across the figure, takes none. */
function usePublishFrame(kind: Exclude<SheetId, null>, ref: RefObject<HTMLElement | null>, open: boolean, step: number): void {
  const vp = useUi((s) => s.vp), device = useUi((s) => s.device);
  const float = useSurfaceMode() === 'float';
  const takes = isPanel(kind) && kind !== 'timeline';
  useLayoutEffect(() => {
    if (!takes) return;
    const el = ref.current, b = open && float && el ? frameBox(el, step) : null;
    // (a phone held sideways stands History in the column at the left)
    publishPanel(kind as PanelId, b ? { rect: b, side: b.x + b.w / 2 < vp.w / 2 ? 'left' : 'right' } : null);
  }, [takes, kind, ref, open, float, vp, device, step]);
  useLayoutEffect(() => () => { if (takes) publishPanel(kind as PanelId, null); }, [takes, kind]);
}

/** A sheet or panel of the shell: always in the page, faded in and out (opacity and transform), `inert` while shut, closed by Esc, and (but for a panel) by a press outside it. */
export function Frame({ kind, label, head, place = 'top', children }: { kind: Exclude<SheetId, null>; label: string; head?: string | null; place?: 'top' | 'bar'; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  // (History, Compare and Why are panels: they stay open while the figure is tapped, owner 27 Nov, section 6 question 1; Esc, the X, the opener and the slot table close them)
  const open = useShell((s) => s.sheet === kind);
  useOutsidePress(open && !STAYS.has(kind), [ref], () => useShell.getState().closeByPress(), `[data-opens="${kind}"]`);
  useSheetSwipe(ref, () => useShell.getState().close(), () => frameIsSheet(ref.current));   // (a phone's sheet follows a pull down and closes past a short one, as 2D's)
  // (a right-hand panel stands left of every panel opened before it in the column: surface/wire.ts useColumnStep, a translate that glides, shell.css)
  const step = useColumnStep(kind as PanelId);
  usePublishFrame(kind, ref, open, step);
  const close = () => useShell.getState().close();
  // (a panel's head, History's, Compare's and Why's, is the one panel head, as Treat's and Tests' are; the dialogs still on a Frame keep theirs until the dialog shell)
  const top = head === null ? null : isPanel(kind)
    ? <PanelHead title={head ?? label} closeLabel={`Close ${label}`} onClose={close} />
    : <div className="sh-sheet-head"><h2>{head ?? label}</h2><button type="button" className="sh-x" aria-label="Close" onClick={close}><Icon n="close" /></button></div>;
  const style = (step ? { '--pl-step': `${step}px` } : undefined) as CSSProperties | undefined;
  return (
    <section ref={ref} className="sh-sheet" data-kind={kind} data-place={place} data-open={open} role="dialog" aria-label={label} inert={!open} style={style}>
      <i className="sh-grabbar" aria-hidden="true" />
      {top}
      <div className="sh-sheet-body">{children}</div>
    </section>
  );
}
