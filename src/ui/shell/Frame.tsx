import { useRef, type ReactNode } from 'react';
import { useShell, type Sheet as SheetId } from './store.ts';
import { useOutside } from './Pop.tsx';
import { Icon } from './icons.tsx';
import { useSheetSwipe, frameIsSheet } from './use-sheet-swipe.ts';
import { PanelHead } from '../surface/PanelHead.tsx';
import { isPanel } from '../surface/kinds.ts';
import { useFrameSheet } from '../surface/use-sheet.ts';
import { SheetGrab } from '../surface/parts.tsx';

/** A sheet or panel of the shell: always in the page, faded in and out (opacity and transform), `inert` while shut, closed by a press outside it or Esc. */
export function Frame({ kind, label, head, place = 'top', children }: { kind: Exclude<SheetId, null>; label: string; head?: string | null; place?: 'top' | 'bar'; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const open = useOutside(kind, ref);
  // (a panel's phone sheet stops at Peek, Half and Full by the one pull, surface/use-sheet.ts; the rest follow a pull down and close past a short one, as 2D's)
  const sheet = useFrameSheet(kind, ref, open);
  useSheetSwipe(ref, () => useShell.getState().close(), () => frameIsSheet(ref.current), !sheet);
  const close = () => useShell.getState().close();
  // (a panel's head, History's, Compare's and Why's, is the one panel head, as Treat's and Tests' are; the dialogs still on a Frame keep theirs until the dialog shell)
  const top = head === null ? null : isPanel(kind)
    ? <PanelHead title={head ?? label} closeLabel={`Close ${label}`} onClose={close} />
    : <div className="sh-sheet-head"><h2>{head ?? label}</h2><button type="button" className="sh-x" aria-label="Close" onClick={close}><Icon n="close" /></button></div>;
  return (
    <section ref={ref} className="sh-sheet" data-kind={kind} data-place={place} data-open={open} data-sheet={sheet?.data} style={sheet?.style} role="dialog" aria-label={label} inert={!open}>
      {sheet ? <SheetGrab label={`Resize ${label}`} onGrab={sheet.grab} /> : <i className="sh-grabbar" aria-hidden="true" />}
      {top}
      <div className={`sh-sheet-body${sheet ? ' sf-body' : ''}`}>{children}</div>
    </section>
  );
}
