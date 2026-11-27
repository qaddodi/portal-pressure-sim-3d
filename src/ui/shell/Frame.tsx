import { useRef, type ReactNode } from 'react';
import { useShell, type Sheet as SheetId } from './store.ts';
import { useOutsidePress } from '../surface/outside.ts';
import { Icon } from './icons.tsx';
import { useSheetSwipe, frameIsSheet } from './use-sheet-swipe.ts';
import { PanelHead } from '../surface/PanelHead.tsx';
import { isPanel } from '../surface/kinds.ts';

/** A sheet of the shell: always in the page, faded in and out (opacity and transform), `inert` while shut, closed by a press outside it or Esc.
 *  Since stage 2 of the menu unification only the timeline chart is a Frame (History, Compare and Why are panels of the panel shell, surface/Panel.tsx, with their phone
 *  stops); stage 6 removes it. */
export function Frame({ kind, label, head, place = 'top', children }: { kind: Exclude<SheetId, null>; label: string; head?: string | null; place?: 'top' | 'bar'; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const open = useShell((s) => s.sheet === kind);
  useOutsidePress(open, [ref], () => useShell.getState().closeByPress(), `[data-opens="${kind}"]`);
  // (a phone's sheet follows a pull down and closes past a short one, as 2D's)
  useSheetSwipe(ref, () => useShell.getState().close(), () => frameIsSheet(ref.current));
  const close = () => useShell.getState().close();
  // (a panel's head is the one panel head; a dialog still on a Frame keeps its own until the dialog shell)
  const top = head === null ? null : isPanel(kind)
    ? <PanelHead title={head ?? label} closeLabel={`Close ${label}`} onClose={close} />
    : <div className="sh-sheet-head"><h2>{head ?? label}</h2><button type="button" className="sh-x" aria-label="Close" onClick={close}><Icon n="close" /></button></div>;
  return (
    <section ref={ref} className="sh-sheet" data-kind={kind} data-place={place} data-open={open} role="dialog" aria-label={label} inert={!open}>
      <i className="sh-grabbar" aria-hidden="true" />
      {top}
      <div className="sh-sheet-body">{children}</div>
    </section>
  );
}
