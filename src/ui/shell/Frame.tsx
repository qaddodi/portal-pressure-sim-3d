import { useRef, type ReactNode } from 'react';
import { useShell, type Sheet as SheetId } from './store.ts';
import { useOutside } from './Pop.tsx';
import { Icon } from './icons.tsx';
import { useSheetSwipe, frameIsSheet } from './use-sheet-swipe.ts';

/** A sheet or panel of the shell: always in the page, faded in and out (opacity and transform), `inert` while shut, closed by a press outside it or Esc. */
export function Frame({ kind, label, head, place = 'top', children }: { kind: Exclude<SheetId, null>; label: string; head?: string | null; place?: 'top' | 'bar'; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const open = useOutside(kind, ref);
  useSheetSwipe(ref, () => useShell.getState().close(), () => frameIsSheet(ref.current));   // (a phone's sheet follows a pull down and closes past a short one, as 2D's)
  return (
    <section ref={ref} className="sh-sheet" data-kind={kind} data-place={place} data-open={open} role="dialog" aria-label={label} inert={!open}>
      <i className="sh-grabbar" aria-hidden="true" />
      {head !== null && (
        <div className="sh-sheet-head"><h2>{head ?? label}</h2><button type="button" className="sh-x" aria-label="Close" onClick={() => useShell.getState().close()}><Icon n="close" /></button></div>
      )}
      <div className="sh-sheet-body">{children}</div>
    </section>
  );
}
