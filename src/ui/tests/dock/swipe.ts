// A phone's Tests card pages between the tabs by a sideways drag (2D dock.js, the touch handlers on the body): the open pane follows the finger with the next (or previous) tab's pane beside
// it; on release it eases to whichever is nearer, or on to the next one after a quick flick (pageGo, with the finger's own speed carried on). A vertical pull stays the sheet's (it closes or
// resizes the card). Past the first or last tab it gives a third of the finger and springs back. Nothing in the card scrolls sideways, so a sideways drag from a table or a row of chips is
// always the swipe (ownsSideways with scrollers: false); a slider, a field and the stent editor keep their own drags.
// What is written while the finger moves is `transform` alone, by the clock (menu/motion.ts follow/glide); the page is read at the touch, never as the finger moves (the body's width comes
// from the card's observer). Ported from menu/swipe-tabs.ts, which ports the same 2D lines for the menu's Present / Patients.
// @ts-ignore plain JS copied from the 2D app
import { ownsSideways, pageGo } from '../../menu/swipe.copied.js';
// @ts-ignore plain JS copied from the 2D app
import { releaseSpeed, carryCurve, cssCurve, D_SMALL } from '../copied/ease.copied.js';
import { follow, glide, type Glide } from '../../menu/motion.ts';
import type { PaneId } from '../panes.ts';

const owns = ownsSideways as unknown as (el: EventTarget | null, o: { stop: Element; scrollers: boolean }) => boolean;

export interface SwipeApi {
  /** the swipe is on: a phone's sheet with one instrument up */
  enabled(): boolean;
  /** the tabs, left to right */
  tabs: readonly PaneId[];
  /** the open tab's place among them */
  index(): number;
  /** the instrument for this tab is in (an instrument still on its way is not slid in empty) */
  ready(id: PaneId): boolean;
  /** the neighbour is built beside the open pane (null: taken away); done in the same task so the finger finds it */
  peer(id: PaneId | null): void;
  /** the pane on show and the neighbour's, by their elements */
  active(): HTMLElement | null;
  paneOf(id: PaneId): HTMLElement | null;
  /** the drag begins (a build in place is given up) and ends */
  begin(): void;
  finish(): void;
  /** the neighbour lands: the card shows it as it stands */
  land(id: PaneId): void;
}

type Trail = [number, number][];
interface Sw {
  x: number; y: number; t: number; on: boolean; dx: number; w: number; carry: number; trail: Trail; i: number; j: number;
  cur: HTMLElement | null; nb: HTMLElement | null; peerId: PaneId | null; mc: ReturnType<typeof follow> | null; mn: ReturnType<typeof follow> | null;
}
const tx = (el: HTMLElement) => (v: number) => { el.style.transform = v ? `translateX(${v}px)` : ''; };

/** Wires the paging to the card's body. `width()` is the body's width as its observer last saw it. Returns the remover. */
export function attachSwipe(body: HTMLElement, width: () => number, api: SwipeApi): () => void {
  let sw: Sw | null = null, settle: (() => void) | null = null, resting: HTMLElement | null = null;   // settle: the last swipe's switch, while its panes still ease; resting: the pane that lands
  let easing: { el: HTMLElement; from: number; to: number; t0: number; f: (k: number) => number } | null = null;
  let runs: Glide[] = [];
  // (Where a pane still easing from the last swipe is drawn, worked out from that ease rather than read back from the page.)
  const shiftX = (el: HTMLElement) => { const e = easing; if (!e || e.el !== el) return 0; const k = Math.min(1, (performance.now() - e.t0) / D_SMALL); return e.from + (e.to - e.from) * e.f(k); };

  const onStart = (e: TouchEvent) => {
    // (A second swipe before the first has settled finishes the first once it moves, not on the touch: a tap leaves the panes easing.)
    sw = e.touches.length === 1 && api.enabled() && !owns(e.target, { stop: body, scrollers: false })
      ? { x: e.touches[0]!.clientX, y: e.touches[0]!.clientY, t: performance.now(), on: false, dx: 0, w: 0, carry: 0, trail: [], i: 0, j: 0, cur: null, nb: null, peerId: null, mc: null, mn: null }
      : null;
  };
  const onMove = (e: TouchEvent) => {
    const s = sw;
    if (!s) return;
    if (e.touches.length !== 1) { end(); return; }
    const t = e.touches[0]!, dx = t.clientX - s.x, dy = t.clientY - s.y;
    if (!s.on) {
      if (Math.hypot(dx, dy) < 8) return;
      if (Math.abs(dx) < Math.abs(dy) * 1.2) { sw = null; return; }   // (vertical: the sheet's, or the pane's scroll)
      // (Caught while the last swipe is still easing: it is finished at once and the pull takes the pane over from where it is drawn, so nothing jumps by what was left to go.)
      s.carry = resting && settle ? shiftX(resting) : 0;
      settle?.();
      api.begin();
      const cur = api.active();
      if (!cur) { sw = null; api.finish(); return; }
      s.on = true; s.i = api.index(); s.w = width(); s.cur = cur; s.mc = follow(tx(cur), 'tests-swipe');
    }
    if (e.cancelable) e.preventDefault();
    const tdx = dx + s.carry, d = tdx < 0 ? 1 : -1, j = s.i + d;
    const id = j >= 0 && j < api.tabs.length && api.ready(api.tabs[j]!) ? api.tabs[j]! : null;
    if (id !== s.peerId) {
      s.mn?.stop(); if (s.nb) s.nb.style.transform = '';
      api.peer(id); s.peerId = id;
      s.nb = id ? api.paneOf(id) : null;
      s.mn = s.nb ? follow(tx(s.nb), 'tests-swipe') : null;
    }
    s.j = j;
    s.dx = s.nb ? tdx : tdx / 3;   // (past the first or last tab it gives a little and springs back)
    s.trail.push([performance.now(), t.clientX]); if (s.trail.length > 8) s.trail.shift();
    s.mc!.set(s.dx);
    if (s.nb) s.mn!.set(s.dx + d * s.w);
  };
  function end() {
    const s = sw; sw = null;
    if (!s?.on || !s.cur) return;
    const now = performance.now(), v: number = releaseSpeed(s.trail, now);   // (the finger's, px per ms to the right: the panes carry it on)
    const go = !!s.nb && pageGo(s.dx, now - s.t, s.w, v);
    const d = s.dx < 0 ? 1 : -1, curve = carryCurve(s.nb ? v : v / 3, (go ? -d * s.w : 0) - s.dx, D_SMALL) as string;
    const f = cssCurve(curve) as (u: number) => number;
    const toC = go ? -d * s.w : 0, fromN = s.dx + d * s.w, toN = go ? 0 : d * s.w;
    // (The held numbers go in this same task, after the let-go's first write: no frame is drawn between the two.)
    s.mc?.flush(); s.mn?.flush(); s.mc?.stop(); s.mn?.stop();
    const cur = s.cur, nb = s.nb, id = go ? api.tabs[s.j]! : null;
    const done = () => {
      for (const r of runs) r.stop();
      runs = []; settle = null; easing = null; resting = null;
      if (id && nb) { api.land(id); nb.style.transform = ''; }   // (the neighbour is in place: it takes the card as it stands, no entrance of its own)
      else { cur.style.transform = ''; if (nb) nb.style.transform = ''; api.peer(null); }
      api.finish();
    };
    let finished = 0;
    const part = () => { if (++finished === (nb ? 2 : 1)) done(); };
    runs = [glide({ ms: D_SMALL, curve: f, tag: 'tests-swipe', apply: (k) => tx(cur)(s.dx + (toC - s.dx) * k), done: part })];
    if (nb) runs.push(glide({ ms: D_SMALL, curve: f, tag: 'tests-swipe', apply: (k) => tx(nb)(fromN + (toN - fromN) * k), done: part }));
    if (finished < (nb ? 2 : 1)) { settle = () => { for (const r of runs) r.stop(); done(); }; resting = go ? nb : cur; easing = { el: resting!, from: go ? fromN : s.dx, to: 0, t0: performance.now(), f }; }
  }
  const tapDone = () => end();
  body.addEventListener('touchstart', onStart, { passive: true });
  body.addEventListener('touchmove', onMove, { passive: false });
  body.addEventListener('touchend', tapDone, { passive: true });
  body.addEventListener('touchcancel', tapDone, { passive: true });
  return () => {
    body.removeEventListener('touchstart', onStart); body.removeEventListener('touchmove', onMove);
    body.removeEventListener('touchend', tapDone); body.removeEventListener('touchcancel', tapDone);
    for (const r of runs) r.stop();
    sw?.mc?.stop(); sw?.mn?.stop();
  };
}
