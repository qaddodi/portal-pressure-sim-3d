import { useEffect, useId, useRef, type ReactNode } from 'react';
import { useShell, type Sheet } from './store.ts';

/** Closes the open sheet when a press lands outside it and outside the control that opened it. A press on the opener is the opener's own business (it toggles). */
export function useOutside(sheet: Exclude<Sheet, null>, ref: React.RefObject<HTMLElement | null>) {
  const open = useShell((s) => s.sheet === sheet);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      const t = e.target as HTMLElement | null;
      if (ref.current?.contains(t as Node) || t?.closest?.(`[data-opens="${sheet}"]`)) return;
      useShell.getState().close();
    };
    window.addEventListener('pointerdown', away, true);
    return () => window.removeEventListener('pointerdown', away, true);
  }, [open, sheet, ref]);
  return open;
}

/** A button and the popover it opens, side by side. The popover is always in the page and fades (opacity and transform only), placed by CSS, never measured. */
export function Anchored({ sheet, place = 'below', align = 'start', width, button, children, label }: {
  sheet: Exclude<Sheet, null>; place?: 'below' | 'above'; align?: 'start' | 'end' | 'center'; width?: number;
  button: (p: { id: string; open: boolean; toggle: () => void }) => ReactNode; children: ReactNode; label: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  const open = useOutside(sheet, ref);
  const toggle = () => useShell.getState().toggle(sheet);
  return (
    <div className="sh-anchor" ref={ref}>
      {button({ id, open, toggle })}
      <div id={id} className="sh-pop" data-open={open} data-place={place} data-align={align} role="dialog" aria-label={label} inert={!open} style={width ? ({ '--sh-w': `${width}px`, width } as React.CSSProperties) : undefined}>{children}</div>
    </div>
  );
}
