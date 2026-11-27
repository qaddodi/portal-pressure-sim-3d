// The one sideways swipe between a surface's tabs (menu unification, stage 3: reports/menu-unification.md 3.2 "One tab swipe"; owner, 23 Nov: "can swipe between tabs of
// menus on touch screens basically"). Generalised from the Tests card's (2D dock.js, the touch handlers on the body; menu.js swipeTabs for the menu's lists): the open pane
// follows the finger with the next (or previous) tab's pane beside it, peeking in; on release it eases to whichever is nearer, or on to the next one after a quick flick
// (pageGo, with the finger's own speed carried on). Past the first or last tab it gives a third of the finger and springs back. A vertical move stays the sheet's pull or
// the list's scroll; a slider, a field and the stent editor keep their own drags (ownsSideways). Touch events are only sent by a touch screen, so a mouse never swipes.
// The Tests card, Treat and the main menu wire this one; each says how its panes are found, put beside the open one and landed (the API below).
// What is written while the finger moves is `transform` alone, by the clock (menu/motion.ts follow and glide); the page is read at the touch or at the claim, never as the
// finger moves.
// @ts-ignore plain JS copied from the 2D app
import { ownsSideways, pageGo } from '../menu/swipe.copied.js';
// @ts-ignore plain JS copied from the 2D app
import { releaseSpeed, carryCurve, cssCurve, D_SMALL } from '../tests/copied/ease.copied.js';
import { follow, glide, type Glide } from '../menu/motion.ts';
import { clock } from '../../clock/frame.ts';

const owns = ownsSideways as unknown as (el: EventTarget | null, o: { stop: Element; scrollers?: boolean }) => boolean;

export interface TabSwipeApi<T> {
  /** the swipe is on now (read at the touch): an open surface with nothing over its tabs */
  enabled(): boolean;
  /** the tabs, left to right, and the open one */
  tabs(): readonly T[];
  open(): T;
  /** this tab's pane is ready to be slid in (Tests: an instrument still on its way is not slid in empty) */
  ready?(id: T): boolean;
  /** the panes' width, px: read when the drag is claimed (or kept by an observer) */
  width(): number;
  /** a touch began (read and place what a drag needs, at the touch: the menu puts its other lists over the room in view) */
  touch?(): void;
  /** the touch ended without a drag (what touch() placed goes) */
  untouch?(): void;
  /** the drag is claimed (a build in place is given up) */
  begin?(): void;
  /** the open tab's pane */
  active(): HTMLElement | null;
  /** the neighbour comes beside the open pane, in this same task so the finger finds it (null: taken away; `was` is the one before); returns its element */
  peer(id: T | null, was: HTMLElement | null): HTMLElement | null;
  /** the neighbour has landed: the surface shows it as it stands, with no entrance of its own (`cur` was the open pane, already eased off) */
  land(id: T, cur: HTMLElement, nb: HTMLElement): void;
  /** the panes sprang back (their offsets are already off) */
  back?(cur: HTMLElement, nb: HTMLElement | null): void;
  /** the drag is over, landed or not */
  finish?(): void;
  /** a box that scrolls sideways keeps its drags (false: nothing scrolls sideways in the surface, so a drag from a table is the swipe) */
  scrollers?: boolean;
  /** the frame tag (?perf names it) */
  tag?: string;
}

/** The tab a step goes to: `dir` +1 (a swipe left) is the next, -1 the one before; null at either end or when there is no step. */
export function neighbourTab<T>(ids: readonly T[], cur: T, dir: -1 | 0 | 1): T | null {
  const i = ids.indexOf(cur);
  if (i < 0 || !dir) return null;
  return ids[i + dir] ?? null;
}

type Trail = [number, number][];
interface Sw<T> {
  x: number; y: number; t: number; on: boolean; dx: number; w: number; carry: number; trail: Trail; i: number; j: number;
  cur: HTMLElement | null; nb: HTMLElement | null; peerId: T | null; mc: ReturnType<typeof follow> | null; mn: ReturnType<typeof follow> | null;
}
const tx = (el: HTMLElement) => (v: number) => { el.style.transform = v ? `translateX(${v}px)` : ''; };

/** Wires the paging to the surface's element (`el`, where a finger starts it). Returns the remover. */
export function attachTabSwipe<T>(el: HTMLElement, api: TabSwipeApi<T>): () => void {
  const tag = api.tag ?? 'tab-swipe';
  // settle: the last swipe's switch, while its panes still ease; resting: the pane that lands
  let sw: Sw<T> | null = null, settle: (() => void) | null = null, resting: HTMLElement | null = null;
  let easing: { el: HTMLElement; from: number; to: number; t0: number; f: (k: number) => number } | null = null;
  let runs: Glide[] = [];
  // (Where a pane still easing from the last swipe is drawn, worked out from that ease rather than read back from the page.)
  const shiftX = (p: HTMLElement) => { const e = easing; if (!e || e.el !== p) return 0; const k = Math.min(1, (clock.now() - e.t0) / D_SMALL); return e.from + (e.to - e.from) * e.f(k); };

  const onStart = (e: TouchEvent) => {
    // (A second swipe before the first has settled finishes the first once it moves, not on the touch: a tap leaves the panes easing.)
    const ok = e.touches.length === 1 && api.enabled() && !owns(e.target, { stop: el, ...(api.scrollers === false ? { scrollers: false } : null) });
    const t0 = e.touches[0]!;
    sw = ok ? { x: t0.clientX, y: t0.clientY, t: clock.now(), on: false, dx: 0, w: 0, carry: 0, trail: [], i: 0, j: 0, cur: null, nb: null, peerId: null, mc: null, mn: null } : null;
    if (sw) api.touch?.();
  };
  const onMove = (e: TouchEvent) => {
    const s = sw;
    if (!s) return;
    if (e.touches.length !== 1) { end(); return; }
    const t = e.touches[0]!, dx = t.clientX - s.x, dy = t.clientY - s.y;
    if (!s.on) {
      if (Math.hypot(dx, dy) < 8) return;
      // (vertical: the sheet's pull, or the pane's scroll)
      if (Math.abs(dx) < Math.abs(dy) * 1.2) { sw = null; api.untouch?.(); return; }
      // (Caught while the last swipe is still easing: it is finished at once and the drag takes the pane over from where it is drawn, so nothing jumps by what was left to go.)
      s.carry = resting && settle ? shiftX(resting) : 0;
      settle?.();
      api.begin?.();
      const cur = api.active();
      if (!cur) { sw = null; api.untouch?.(); api.finish?.(); return; }
      s.on = true; s.i = api.tabs().indexOf(api.open()); s.w = api.width(); s.cur = cur; s.mc = follow(tx(cur), tag);
    }
    if (e.cancelable) e.preventDefault();
    const tabs = api.tabs(), tdx = dx + s.carry, d = tdx < 0 ? 1 : -1, j = s.i + d;
    const id = j >= 0 && j < tabs.length && (api.ready?.(tabs[j]!) ?? true) ? tabs[j]! : null;
    if (id !== s.peerId) {
      s.mn?.stop();
      const was = s.nb;
      if (was) was.style.transform = '';
      s.nb = api.peer(id, was); s.peerId = id;
      s.mn = s.nb ? follow(tx(s.nb), tag) : null;
    }
    s.j = j;
    // (past the first or last tab it gives a little and springs back)
    s.dx = s.nb ? tdx : tdx / 3;
    s.trail.push([clock.now(), t.clientX]); if (s.trail.length > 8) s.trail.shift();
    s.mc!.set(s.dx);
    if (s.nb) s.mn!.set(s.dx + d * s.w);
  };
  function end() {
    const s = sw; sw = null;
    if (!s?.on || !s.cur) return;
    // (the finger's, px per ms to the right: the panes carry it on)
    const now = clock.now(), v: number = releaseSpeed(s.trail, now);
    const go = !!s.nb && pageGo(s.dx, now - s.t, s.w, v);
    const d = s.dx < 0 ? 1 : -1, curve = carryCurve(s.nb ? v : v / 3, (go ? -d * s.w : 0) - s.dx, D_SMALL) as string;
    const f = cssCurve(curve) as (u: number) => number;
    const toC = go ? -d * s.w : 0, fromN = s.dx + d * s.w, toN = go ? 0 : d * s.w;
    // (The held numbers go in this same task, after the let-go's first write: no frame is drawn between the two.)
    s.mc?.flush(); s.mn?.flush(); s.mc?.stop(); s.mn?.stop();
    const cur = s.cur, nb = s.nb, id = go ? s.peerId : null;
    const done = () => {
      for (const r of runs) r.stop();
      runs = []; settle = null; easing = null; resting = null;
      // (the neighbour is in place: it takes the surface as it stands, no entrance of its own)
      if (id !== null && nb) { api.land(id, cur, nb); nb.style.transform = ''; }
      else { cur.style.transform = ''; if (nb) nb.style.transform = ''; api.peer(null, nb); api.back?.(cur, nb); }
      api.finish?.();
    };
    let finished = 0;
    const part = () => { if (++finished === (nb ? 2 : 1)) done(); };
    runs = [glide({ ms: D_SMALL, curve: f, tag, apply: (k) => tx(cur)(s.dx + (toC - s.dx) * k), done: part })];
    if (nb) runs.push(glide({ ms: D_SMALL, curve: f, tag, apply: (k) => tx(nb)(fromN + (toN - fromN) * k), done: part }));
    if (finished < (nb ? 2 : 1)) {
      settle = () => { for (const r of runs) r.stop(); done(); };
      resting = go ? nb : cur;
      easing = { el: resting!, from: go ? fromN : s.dx, to: 0, t0: clock.now(), f };
    }
  }
  // (A touch that never became a drag, a tap: what the touch placed goes, as the finger lifts.)
  const tapDone = () => { const s = sw; if (s && !s.on) { sw = null; api.untouch?.(); return; } end(); };
  el.addEventListener('touchstart', onStart, { passive: true });
  el.addEventListener('touchmove', onMove, { passive: false });
  el.addEventListener('touchend', tapDone, { passive: true });
  el.addEventListener('touchcancel', tapDone, { passive: true });
  return () => {
    el.removeEventListener('touchstart', onStart); el.removeEventListener('touchmove', onMove);
    el.removeEventListener('touchend', tapDone); el.removeEventListener('touchcancel', tapDone);
    for (const r of runs) r.stop();
    sw?.mc?.stop(); sw?.mn?.stop();
  };
}
