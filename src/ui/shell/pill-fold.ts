// The view pill changes its buttons with the view (views.ts: the current view and its neighbours), and nothing pops (Mohammad, 20 Nov: "segments ease in and out, the pill's width animates").
// 2D's pill-motion.js idea, on the Web Animations API (transform and opacity only, on the compositor; written once per change of the view, never in a frame):
//   - the pill's glass (.vp-face) grows or shrinks about its centre, by a scaleX from the old width to the new;
//   - a button that stays slides from where it was to where it rests;
//   - a button that comes slides out from beside its nearest staying neighbour, fading in; a button that goes is drawn once more as a ghost that rides with that neighbour, fading out.
// Positions are layout positions from the pill's centre (offsetLeft, which a transform in flight does not move), so one fold taking over from another starts from the layout, never a half-way frame.
import type { ViewId } from './views.ts';

export interface Box { l: number; w: number }
/** What the pill's layout is: its own width, and each shown button's left edge (px from the pill's centre) and width. */
export interface Snap { w: number; items: Map<ViewId, Box> }
export type Move = { kind: 'stay' | 'in' | 'out'; dx0: number; dx1: number; o0: number; o1: number };

export const FOLD_MS = 420, FOLD_EASE = 'cubic-bezier(0.5, 0, 0.5, 1)';   // (--d-surface on --ease-move: what travels)

/** The fold, worked out: for each view in `order`, where it starts from and ends (px offset from its resting place, or from where it was drawn for a going one) and its opacity. */
export function foldPlan(before: Snap, after: Snap, order: readonly ViewId[]): Map<ViewId, Move> {
  const stay = order.filter((k) => before.items.has(k) && after.items.has(k));
  const shift = (k: ViewId) => before.items.get(k)!.l - after.items.get(k)!.l;   // (how far a staying button starts from its resting place)
  const near = (k: ViewId) => {
    const i = order.indexOf(k);
    let best: ViewId | null = null;
    for (const s of stay) if (best == null || Math.abs(order.indexOf(s) - i) < Math.abs(order.indexOf(best) - i)) best = s;
    return best == null ? 0 : shift(best);
  };
  const plan = new Map<ViewId, Move>();
  for (const k of order) {
    const inB = before.items.has(k), inA = after.items.has(k);
    if (inB && inA) plan.set(k, { kind: 'stay', dx0: shift(k), dx1: 0, o0: 1, o1: 1 });
    else if (inA) plan.set(k, { kind: 'in', dx0: near(k), dx1: 0, o0: 0, o1: 1 });
    else if (inB) plan.set(k, { kind: 'out', dx0: 0, dx1: -near(k), o0: 1, o1: 0 });
  }
  return plan;
}

/** The face's scale at the start of the fold (its new width is the layout it rests at). */
export const faceFrom = (before: Snap, after: Snap): number => (after.w > 0 && before.w > 0 ? before.w / after.w : 1);

/** The pill's layout now: `seg` is the row of buttons, centred in its box. */
export function snapOf(seg: HTMLElement, box: HTMLElement): Snap {
  const items = new Map<ViewId, Box>(), c = seg.offsetWidth / 2;
  for (const b of seg.querySelectorAll<HTMLElement>(':scope > button[data-view]')) {
    if (b.hidden || b.dataset.ghost != null || !b.offsetWidth) continue;
    items.set(b.dataset.view as ViewId, { l: b.offsetLeft - c, w: b.offsetWidth });
  }
  return { w: box.offsetWidth, items };
}

const running = new Set<Animation | HTMLElement>();
/** Ends a fold where it stands: animations dropped (every button at rest), ghosts removed. */
export function stopFold(seg: HTMLElement): void {
  for (const x of running) { if (x instanceof HTMLElement) x.remove(); else x.cancel(); }
  running.clear();
  seg.classList.remove('vp-fold');
}

/** Plays the fold from `before` to the layout now (the buttons and the pill already at their new places). Returns false when nothing needs to move. */
export function playFold(seg: HTMLElement, box: HTMLElement, before: Snap, order: readonly ViewId[]): boolean {
  stopFold(seg);
  const after = snapOf(seg, box), plan = foldPlan(before, after, order);
  const moves = [...plan.values()].some((m) => m.kind !== 'stay' || Math.abs(m.dx0) > 0.5);
  if (!moves && Math.abs(before.w - after.w) < 0.5) return false;
  const o: KeyframeAnimationOptions = { duration: FOLD_MS, easing: FOLD_EASE, fill: 'none' };
  const add = (a: Animation) => { running.add(a); a.addEventListener('finish', () => running.delete(a)); a.addEventListener('cancel', () => running.delete(a)); };
  const face = box.querySelector<HTMLElement>(':scope > .vp-face');
  const k = faceFrom(before, after);
  if (face?.animate && Math.abs(k - 1) > 0.002) add(face.animate([{ transform: `scaleX(${k.toFixed(4)})` }, { transform: 'none' }], o));
  const c = seg.offsetWidth / 2;
  for (const [id, m] of plan) {
    const el = seg.querySelector<HTMLElement>(`:scope > button[data-view="${id}"]`);
    if (!el) continue;
    if (m.kind === 'out') {
      // a button that has gone is drawn once more where it was, and rides out with its neighbour
      const was = before.items.get(id)!, ghost = el.cloneNode(true) as HTMLElement;
      ghost.hidden = false; ghost.removeAttribute('id'); ghost.removeAttribute('data-view'); ghost.removeAttribute('title'); ghost.dataset.ghost = ''; ghost.dataset.ghostOf = id;
      ghost.setAttribute('aria-hidden', 'true'); ghost.setAttribute('aria-pressed', 'false'); ghost.tabIndex = -1;
      Object.assign(ghost.style, { position: 'absolute', top: '0', left: `${was.l + c}px`, width: `${was.w}px`, pointerEvents: 'none', margin: '0' });
      seg.append(ghost); running.add(ghost);
      const a = ghost.animate([{ transform: 'translateX(0)', opacity: 1 }, { transform: `translateX(${m.dx1.toFixed(1)}px)`, opacity: 0 }], o);
      a.addEventListener('finish', () => { ghost.remove(); running.delete(ghost); }); a.addEventListener('cancel', () => { ghost.remove(); running.delete(ghost); });
      continue;
    }
    if (m.kind === 'stay' && Math.abs(m.dx0) < 0.5) continue;
    add(el.animate([{ transform: `translateX(${m.dx0.toFixed(1)}px)`, opacity: m.o0 }, { transform: 'none', opacity: m.o1 }], o));
  }
  seg.classList.add('vp-fold');   // (the selection piece travels on the fold's clock and curve: app-11-deck-visuals.css)
  const end = () => { if (!running.size) seg.classList.remove('vp-fold'); };
  for (const x of running) if (!(x instanceof HTMLElement)) x.addEventListener('finish', end);
  setTimeout(end, FOLD_MS + 60);
  return true;
}
