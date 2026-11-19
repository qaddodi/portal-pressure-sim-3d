// The 2D app's menu, on its own markup and class names (util.js popover, menuItem, menuSection and main.js menuToggle): `.menu.app-menu` holding `.menu-group` > `.menu-title` and
// `.menu-item` / `.lens.lens-opt` rows. A popover under (or over) the button that opened it, or a bottom sheet with a head and a scrim on the stacked layout (STACK_MQ).
// It is in the page only while open: it comes in on the 2D stylesheet's own entrance (slide-from-edge / scale-settle), and leaves by `.leaving`, then goes. Its stylesheet is the 2D app's
// (src/ui/css2d), copied unchanged; nothing here styles it. The frost is the one glass (glass.css).
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useShell, type Sheet } from './store.ts';
import { useOutside } from './Pop.tsx';
import { I } from './icons.tsx';

/** 2D util.js STACK_MQ: the one breakpoint at which a menu is a bottom sheet (a phone, or a tablet held upright). */
export const STACK_MQ = '(max-width: 767px), (max-width: 1100px) and (orientation: portrait)';
export const MENU_LEAVE_MS = 180;   // 2D --d-flip

/** Mounted while shown; `leaving` for the length of the exit. */
export function usePresence(open: boolean, ms = MENU_LEAVE_MS) {
  const [shown, setShown] = useState(open);
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    if (open) { setShown(true); setLeaving(false); return; }
    if (!shown) return;
    setLeaving(true);
    const t = window.setTimeout(() => { setShown(false); setLeaving(false); }, ms);
    return () => window.clearTimeout(t);
  }, [open, shown, ms]);
  return { shown: shown || open, leaving: leaving && !open };
}

/** The button that opened this menu: the first visible control that says `data-opens` for it (the top bar's, the thumb bar's tab, the presenter pill's gear). */
function anchorFor(kind: string): HTMLElement | null {
  const all = [...document.querySelectorAll<HTMLElement>(`[data-opens="${kind}"]`)];
  const seen = all.filter((e) => e.getClientRects().length > 0);
  return seen.find((e) => e.closest('.dk-settings')) ?? seen[0] ?? null;
}

/** 2D util.js placeAt, for a popover: under the button (over it when there is no room), clamped 8 px inside the screen. Writes `translate` once as it opens and on a resize. */
export function placeMenu(el: HTMLElement, anchor: HTMLElement, align: 'start' | 'end', side: 'below' | 'above'): void {
  const r = anchor.getBoundingClientRect(), w = el.offsetWidth, hh = el.offsetHeight, vh = innerHeight, margin = 8, gap = 8;
  const x = align === 'end' ? r.right - w : r.left;
  let y = side === 'above' ? r.top - hh - gap : r.bottom + gap;
  if (side === 'below' && y + hh > vh - margin) y = Math.max(margin, r.top - hh - gap);
  y = Math.min(Math.max(margin, y), Math.max(margin, vh - hh - margin));
  el.style.translate = `clamp(${margin}px, ${Math.round(x)}px, calc(100vw - ${Math.round(w)}px - ${margin}px)) ${Math.round(y)}px`;
  el.style.setProperty('--pop-y', y < r.top ? '4px' : '-4px');
}

/** A page pushed inside a menu (2D util.js menuPush): History and Help from Settings. It lies over the menu's rows at the menu's own height and scrolls by itself; the rows slide away under it. */
export interface MenuPage { back: string; title: string; body: ReactNode }
export const PAGE_MS = 280;   // 2D --d-small

export function MenuPop({ kind, label, title, cls = 'app-menu', align = 'end', side = 'below', from = kind, page = null, onBack, children }: {
  kind: Exclude<Sheet, null>; label: string; title: string; cls?: string; align?: 'start' | 'end'; side?: 'below' | 'above'; /** the opener's `data-opens`, when it is not this menu's own name (Help opens from Settings) */ from?: string;
  /** the page pushed over the rows (and `onBack` to pop it); a menu that passes `onBack` keeps its rows in `.menu-root`, as 2D does */ page?: MenuPage | null; onBack?: () => void; children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const open = useOutside(kind, ref);
  const { shown, leaving } = usePresence(open);
  const [sheet, setSheet] = useState(() => typeof matchMedia === 'function' && matchMedia(STACK_MQ).matches);
  useEffect(() => {
    const mq = matchMedia(STACK_MQ), f = () => setSheet(mq.matches);
    f(); mq.addEventListener('change', f);
    return () => mq.removeEventListener('change', f);
  }, []);
  const root = typeof document === 'undefined' ? null : document.querySelector('.sh-root');
  // the pushed page: kept while it slides back out, and given the menu's box as it was when the page was pushed (read once, in that tap)
  const kept = useRef<MenuPage | null>(null);
  if (page) kept.current = page;
  const pg = usePresence(!!page && open, PAGE_MS);
  const [geo, setGeo] = useState<{ h: number; top: number; ch: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (page && open && el && !geo) setGeo({ h: el.offsetHeight, top: el.scrollTop, ch: el.clientHeight });
    else if (!pg.shown && geo) setGeo(null);
  }, [page, open, pg.shown, geo]);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!shown || !el || sheet) return;
    const put = () => { const a = anchorFor(from); if (a) placeMenu(el, a, align, side); };
    put();
    addEventListener('resize', put);
    return () => removeEventListener('resize', put);
  }, [shown, sheet, from, align, side]);
  if (!shown || !root) return null;
  const close = () => useShell.getState().close();
  const rows = (<>
    {sheet && <div className="sheet-head"><span className="sheet-t">{title}</span><button type="button" className="ib" aria-label="Close" onClick={close}><I n="close" /></button></div>}
    {children}
  </>);
  const pushed = !!onBack && !!page && open;
  const pageNow = kept.current;
  const menu = (
    <div ref={ref} className={`menu ${cls}${sheet ? ' as-sheet from-dock' : ''}${leaving ? ' leaving' : ''}${pushed ? ' pushed' : ''}`} role="dialog" aria-modal={sheet || undefined} aria-label={label} data-kind={kind} inert={!open}
      style={onBack && geo && pg.shown ? { height: geo.h } : undefined}>
      {onBack ? <div className="menu-root" inert={pushed}>{rows}</div> : rows}
      {onBack && pg.shown && pageNow && (
        <div className={`menu-page${pg.leaving ? ' out' : ''}`} role="group" aria-label={pageNow.title} inert={!pushed} style={geo ? { top: geo.top, height: geo.ch } : undefined}>
          <div className="sheet-head">
            <button type="button" className="menu-item menu-back" onClick={onBack}><I n="chev-left" />{pageNow.back}</button>
            <span className="sheet-t">{pageNow.title}</span>
            <button type="button" className="ib" aria-label="Close" onClick={close}><I n="close" /></button>
          </div>
          {pageNow.body}
        </div>
      )}
    </div>
  );
  return createPortal(<>{sheet && <div className={`um-scrim${leaving ? ' out' : ''}`} onPointerDown={close} />}{menu}</>, root);
}

/** menuSection: a titled group of rows; a group of radios is a radiogroup. */
export function MenuGroup({ title, radios, children }: { title?: string | null; radios?: boolean; children: ReactNode }) {
  const id = useId();
  return (
    <div className="menu-group" role={radios ? 'radiogroup' : 'group'} aria-labelledby={title ? id : undefined}>
      {title ? <div className="menu-title" id={id}>{title}</div> : null}
      {children}
    </div>
  );
}

/** menuItem: an icon, the words, a key hint; a toggle with an icon shows its state as a trailing check (role switch). */
export function MenuItem({ icon, label, kb, checked, onClick, title }: { icon?: string; label: string; kb?: string | null; checked?: boolean; onClick?: () => void; title?: string }) {
  const toggle = checked != null && !!icon;
  return (
    <button type="button" className="menu-item" role={toggle ? 'switch' : checked != null ? 'radio' : undefined} aria-checked={checked != null ? !!checked : undefined} title={title} onClick={onClick}>
      {toggle ? <I n={icon!} className="mi-ic" /> : checked != null ? <I n="check" className="mi-check" /> : icon ? <I n={icon} className="mi-ic" /> : null}
      <span>{label}</span>{kb ? <span className="kb">{kb}</span> : null}{toggle ? <I n="check" className="mi-check mi-trail" /> : null}
    </button>
  );
}

/** main.js menuToggle: a row of the Blood, Layers and Settings menus: an icon, a name, a line under it, and a switch. */
export function MenuToggle({ checked, icon, label, sub, onChange }: { checked: boolean; icon: string; label: string; sub?: string; onChange: (on: boolean) => void }) {
  return (
    <button type="button" className={`lens lens-opt${checked ? ' on' : ''}`} role="switch" aria-checked={checked} onClick={() => onChange(!checked)}>
      <I n={icon} className="bo-ic" /><span className="lens-t">{label}</span>{sub ? <span className="lens-d">{sub}</span> : null}<span className="mt-sw" aria-hidden="true" />
    </button>
  );
}
