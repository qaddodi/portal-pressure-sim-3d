// A sideways drag pages between Present and Patients (2D menu.js swipeTabs, ported line for line): the open list follows the finger with the other beside it, and on release it eases
// on to it (past a third of the way, or after a quick flick) or back. Past either end it gives a little and springs back. A vertical move stays the list's scroll or the pull down; the
// search box keeps its own drags, and a tap is still a tap. What the page is asked is read at the touch, never as the finger moves; what is written as it moves is `transform` alone,
// by the clock (motion.ts), and the let-go carries the finger's own speed (ease.copied.js carryCurve), as 2D's does.
// @ts-ignore plain JS copied from the 2D app
import { ownsSideways, pageGo } from './swipe.copied.js';
// @ts-ignore plain JS copied from the 2D app
import { releaseSpeed, carryCurve, cssCurve, D_SMALL } from '../tests/copied/ease.copied.js';
import { follow, glide, type Glide } from './motion.ts';
import { reduced } from '../a11y/motion.ts';

import { clock } from '../../clock/frame.ts';
const owns = ownsSideways as unknown as (el: EventTarget | null, o: { stop: Element }) => boolean;

export type Tab = 'present' | 'patients';
export const TABS: readonly Tab[] = ['present', 'patients'];
type Trail = [number, number][];

/** The menu's own hooks: which tab is open, and the switch (`still`: the list was swiped into place, so it does not play its entrance again). */
export interface TabsApi { tab(): Tab; setTab(t: Tab, still: boolean): void }

interface Sw {
  x: number; y: number; t: number; on: boolean; dx: number; w: number; top: number; h: number; carry0: number; carry: number;
  peers: HTMLElement[]; trail: Trail; i: number; j: number; cur: HTMLElement | null; nb: HTMLElement | null;
  mc: ReturnType<typeof follow> | null; mn: ReturnType<typeof follow> | null;
}

const tx = (el: HTMLElement) => (v: number) => { el.style.transform = v ? `translateX(${v}px)` : ''; };

/** Wires the paging to a menu panel. Returns the remover. */
export function swipeTabs(panel: HTMLElement, api: TabsApi): () => void {
  const cols = panel.querySelector<HTMLElement>('.um-cols');
  if (!cols) return () => undefined;
  const colOf = (k: Tab) => cols.querySelector<HTMLElement>(`.um-col[data-col="${k}"]`);
  const unpeer = (e: HTMLElement | null) => { if (e) { e.style.transform = ''; e.classList.remove('um-peer'); } };
  const clear = (e: HTMLElement | null) => { unpeer(e); if (e) { e.style.top = ''; e.style.height = ''; } };
  let sw: Sw | null = null, settle: (() => void) | null = null, resting: HTMLElement | null = null;   // settle: the last swipe's switch, while its lists are still easing; resting: the list that lands
  let easing: { el: HTMLElement; from: number; to: number; t0: number; f: (k: number) => number } | null = null;
  let runs: Glide[] = [];
  // (Where the easing list is drawn now: worked out from the release's own numbers and its curve, no style read.)
  const shiftX = (el: HTMLElement) => { const e = easing; if (!e || e.el !== el) return 0; const k = Math.min(1, (clock.now() - e.t0) / D_SMALL); return e.from + (e.to - e.from) * e.f(k); };

  const onStart = (e: TouchEvent) => {
    // (A second swipe before the first has settled finishes the first once it moves, not on the touch: a tap leaves the lists easing.)
    sw = e.touches.length === 1 && !owns(e.target, { stop: panel })
      ? { x: e.touches[0]!.clientX, y: e.touches[0]!.clientY, t: clock.now(), on: false, dx: 0, w: 0, top: 0, h: 0, carry0: 0, carry: 0, peers: [], trail: [], i: 0, j: 0, cur: null, nb: null, mc: null, mn: null }
      : null;
    if (!sw) return;
    // Everything the drag needs from the page is read here, at the touch, never as the finger moves: the lists' width, the room in view (where the other list shows from), and where an easing list is drawn now.
    sw.w = cols.clientWidth; sw.top = cols.scrollTop; sw.h = cols.clientHeight;
    sw.carry0 = resting && settle ? shiftX(resting) : 0;
    // (The list beside this one is put over the room in view now, while it is hidden: as the drag reaches for it, only its class changes.)
    sw.peers = TABS.filter((k) => k !== api.tab()).map(colOf).filter((c): c is HTMLElement => !!c && c !== resting);
    for (const c of sw.peers) { c.style.top = `${sw.top}px`; c.style.height = `${sw.h}px`; }
  };
  const onMove = (e: TouchEvent) => {
    const s = sw;
    if (!s) return;
    if (e.touches.length !== 1) { end(); return; }
    const t = e.touches[0]!, dx = t.clientX - s.x, dy = t.clientY - s.y;
    if (!s.on) {
      if (Math.hypot(dx, dy) < 8) return;
      if (Math.abs(dx) < Math.abs(dy) * 1.2) { sw = null; return; }   // (vertical: the list's scroll, or the pull down)
      // (Caught while the last swipe is still easing: it is finished at once, and the pull takes the list over from where it is drawn, so nothing jumps by what was left to go.)
      s.carry = s.carry0;
      settle?.();
      s.on = true; s.i = TABS.indexOf(api.tab()); s.cur = colOf(api.tab());
      if (!s.cur) { sw = null; return; }
      s.mc = follow(tx(s.cur));
    }
    if (e.cancelable) e.preventDefault();
    const tdx = dx + s.carry, d = tdx < 0 ? 1 : -1, j = s.i + d, nb = j >= 0 && j < TABS.length ? colOf(TABS[j]!) : null;
    if (nb !== s.nb) {
      s.mn?.stop(); unpeer(s.nb); s.nb = nb; s.j = j;
      s.mn = nb ? follow(tx(nb)) : null;
      // (The other list shows from its own top, over the part of the list in view: it lands there. Its place was set at the touch.)
      nb?.classList.add('um-peer');
    }
    s.dx = nb ? tdx : tdx / 3;   // (past the end the list moves a third of the finger)
    s.trail.push([clock.now(), t.clientX]); if (s.trail.length > 8) s.trail.shift();
    s.mc!.set(s.dx);
    if (nb) s.mn!.set(s.dx + d * s.w);
  };
  const end = () => {
    const s = sw; sw = null;
    if (!s?.on || !s.cur) return;
    const now = clock.now(), v: number = releaseSpeed(s.trail, now);   // (the finger's, px per ms to the right: the lists carry it on)
    const go = !!s.nb && pageGo(s.dx, now - s.t, s.w, v);
    const d = s.dx < 0 ? 1 : -1, curve = carryCurve(s.nb ? v : v / 3, (go ? -d * s.w : 0) - s.dx, D_SMALL) as string;
    const f = cssCurve(curve) as (u: number) => number;
    const toC = go ? -d * s.w : 0, fromN = s.dx + d * s.w, toN = go ? 0 : d * s.w;
    // (The held numbers go in this same task, after the let-go's first write: no frame is drawn between the two.)
    s.mc?.flush(); s.mn?.flush(); s.mc?.stop(); s.mn?.stop();
    const cur = s.cur, nb = s.nb;
    const done = () => {
      for (const r of runs) r.stop();
      runs = []; settle = null; easing = null;
      // (The list that lands and the one that leaves change places in one task: the tab, the peer class and the scroll together.)
      if (go && nb) {
        cur.style.transform = ''; nb.style.transform = ''; clear(nb); clear(cur);
        panel.dataset.tab = TABS[s.j]!;   // (React writes the same value a moment later; this is the one task that swaps them)
        api.setTab(TABS[s.j]!, true);
        cols.scrollTop = 0;
      } else { clear(cur); clear(nb); }
    };
    let finished = 0;
    const part = () => { if (++finished === (nb ? 2 : 1)) done(); };
    runs = [glide({ ms: D_SMALL, curve: f, tag: 'menu-swipe', apply: (k) => tx(cur)(s.dx + (toC - s.dx) * k), done: part })];
    if (nb) runs.push(glide({ ms: D_SMALL, curve: f, tag: 'menu-swipe', apply: (k) => tx(nb)(fromN + (toN - fromN) * k), done: part }));
    if (finished < (nb ? 2 : 1)) { settle = () => { for (const r of runs) r.stop(); done(); }; resting = go ? nb : cur; easing = { el: resting!, from: go ? fromN : s.dx, to: 0, t0: clock.now(), f }; }
    else resting = null;
  };
  // (A touch that never became a drag, a tap: the places set at the touch go, as the finger lifts.)
  const tapDone = () => { const s = sw; if (s && !s.on) for (const c of s.peers) if (!c.classList.contains('um-peer')) { c.style.top = ''; c.style.height = ''; } end(); };
  panel.addEventListener('touchstart', onStart, { passive: true });
  panel.addEventListener('touchmove', onMove, { passive: false });
  panel.addEventListener('touchend', tapDone, { passive: true });
  panel.addEventListener('touchcancel', tapDone, { passive: true });
  return () => {
    panel.removeEventListener('touchstart', onStart); panel.removeEventListener('touchmove', onMove);
    panel.removeEventListener('touchend', tapDone); panel.removeEventListener('touchcancel', tapDone);
    for (const r of runs) r.stop();
    sw?.mc?.stop(); sw?.mn?.stop();
  };
}

/** The tab change's entrance (menu.js setTab): the list's own fade-rise, played again by swapping the class between two names for the same animation. None for a list that was swiped into place. */
export function enterCol(col: HTMLElement | null, still: boolean): void {
  if (!col) return;
  if (still) { col.classList.remove('um-in', 'um-in2'); return; }
  if (reduced()) return;
  const was = col.classList.contains('um-in');
  col.classList.remove('um-in', 'um-in2'); col.classList.add(was ? 'um-in2' : 'um-in');
}
