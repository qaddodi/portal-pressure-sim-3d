// The Tests card's divider (2D dock.js, the divider's pointer and key handlers): on the right it is the card's width, on a sheet its height. Mouse, touch and keyboard; it changes the layout, never the
// simulation. A Mac and an iPad held sideways have one fixed width and no divider (owner, 6 Nov 2026: "a unified fixed width; i don't like we can make it bigger"); only a phone held sideways keeps
// its divider (width), and a sheet that is not over the thumb dock its height (hidden by the stylesheet over the thumb dock, where the sheet's own pull does it: pull.ts).
// Everything the drag needs is measured once as it begins. While it moves, a guide line follows the pointer by a transform alone, showing where the card's edge will be, and the card takes that
// size once, on release: no read of the page and no new layout of the card on any frame of the drag.
import { clamp } from '../copied/num.copied.js';
import { sidewaysWidth } from '../place.ts';

import { clock } from '../../../clock/frame.ts';
export interface DividerEnv {
  /** the card now: its box and whether it is on the right; the stage's size; the least a sheet leaves above it */
  side(): boolean;
  fixed(): boolean;
  card(): { x: number; y: number; w: number; h: number };
  stage(): { W: number; H: number; sheetMax: number };
  widthPx(): number | null;
  heightRatio(): number | null;
  set(o: { w?: number | null; h?: number | null }): void;
}

/** The sheet's height from a share of the stage (dock.js sheetHeight). */
export const sheetHeightOf = (H: number, max: number, ratio: number): number => Math.max(140, Math.min(max, Math.max(180, H * ratio)));
export const RATIO_MIN = 0.25, RATIO_MAX = 0.75, STEP = 40, RATIO_STEP = 0.05;

let guide: HTMLElement | null = null;
let layerT = 0;
function guideEl(): HTMLElement {
  if (!guide) { guide = document.createElement('div'); guide.className = 'dock-guide'; guide.setAttribute('aria-hidden', 'true'); }
  if (!guide.isConnected) document.body.append(guide);
  return guide;
}
/** Takes the guide line out of the page (the layer went). */
export function removeGuide(): void { clock.cancel(layerT); guide?.remove(); guide = null; }

/** Wires a divider element. Returns the remover. */
export function attachDivider(divider: HTMLElement, env: DividerEnv): () => void {
  let drag: { x: number; y: number; w: number; height: number; side: boolean; W: number; H: number; max: number; wNew: number | null; hNew: number | null; pid: number } | null = null;
  const onDown = (e: PointerEvent) => {
    if (e.button !== 0 || env.fixed()) return;
    const side = env.side(), { W, H, sheetMax } = env.stage(), c = env.card();
    drag = { x: e.clientX, y: e.clientY, w: c.w, height: c.h, side, W, H, max: sheetMax, wNew: null, hNew: null, pid: e.pointerId };
    const d = divider.getBoundingClientRect(), g = guideEl();
    g.classList.toggle('side', side);
    Object.assign(g.style, side
      ? { left: `${d.left + d.width / 2 - 1}px`, top: `${c.y}px`, width: '2px', height: `${c.h}px`, transform: '' }
      : { left: `${c.x}px`, top: `${d.top + d.height / 2 - 1}px`, width: `${c.w}px`, height: '2px', transform: '' });
    clock.cancel(layerT);
    g.classList.add('dg-live', 'on');
    divider.closest('.instrument-workspace')?.classList.add('resizing');
    try { divider.setPointerCapture(e.pointerId); } catch { /* the pointer is gone */ }
  };
  const onMove = (e: PointerEvent) => {
    if (!drag || !guide) return;
    if (drag.side) { drag.wNew = sidewaysWidth(drag.W, drag.w + drag.x - e.clientX); guide.style.transform = `translate3d(${Math.round(drag.w - drag.wNew)}px, 0, 0)`; }
    else { drag.hNew = clamp((drag.height + drag.y - e.clientY) / drag.H, RATIO_MIN, RATIO_MAX); guide.style.transform = `translate3d(0, ${Math.round(drag.height - sheetHeightOf(drag.H, drag.max, drag.hNew))}px, 0)`; }
  };
  const onUp = () => {
    const d = drag;
    if (!d) return;
    drag = null;
    guide?.classList.remove('on');
    clock.cancel(layerT); layerT = clock.after(() => guide?.classList.remove('dg-live'), 700);   // (the guide keeps its layer while it fades out)
    divider.closest('.instrument-workspace')?.classList.remove('resizing');
    if (d.side && d.wNew != null) env.set({ w: d.wNew });
    else if (!d.side && d.hNew != null) env.set({ h: d.hNew });
  };
  const onKey = (e: KeyboardEvent) => {
    const grow = e.key === 'ArrowUp' || e.key === 'ArrowLeft', shrink = e.key === 'ArrowDown' || e.key === 'ArrowRight';
    if ((!grow && !shrink && e.key !== 'Home' && e.key !== 'End') || env.fixed()) return;
    e.preventDefault();
    const { W, H } = env.stage(), c = env.card();
    if (env.side()) env.set({ w: sidewaysWidth(W, e.key === 'Home' ? 360 : e.key === 'End' ? W * 0.62 : c.w + (grow ? STEP : -STEP)) });
    else env.set({ h: e.key === 'Home' ? RATIO_MIN : e.key === 'End' ? RATIO_MAX : clamp((env.heightRatio() ?? c.h / H) + (grow ? RATIO_STEP : -RATIO_STEP), RATIO_MIN, RATIO_MAX) });
  };
  divider.addEventListener('pointerdown', onDown);
  divider.addEventListener('pointermove', onMove);
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) divider.addEventListener(ev, onUp);
  divider.addEventListener('keydown', onKey);
  return () => {
    divider.removeEventListener('pointerdown', onDown); divider.removeEventListener('pointermove', onMove);
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) divider.removeEventListener(ev, onUp);
    divider.removeEventListener('keydown', onKey);
    onUp(); removeGuide();
  };
}
