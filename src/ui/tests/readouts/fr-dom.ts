// The DOM helpers 2D's from-readings.js (copied whole, copied/from-readings.copied.js) takes from util.js: `h`, `svgIcon`, `popover`, `closePopover`, `swapFade`, `swapText`, `announce`;
// and the two small ones yours-store.js takes: `prefs` and `caught`. Each does what its 2D namesake does for this screen, on the 3D shell's own pieces: the popover is a `.menu.fr-pop`
// in the shell's `.sh-root` (a bottom sheet with a scrim on the stacked layout, a popover by its button elsewhere, placed by the shell's placePopover), leaving by `.leaving` as the shell's
// menus do; the fades are Web Animations on opacity. Nothing here runs in a frame: every call is a tap or a model answer.
import { STACK_MQ, menuExitMs } from '../../shell/Menu.tsx';
import { placePopover } from '../../shell/place.ts';
import { announce as say } from '../../a11y/announce.ts';
import { STORAGE_PREFIX } from '../../../state/settings.ts';
import { D_FLIP, D_SMALL, EASE_ARRIVE, EASE_IN } from '../copied/motion.copied.js';

type Attrs = Record<string, unknown> | null;
type Kid = Node | string | number | false | null | undefined | Kid[];
const NO_ATTRS: Attrs = Object.freeze({}) as Attrs;

function addKids(el: Element, kids: Kid[]): void {
  for (const c of kids) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) addKids(el, c);
    else el.append(typeof c === 'object' ? c : document.createTextNode(String(c)));
  }
}
/** util.js h: an element, its attributes (`class`, `style` as an object, `onclick`-style handlers, `html`), and its children (nested arrays, null and false skipped). */
export function h(tag: string, attrs: Attrs = NO_ATTRS, ...children: Kid[]): HTMLElement {
  const el = document.createElement(tag);
  if (attrs) for (const k in attrs) {
    const v = attrs[k];
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v as string;
    else if (k === 'style' && typeof v === 'object') { for (const sk in v as Record<string, string>) { if (sk.startsWith('--')) el.style.setProperty(sk, (v as Record<string, string>)[sk]!); else (el.style as unknown as Record<string, string>)[sk] = (v as Record<string, string>)[sk]!; } }
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    else if (k === 'html') el.innerHTML = v as string;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  addKids(el, children);
  return el;
}

/** util.js svgIcon: an atlas icon (`<i class="ic ic-NAME">`) with an extra class. */
export function svgIcon(id: string, cls = ''): HTMLElement {
  const el = document.createElement('i');
  el.className = `ic ic-${id}`;
  el.setAttribute('aria-hidden', 'true');
  if (cls) el.classList.add(...cls.split(/\s+/).filter(Boolean));
  return el;
}

/** The page's polite live region (a11y/announce.ts). */
export const announce = (msg: string): void => { say(msg); };

// ── the fades (util.js swapFade, swapText) ──
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const drawn = (el: HTMLElement) => el.isConnected && !el.closest('[hidden]') && (el.checkVisibility ? el.checkVisibility() : true);
const swaps = new WeakMap<HTMLElement, { fill: () => void; txt?: string }>();
const fadeIns = new WeakMap<HTMLElement, Animation>();
/** Changes what an element shows without a one-frame jump: the old content fades out (exit curve), fill() puts the new in, and it fades in. A hidden or empty element simply fills. */
export function swapFade(el: HTMLElement, fill: () => void, { instant = false, out = D_FLIP, inn = D_SMALL }: { instant?: boolean; out?: number; inn?: number } = {}): void {
  const job = swaps.get(el);
  if (job) { job.fill = fill; return; }
  if (instant || !el.animate || !el.firstChild || !drawn(el)) { fill(); return; }
  const me = { fill };
  swaps.set(el, me);
  const a = el.animate([{ opacity: 0 }], { duration: out, easing: EASE_IN, fill: 'forwards' });
  const done = () => {
    if (swaps.get(el) !== me) return;
    swaps.delete(el);
    try { me.fill(); } finally { fadeIns.get(el)?.cancel(); a.cancel(); fadeIns.set(el, el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: inn, easing: EASE_ARRIVE })); }
  };
  a.finished.then(done, done);
}
/** Text that crossfades when it changes, and fades in from empty so a word that appears does not pop either. then: run with the new text in. */
export function swapText(el: HTMLElement, txt: string, then?: () => void): void {
  const job = swaps.get(el);
  if (job ? job.txt === txt : el.textContent === txt) return;
  const fill = () => { el.textContent = txt; then?.(); };
  if (!job && !el.firstChild && txt && el.animate && drawn(el)) { fill(); el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: D_SMALL, easing: EASE_ARRIVE }); return; }
  swapFade(el, fill);
  const j = swaps.get(el); if (j) j.txt = txt;
}
export const fadeIn = (el: HTMLElement): void => { if (el.animate && drawn(el)) el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: D_SMALL, easing: EASE_ARRIVE }); };

// ── the popover (util.js popover, closePopover) ──
interface Open { el: HTMLElement; anchor: HTMLElement; scrim: HTMLElement | null; sheet: boolean; onClose?: () => void; off: () => void }
let open: Open | null = null;
const rootOf = (): HTMLElement => document.querySelector<HTMLElement>('.sh-root') ?? document.body;

/** A menu by its button, or a sheet on a phone. Returns the element, or null when the same button asked while it was open (it closes). */
export function popover(anchor: HTMLElement, content: Node, { cls = '', align = 'start', place = 'below', onClose, sheet = true, title = null }: { cls?: string; align?: 'start' | 'center' | 'end'; place?: 'below' | 'above'; onClose?: () => void; sheet?: boolean; title?: string | null } = {}): HTMLElement | null {
  if (open) { const same = open.anchor === anchor; closePopover(); if (same) return null; }
  const asSheet = sheet && matchMedia(STACK_MQ).matches;
  const el = h('div', { class: `menu ${cls}${asSheet ? ' as-sheet from-dock' : ''}`, role: 'dialog', 'aria-modal': asSheet ? 'true' : null, 'aria-label': anchor.getAttribute('aria-label') || anchor.title || anchor.textContent?.trim().slice(0, 40) || 'Menu' }, content);
  if (asSheet) el.prepend(h('div', { class: 'sheet-head' }, h('span', { class: 'sheet-t' }, title || ''), h('button', { class: 'ib', type: 'button', 'aria-label': 'Close', onclick: () => closePopover() }, svgIcon('close'))));
  const scrim = asSheet ? h('div', { class: 'um-scrim', onpointerdown: () => closePopover() }) : null;
  const root = rootOf();
  if (scrim) root.append(scrim);
  root.append(el);
  const put = () => { if (!asSheet && open?.el === el) placePopover(el, anchor, { align, place }); };
  if (!asSheet) { placePopover(el, anchor, { align, place }); addEventListener('resize', put); }
  // (Armed after this task, so the tap that opened the menu does not close it.)
  const away = (e: PointerEvent) => { const t = e.target as Node | null; if (el.contains(t) || anchor.contains(t) || scrim?.contains(t)) return; closePopover(); };
  const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); closePopover(); } };
  const armed = setTimeout(() => { addEventListener('pointerdown', away, true); }, 0);
  addEventListener('keydown', key, true);
  anchor.setAttribute('aria-expanded', 'true');
  open = { el, anchor, scrim, sheet: asSheet, onClose, off: () => { clearTimeout(armed); removeEventListener('pointerdown', away, true); removeEventListener('keydown', key, true); removeEventListener('resize', put); } };
  setTimeout(() => { if (open?.el === el) (el.querySelector<HTMLElement>('input, button') ?? el).focus({ preventScroll: true }); }, 0);
  return el;
}
/** The open popover fades out (inert at once), then leaves the page; focus goes back to its button. */
export function closePopover(): void {
  if (!open) return;
  const { el, anchor, scrim, sheet, onClose, off } = open;
  open = null;
  off();
  if (el.contains(document.activeElement)) anchor.focus({ preventScroll: true });
  anchor.setAttribute('aria-expanded', 'false');
  el.classList.add('leaving'); el.inert = true;
  scrim?.classList.add('out');
  setTimeout(() => { el.remove(); scrim?.remove(); }, menuExitMs(sheet, sheet, false) + 10);
  onClose?.();
}
export const popoverOpen = (): boolean => !!open;

// ── yours-store.js's two helpers ──
/** The device's saved preferences (prefs.js): this app's own prefix in place of `pps.`; storage that is blocked or full answers null, and a write answers false. */
export const prefs = {
  getItem(k: string): string | null { try { return localStorage.getItem(STORAGE_PREFIX + k.replace(/^pps\./, '')); } catch { return null; } },
  setItem(k: string, v: string): boolean { try { localStorage.setItem(STORAGE_PREFIX + k.replace(/^pps\./, ''), v); return true; } catch { return false; } },
};
const log = new Map<string, number>();
/** caught.js: an error the app goes on from, counted under its tag. */
export function caught(tag: string, _e?: unknown): void { log.set(tag, (log.get(tag) ?? 0) + 1); }
