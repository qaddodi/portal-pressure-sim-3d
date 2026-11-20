import { useEffect, useId, useLayoutEffect, useRef, type ReactNode } from 'react';
import { useShell, type Sheet } from './store.ts';
import { InApp } from './InApp.tsx';
import { placePopover } from './place.ts';

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
 *  fixed, always in the page, faded by opacity and transform, and put by the button's box once as it opens (never per frame).
 *  It is mounted in `#app`, not beside its button (owner, 20 Nov: "hitting the fast forward or 1x menus doesn't actually show any menus"). A `position: fixed` box measures from the nearest ancestor that
 *  has a transform (and a filter, or containment): the Mac's dock is centred with `translateX(-50%)`, so a popover beside its button was placed from the dock, not the screen, and landed below the
 *  page. In `#app` no bar's own transform can reach it, whichever bar the button is in.
 *  Its place is `left` and `top` only: shell.css gives `[data-place="above"]` a `bottom: calc(100% + 8px)` for a popover inside its button's box, and with `top` set as well a fixed box stretches
 *  between the two, a height of nothing: the panel and its glass vanished and the rows spilled out of it at the top of the screen (owner, 20 Nov, build 13fd959). `right` and `bottom` are `auto` here. */
export function Anchored({ sheet, place = 'below', align = 'start', width, cls, button, children, label }: {
  sheet: Exclude<Sheet, null>; place?: 'below' | 'above'; align?: 'start' | 'end' | 'center'; width?: number; /** the 2D popover's own class (its stylesheet sizes it: `layers-pop`) */ cls?: string;
  button: (p: { id: string; open: boolean; toggle: () => void; ref: (el: HTMLElement | null) => void }) => ReactNode; children: ReactNode; label: string;
}) {
  const btn = useRef<HTMLElement | null>(null);
  const pop = useRef<HTMLDivElement>(null);
  const id = useId();
  const open = useOutside(sheet, pop);
  // 2D's one placer (shell/place.ts placePopover, util.js popover `put`), written once as the menu opens and again when the window or the visual viewport moves (the on-screen keyboard coming up on a phone
  // lifts the room's floor): `translate` from the window's corner, clear of the notch and of the keyboard, flipped to the other side of its button where there is no room.
  useLayoutEffect(() => {
    const b = btn.current, p = pop.current;
    if (!open || !b || !p) return;
    const put = () => { placePopover(p, b, { align, place }); };
    put();
    const vv = window.visualViewport;
    addEventListener('resize', put); vv?.addEventListener('resize', put); vv?.addEventListener('scroll', put);
    return () => { removeEventListener('resize', put); vv?.removeEventListener('resize', put); vv?.removeEventListener('scroll', put); };
  }, [open, align, place, width]);
  const toggle = () => useShell.getState().toggle(sheet);
  return (
    <>
      {button({ id, open, toggle, ref: (el) => { btn.current = el; } })}
      <InApp><div ref={pop} id={id} className={`sh-pop${cls ? ` ${cls}` : ''}`} data-open={open} data-place={place} role="dialog" aria-label={label} inert={!open} style={{ left: 0, top: 0, right: 'auto', bottom: 'auto', ...(width ? { width } : {}) }}>{children}</div></InApp>
    </>
  );
}
