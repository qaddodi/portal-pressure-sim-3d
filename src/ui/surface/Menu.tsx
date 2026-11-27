// The one menu shell (menu unification, stage 4: reports/menu-unification.md 3.2 "Menu shell"), grown from shell/Menu.tsx MenuPop. Every menu of surface/kinds.ts (the main menu,
// Settings and its pages, Help, From readings, Blood, Layers on a wide screen and on a phone, the lens, the speed and jump-to menus of the timeline, the presenter's slide list) is
// this component with its own rows; the shell owns the seven answers:
//   1. sheet or float: useSurfaceMode() only (surface/mode.ts)
//   2. where: floating, by its opener through shell/place.ts (placePopover, or placeAt for the main menu), cut by fitRoom to the room between the top bar and the foot; a sheet rests on the dock
//   3. head: a sheet has one grab bar, its title and one X (surface/parts.tsx); a floating menu none, unless it has a field (the main menu) or asks for one (the slide list): menu-head.ts headOf
//   4. motion: mounted on open and kept for its leave by the one usePresence (surface/presence.ts says why), for leaveMs('menu', mode) (surface/motion.ts); the entrance and the leave are the
//      2D stylesheet's own (`.menu` slide-from-edge and `.leaving`, a sheet's mn-sheet-in and mn-sheet-out in menu-motion.css)
//   5. closing: a press outside it and its opener (surface/outside.ts), a press on the sheet's scrim, its X, a pull down in sheet mode (shell/sheet-swipe.ts),
//      a choice (its rows), the opener (a toggle);
//      Esc is the one Esc order's (keys/escape.ts for the shell's menus, the presenter's keys for the slide list)
//   6. no room is taken from the figure: a menu stands over it
//   7. mount: the sheets clip (shell/SheetClip.tsx), outside every bar, so no bar's transform can be its containing block (20 Nov: the speed menu landed below the page); the slide list stays
//      in the deck layer (`inline`), where the deck's stylesheet places it and its key rules reach it
// Each menu keeps the 2D class names its lifted stylesheet draws it by (menu-head.ts MENU_SKINS). A page pushed over a menu's rows (Settings' History, Help, Advanced and Figure pages) is
// surface/page-push.ts, the one pusher of the menus and of Treat's Changes page.
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { useShell } from '../shell/store.ts';
import { useSheetSwipe } from '../shell/use-sheet-swipe.ts';
import { placeAt, placePopover, stageTop, type PlaceOpts } from '../shell/place.ts';
import { pushPage, type Push } from './page-push.ts';
import { sheetRoot } from '../shell/SheetClip.tsx';
import { I } from '../shell/icons.tsx';
import { D_SMALL, LEAVE_SLACK_MS } from '../motion.ts';
import { useSurfaceMode, type SurfaceMode } from './mode.ts';
import { leaveMs } from './motion.ts';
import { usePresence } from './presence.ts';
import { useOutsidePress } from './outside.ts';
import { CloseX, GrabBar } from './parts.tsx';
import { MENU_SKINS, headOf, type MenuId, type MenuSkin, type MenuWidth } from './menu-head.ts';
import './menu.css';

export type { MenuId, MenuSkin, MenuWidth };

/** The button that opened this menu: the first visible control that says `data-opens` for it (the top bar's, the thumb bar's tab, the presenter pill's gear). */
function anchorFor(from: string): HTMLElement | null {
  const all = [...document.querySelectorAll<HTMLElement>(`[data-opens="${from}"]`)];
  const seen = all.filter((e) => e.getClientRects().length > 0);
  return seen.find((e) => e.closest('.dk-settings')) ?? seen[0] ?? null;
}

/** A floating menu whose opener is not on the screen (it was opened by a key or a link): centred under the top bar. */
function centre(el: HTMLElement): void {
  el.style.maxHeight = '';
  el.style.translate = `calc(50vw - 50%) ${stageTop()}px`;
}

/** Where a floating menu stands: by its opener (`from`, its `data-opens`; the menu's own id by default), on `side`, held to `align`; `at` places it by placeAt with those options. */
export interface MenuPlace { from?: string; align?: 'start' | 'center' | 'end'; side?: 'below' | 'above'; at?: PlaceOpts }
/** The open state of a menu that is not one of the shell's sheets (the slide list: useUi.jump). */
export interface MenuState { open: boolean; close(): void }
export interface MenuCtl {
  id: MenuId; open: boolean; mode: SurfaceMode; sheet: boolean; shown: boolean; leaving: boolean; ref: RefObject<HTMLDivElement | null>;
  close(): void; /** a press outside or on the scrim: the shell's closeByPress, so the opener's click that follows does not reopen it */ pressClose(): void;
}

/** The shell's state, placement, outside press and pull for one menu. A menu whose own hooks need it (the main menu) calls this and hands the result to <Menu ctl>. */
export function useMenu(id: MenuId, { state, from = id, align = 'start', side = 'below', at }: MenuPlace & { state?: MenuState } = {}): MenuCtl {
  const ref = useRef<HTMLDivElement | null>(null);
  const shellOpen = useShell((s) => s.sheet === id);
  const open = state ? state.open : shellOpen;
  const close = state ? state.close : () => useShell.getState().close();
  const pressClose = state ? state.close : () => useShell.getState().closeByPress();
  const mode = useSurfaceMode();
  const sheet = mode === 'sheet';
  const { shown, leaving } = usePresence(open, leaveMs('menu', mode));
  useOutsidePress(open, [ref], pressClose, `[data-opens="${id}"]`);
  const atKey = at ? JSON.stringify(at) : '';
  // the one placer (shell/place.ts), written once as the menu opens and again when the window or the visual viewport moves (the on-screen keyboard lifts the room's floor); a sheet is
  // placed by its stylesheet, so a place left from before the screen turned is taken off
  useLayoutEffect(() => {
    const el = ref.current;
    if (!shown || !el) return;
    if (sheet) { el.style.translate = ''; el.style.maxHeight = ''; return; }
    const put = () => {
      const a = anchorFor(from);
      if (!a) centre(el);
      else if (at) placeAt(el, a, at);
      else placePopover(el, a, { align, place: side });
    };
    put();
    const vv = window.visualViewport;
    addEventListener('resize', put); vv?.addEventListener('resize', put); vv?.addEventListener('scroll', put);
    return () => { removeEventListener('resize', put); vv?.removeEventListener('resize', put); vv?.removeEventListener('scroll', put); };
  }, [shown, sheet, from, align, side, atKey]);   // eslint-disable-line react-hooks/exhaustive-deps
  // a sheet follows a pull down and closes past a short one (2D util.js swipeSheet); it is in the page only while shown, and the hook wires whichever element is there
  useSheetSwipe(ref, close, () => sheet, shown);
  return { id, open, mode, sheet, shown, leaving, ref, close, pressClose };
}

/** A page pushed inside a menu (2D util.js menuPush): History, Help, Advanced and Figure's More from Settings. It lies over the menu's rows at the menu's own height and scrolls by itself. */
export interface MenuPage { back: string; title: string; body: ReactNode }
/** A page stays mounted while its slide runs: 2D --d-small (page-push.ts) and a frame or two. */
const PAGE_MS = D_SMALL + LEAVE_SLACK_MS;
interface Geo { h: number; top: number; ch: number }

/** The page over a menu's rows, on 2D's pushPage: it slides in, follows a swipe right and slides away; `pushed` going false (or a back tap) sends it back first. */
function MenuPageView({ page, pushed, geo, leaving, onBack, onClose }: { page: MenuPage; pushed: boolean; geo: Geo | null; leaving: boolean; onBack(): void; onClose(): void }) {
  const el = useRef<HTMLDivElement>(null);
  const push = useRef<Push | null>(null);
  const back = useRef(onBack);
  back.current = onBack;
  useLayoutEffect(() => {
    const p = el.current, away = p?.parentElement?.querySelector<HTMLElement>(':scope > .menu-root');
    if (!p || !away) return;
    // (the page's width is read once, in the tap that pushed it)
    const inst = pushPage(p, [away], p.parentElement!.offsetWidth, { onPop: () => back.current() });
    push.current = inst;
    return () => { inst.dispose(); push.current = null; };
  }, []);
  useEffect(() => { if (!pushed && !leaving) push.current?.pop(0); }, [pushed, leaving]);
  return (
    <div ref={el} className="menu-page" role="group" aria-label={page.title} inert={!pushed} style={geo ? { top: geo.top, height: geo.ch } : undefined}>
      <div className="sheet-head">
        <button type="button" className="menu-item menu-back" onClick={() => push.current?.pop(0)}><I n="chev-left" />{page.back}</button>
        <span className="sheet-t">{page.title}</span>
        <CloseX onClose={onClose} />
      </div>
      {page.body}
    </div>
  );
}

export interface MenuProps extends MenuPlace {
  id: MenuId; label: string; /** the head's words (a sheet's, and a floating one's that asks for a head) */ title: string;
  skin?: MenuSkin; /** the menu's own 2D class (app-menu, fr-pop, layers-pop) */ cls?: string; width?: MenuWidth;
  state?: MenuState; /** the shell's hooks, when the menu called useMenu itself */ ctl?: MenuCtl; mount?: 'sheets' | 'inline';
  /** a field that stands in the title's place, in both modes (the main menu's search) */ field?: ReactNode; /** a head when it floats too */ headAlways?: boolean; closeLabel?: string;
  /** the page pushed over the rows (and `onBack` to pop it); a menu that passes `onBack` keeps its rows in `.menu-root`, as 2D does */ page?: MenuPage | null; onBack?: () => void;
  extraCls?: string; data?: Record<`data-${string}`, string>; onKeyDown?(e: KeyboardEvent<HTMLDivElement>): void;
  /** laid beside the menu in its clip (the main menu's preview card) */ beside?: ReactNode; children: ReactNode;
}

/** A floating box placed by translate from the window's corner: its own offsets are taken off (the slide list's deck stylesheet centres it by `left` and `translate`). */
const FROM_CORNER: CSSProperties = { left: 0, top: 0, right: 'auto', bottom: 'auto' };

export function Menu(p: MenuProps) {
  return p.ctl ? <MenuFrame {...p} ctl={p.ctl} /> : <OwnMenu {...p} />;
}
function OwnMenu(p: MenuProps) {
  const ctl = useMenu(p.id, p);
  return <MenuFrame {...p} ctl={ctl} />;
}

function MenuFrame(p: MenuProps & { ctl: MenuCtl }) {
  const { ctl, label, title, skin = 'menu', cls, width, mount = 'sheets', field, headAlways, closeLabel = 'Close', page = null, onBack, extraCls, data, onKeyDown, beside, children } = p;
  const { id, open, mode, sheet, shown, leaving, ref, close, pressClose } = ctl;
  const s = MENU_SKINS[skin];
  // the pushed page: kept while it slides back out, and given the menu's box as it was when the page was pushed (read once, in that tap)
  const kept = useRef<MenuPage | null>(null);
  if (page) kept.current = page;
  const pg = usePresence(!!page && open, PAGE_MS);
  const [geo, setGeo] = useState<Geo | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (page && open && el && !geo) setGeo({ h: el.offsetHeight, top: el.scrollTop, ch: el.clientHeight });
    else if (!pg.shown && geo) setGeo(null);
  }, [page, open, pg.shown, geo, ref]);
  const root = mount === 'sheets' ? sheetRoot() : null;
  if (!shown || (mount === 'sheets' && !root)) return null;
  const h = headOf(mode, { field: field != null, always: headAlways });
  const rows = (<>
    {h.grab && <GrabBar />}
    {h.head && (
      <div className={s.head}>
        {h.title === 'field' ? field : <span className={s.title || undefined}>{title}</span>}
        <CloseX label={closeLabel} onClose={close} className={s.x || undefined} />
      </div>
    )}
    {children}
  </>);
  const pushed = !!onBack && !!page && open;
  const style: CSSProperties = { ...(skin === 'jump' && !sheet ? FROM_CORNER : {}), ...(onBack && geo && pg.shown ? { height: geo.h } : {}) };
  const cn = [s.base, cls, sheet && s.sheet, leaving && s.leaving, pushed && 'pushed', extraCls, 'sf-menu'].filter(Boolean).join(' ');
  const menu = (
    <div ref={ref} id={menuDomId(id)} className={cn} role="dialog" aria-modal={sheet || undefined} aria-label={label} data-kind={id} data-mode={mode} data-w={width} data-open={open}
      inert={!open} style={style} onKeyDown={onKeyDown} {...data}>
      {onBack ? <div className="menu-root" inert={pushed}>{rows}</div> : rows}
      {onBack && pg.shown && kept.current && <MenuPageView page={kept.current} pushed={pushed} geo={geo} leaving={leaving} onBack={onBack} onClose={close} />}
    </div>
  );
  if (mount === 'inline') return menu;
  // a sheet lies over a scrim that a press closes (by press: the opener under it does not reopen it)
  return createPortal(<>{sheet && <div className={`um-scrim${leaving ? ' out' : ''}`} onPointerDown={pressClose} />}{menu}{beside}</>, root!);
}

/** The id a menu's opener names in `aria-controls`. */
export const menuDomId = (id: MenuId): string => `menu-${id}`;
