// The 2D app's menu, on its own markup and class names (util.js popover, menuItem, menuSection and main.js menuToggle): `.menu.app-menu` holding `.menu-group` > `.menu-title` and
// `.menu-item` / `.lens.lens-opt` rows. A popover under (or over) the button that opened it, or a bottom sheet with a head and a scrim on the stacked layout (STACK_MQ).
// It is in the page only while open: it comes in on the 2D stylesheet's own entrance (slide-from-edge / scale-settle), and leaves by `.leaving`, then goes. Its stylesheet is the 2D app's
// (src/ui/css2d), copied unchanged; nothing here styles it. The frost is the one glass (glass.css).
import { useSheetSwipe } from './use-sheet-swipe.ts';
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useShell, type Sheet } from './store.ts';
import { useOutside } from './Pop.tsx';
import { I } from './icons.tsx';
import { placePopover } from './place.ts';
import { pushPage, type Push } from './page-push.ts';

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

/** A page pushed inside a menu (2D util.js menuPush): History and Help from Settings. It lies over the menu's rows at the menu's own height and scrolls by itself; the rows slide away under it
 *  (page-push.ts: the slide and the swipe right that takes it with the finger are written by the clock). */
export interface MenuPage { back: string; title: string; body: ReactNode }
export const PAGE_MS = 280;   // 2D --d-small (240) and a frame or two: a page stays mounted while its slide runs

/** 2D util.js menuExitMs: a sheet, and a menu from the thumb dock (which settles in over --d-small), take --d-small both ways; any other, --d-flip. */
export const menuExitMs = (sheet: boolean, fromDock: boolean, thumb: boolean): number => (sheet || (fromDock && thumb) ? 240 : MENU_LEAVE_MS);

/** The page pushed over a menu's rows, on 2D's pushPage: it slides in, follows a swipe right and slides away; `pushed` going false (or a back tap) sends it back first. */
function MenuPageView({ page, pushed, geo, leaving, onPop, onBack, onClose }: {
  page: MenuPage; pushed: boolean; geo: { h: number; top: number; ch: number } | null; leaving: boolean; onPop(): void; onBack?: () => void; onClose(): void;
}) {
  const el = useRef<HTMLDivElement>(null);
  const push = useRef<Push | null>(null);
  const cb = useRef({ onPop, onBack });
  cb.current = { onPop, onBack };
  useLayoutEffect(() => {
    const p = el.current, away = p?.parentElement?.querySelector<HTMLElement>(':scope > .menu-root');
    if (!p || !away) return;
    // (the page's width is read once, in the tap that pushed it)
    const inst = pushPage(p, [away], p.parentElement!.offsetWidth, { onPop: () => { cb.current.onPop(); cb.current.onBack?.(); } });
    push.current = inst;
    return () => { inst.dispose(); push.current = null; };
  }, []);
  useEffect(() => { if (!pushed && !leaving) push.current?.pop(0); }, [pushed, leaving]);
  return (
    <div ref={el} className="menu-page" role="group" aria-label={page.title} inert={!pushed} style={geo ? { top: geo.top, height: geo.ch } : undefined}>
      <div className="sheet-head">
        <button type="button" className="menu-item menu-back" onClick={() => push.current?.pop(0)}><I n="chev-left" />{page.back}</button>
        <span className="sheet-t">{page.title}</span>
        <button type="button" className="ib" aria-label="Close" onClick={onClose}><I n="close" /></button>
      </div>
      {page.body}
    </div>
  );
}

export function MenuPop({ kind, label, title, cls = 'app-menu', align = 'end', side = 'below', from = kind, page = null, onBack, children }: {
  kind: Exclude<Sheet, null>; label: string; title: string; cls?: string; align?: 'start' | 'end'; side?: 'below' | 'above'; /** the opener's `data-opens`, when it is not this menu's own name (Help opens from Settings) */ from?: string;
  /** the page pushed over the rows (and `onBack` to pop it); a menu that passes `onBack` keeps its rows in `.menu-root`, as 2D does */ page?: MenuPage | null; onBack?: () => void; children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const open = useOutside(kind, ref);
  const [sheet, setSheet] = useState(() => typeof matchMedia === 'function' && matchMedia(STACK_MQ).matches);
  const thumb = typeof document !== 'undefined' && document.documentElement.classList.contains('thumb-ui');
  const { shown, leaving } = usePresence(open, menuExitMs(sheet, sheet || !!anchorFor(from)?.closest('.vdock'), thumb));
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
    const put = () => { const a = anchorFor(from); if (a) placePopover(el, a, { align, place: side }); };
    put();
    addEventListener('resize', put);
    return () => removeEventListener('resize', put);
  }, [shown, sheet, from, align, side]);
  useSheetSwipe(ref, () => useShell.getState().close(), () => sheet, shown);   // (2D util.js: a popover that is a sheet follows a pull down; it is in the page only while shown)
  if (!shown || !root) return null;
  const close = () => useShell.getState().close();
  const rows = (<>
    {sheet && <i className="sh-grabbar" aria-hidden="true" />}
    {sheet && <div className="sheet-head"><span className="sheet-t">{title}</span><button type="button" className="ib" aria-label="Close" onClick={close}><I n="close" /></button></div>}
    {children}
  </>);
  const pushed = !!onBack && !!page && open;
  const pageNow = kept.current;
  const menu = (
    <div ref={ref} className={`menu ${cls}${sheet ? ' as-sheet from-dock' : ''}${leaving ? ' leaving' : ''}${pushed ? ' pushed' : ''}`} role="dialog" aria-modal={sheet || undefined} aria-label={label} data-kind={kind} inert={!open}
      style={onBack && geo && pg.shown ? { height: geo.h } : undefined}>
      {onBack ? <div className="menu-root" inert={pushed}>{rows}</div> : rows}
      {onBack && pg.shown && pageNow && <MenuPageView page={pageNow} pushed={pushed} geo={geo} leaving={leaving} onPop={() => undefined} onBack={onBack} onClose={close} />}
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
