// The few 2D helpers the copied "From readings" files call (copied/*.copied.js, scripts/copy-from-readings.mjs), on the 3D app: util.js's element builder, icon, popover,
// crossfades and announcer; ease.js's and motion.js's constants; prefs.js and caught.js. The flow's own markup, words and rules are the copies; this file is only what they
// stand on. The "popover" here is the 3D menu (shell/Menu.tsx MenuPop, on the 2D `.menu.fr-pop` rules): FromReadings.tsx hands its body over with setPopoverHost.
// Nothing here asks for a frame: a swap is two opacity animations on the compositor (Web Animations).
import { announce as say } from '../a11y/announce.ts';
import { STORAGE_PREFIX } from '../../state/settings.ts';

// ── ease.js, motion.js ──
export const D_FLIP = 120, D_SMALL = 240;
export const EASE_ARRIVE = 'cubic-bezier(.2, .8, .2, 1)', EASE_IN = 'cubic-bezier(.4, 0, 1, 1)';
export const reduceMotionMQ: { matches: boolean } = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };

// ── util.js h, svgIcon ──
type Kid = Node | string | number | null | undefined | false | Kid[];
type Attrs = Record<string, unknown> | null;
function addKids(el: Element, kids: Kid[]): void {
  for (const c of kids) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) addKids(el, c);
    else el.append(typeof c === 'object' ? c : document.createTextNode(String(c)));
  }
}
export function h(tag: string, attrs: Attrs = null, ...children: Kid[]): HTMLElement {
  const el = document.createElement(tag);
  if (attrs) for (const k in attrs) {
    const v = attrs[k];
    if (v == null || v === false) continue;
    if (k === 'class') el.className = String(v);
    else if (k === 'style' && typeof v === 'object') { for (const [sk, sv] of Object.entries(v as Record<string, string>)) { if (sk.startsWith('--')) el.style.setProperty(sk, sv); else (el.style as unknown as Record<string, string>)[sk] = sv; } }
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    else if (k === 'html') el.innerHTML = String(v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  addKids(el, children);
  return el;
}
/** An icon of the 2D atlas, as its markup has it. */
export function svgIcon(id: string, cls = ''): HTMLElement { return h('i', { class: `ic ic-${id}${cls ? ` ${cls}` : ''}`, 'aria-hidden': 'true' }); }

// ── util.js popover, closePopover: the open menu's body ──
let host: HTMLElement | null = null, onClose: (() => void) | null = null, closeMenu: () => void = () => {};
/** The open From readings menu's body and what closes the menu; null when the menu has gone (the flow's own onClose then runs, once). */
export function setPopoverHost(el: HTMLElement | null, close: () => void = () => {}): void {
  if (!el) { const f = onClose; onClose = null; host = null; f?.(); return; }
  host = el; closeMenu = close;
}
export function popover(_anchor: unknown, content: Node, opts: { onClose?: () => void } = {}): HTMLElement | null {
  if (!host) return null;
  host.replaceChildren(content);
  onClose = opts.onClose ?? null;
  return host.closest<HTMLElement>('.menu') ?? host;
}
export function closePopover(): void { closeMenu(); }

// ── util.js swapFade, swapText ──
const hasBox = (el: HTMLElement) => el.isConnected && !el.closest('[hidden]') && el.getClientRects().length > 0;
interface Job { fill: () => void; txt?: string }
const swaps = new WeakMap<HTMLElement, Job>(), fadeIns = new WeakMap<HTMLElement, Animation>();
/** Changes what an element shows without a one-frame jump: the old content fades out, fill() puts the new in, and it fades in (2D util.js swapFade). */
export function swapFade(el: HTMLElement, fill: () => void, { instant = false, out = D_FLIP, inn = D_SMALL }: { instant?: boolean; out?: number; inn?: number } = {}): void {
  const job = swaps.get(el);
  if (job) { job.fill = fill; return; }
  if (instant || typeof el.animate !== 'function' || !el.firstChild || !hasBox(el)) { fill(); return; }
  const me: Job = { fill };
  swaps.set(el, me);
  const a = el.animate([{ opacity: 0 }], { duration: out, easing: EASE_IN, fill: 'forwards' });
  const done = () => {
    if (swaps.get(el) !== me) return;
    swaps.delete(el);
    try { me.fill(); } finally { fadeIns.get(el)?.cancel(); a.cancel(); if (el.isConnected) fadeIns.set(el, el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: inn, easing: EASE_ARRIVE })); }
  };
  a.finished.then(done, done);
}
/** Text that crossfades when it changes (2D util.js swapText). */
export function swapText(el: HTMLElement, txt: string, then?: () => void): void {
  const job = swaps.get(el);
  if (job ? job.txt === txt : el.textContent === txt) return;
  const fill = () => { el.textContent = txt; then?.(); };
  if (!job && !el.firstChild && txt && typeof el.animate === 'function' && hasBox(el)) { fill(); el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: D_SMALL, easing: EASE_ARRIVE }); return; }
  swapFade(el, fill);
  const j = swaps.get(el); if (j) j.txt = txt;
}

export const announce = (msg: string): void => say(msg);

// ── prefs.js, caught.js ──
const keyFor = (k: string) => STORAGE_PREFIX + k.replace(/^pps\./, '');   // (under the 3D app's own prefix, so Reset everything clears it and the 2D app's copy on the same site is never read)
export const prefs = {
  getItem(k: string): string | null { try { return localStorage.getItem(keyFor(k)); } catch { return null; } },
  setItem(k: string, v: string): void { localStorage.setItem(keyFor(k), v); },
  removeItem(k: string): void { try { localStorage.removeItem(keyFor(k)); } catch { /* blocked storage: nothing to remove */ } },
};
export function caught(tag: string, e: unknown): void { console.warn(`caught (${tag}):`, e); }
