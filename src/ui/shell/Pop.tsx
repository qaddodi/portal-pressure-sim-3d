import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useUi } from '../ui-store.ts';
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

/** A button and the popover it opens. The button stays a child of its bar, exactly as the 2D markup has it (its stylesheet addresses `.sb-right > .chip-btn`, `.tl-split > .tl-speed`); the popover is
 *  a fixed sibling after it, always in the page, faded by opacity and transform, and put by the button's box once as it opens (never per frame). */
export function Anchored({ sheet, place = 'below', align = 'start', width, button, children, label }: {
  sheet: Exclude<Sheet, null>; place?: 'below' | 'above'; align?: 'start' | 'end' | 'center'; width?: number;
  button: (p: { id: string; open: boolean; toggle: () => void; ref: (el: HTMLElement | null) => void }) => ReactNode; children: ReactNode; label: string;
}) {
  const btn = useRef<HTMLElement | null>(null);
  const pop = useRef<HTMLDivElement>(null);
  const id = useId();
  const open = useOutside(sheet, pop);
  const vp = useUi((s) => s.vp);
  const [at, setAt] = useState<{ left: number; top: number }>({ left: 0, top: -9999 });
  useLayoutEffect(() => {
    const b = btn.current, p = pop.current;
    if (!open || !b || !p) return;
    const r = b.getBoundingClientRect(), w = p.offsetWidth, h = p.offsetHeight, vw = innerWidth, vh = innerHeight, m = 8;
    const left = align === 'end' ? r.right - w : align === 'center' ? r.left + r.width / 2 - w / 2 : r.left;
    const top = place === 'above' ? r.top - m - h : r.bottom + m;
    setAt({ left: Math.max(m, Math.min(left, vw - m - w)), top: Math.max(m, Math.min(top, vh - m - h)) });
  }, [open, align, place, vp.w, vp.h, width]);
  const toggle = () => useShell.getState().toggle(sheet);
  return (
    <>
      {button({ id, open, toggle, ref: (el) => { btn.current = el; } })}
      <div ref={pop} id={id} className="sh-pop" data-open={open} data-place={place} role="dialog" aria-label={label} inert={!open} style={{ left: at.left, top: at.top, ...(width ? { width } : {}) }}>{children}</div>
    </>
  );
}
