import { clock } from '../../clock/frame.ts';
// The laser pointer of a talk (2D ink-gl.js: L switches it on and off; on an iPad, press and hold on the figure). In 2D it is a spotlight: the figure is as it is inside a window round
// the pointer and steps back under a veil of the stage's own colour outside it ("keep the figure lit as normal, and dim everything not laser", owner, 5 Nov), with a faint thin ring at
// the window's edge in the pen's colour; no dot and no glow; the mouse arrow is hidden while it is on. It stays on from slide to slide (2D clears only the pen's strokes on a new slide)
// and goes with the talk, with the window losing focus, and under the black screen.
// Here the veil is five plates under the cards: a square the size of the window with the soft edge painted in it once, and four plain plates of the veil's colour that fill the screen
// round it. A move writes `transform` only (the square is carried, the four are stretched), so nothing is painted again while the pointer moves; the fade is the group's `opacity`.
// The window is the 2D one: R = min(W, H) x 0.09 between 50 and 100 px, soft from 0.8 R to 1.55 R. (Its stylesheet, laser.css, is imported where the talk's keys are: useDeckInput.ts.)

/** 2D ink-gl.js: the press-and-hold time of a finger, how far it may wander, the veil's strength, and how long the click a lifted hold leaves is swallowed. */
export const HOLD_MS = 500, HOLD_SLOP = 10, VEIL = 0.62, EAT_MS = 600;
export const radius = (w: number, h: number): number => Math.max(50, Math.min(100, Math.min(w, h) * 0.09));
/** Half the side of the window's square: from 1.55 R out the veil is whole (a whole number of px, so the plates meet on pixel edges and no seam shows). */
export const halfOf = (R: number): number => Math.round(1.55 * R);

export interface Plates { hole: string; top: string; bottom: string; left: string; right: string }
/** Where the five plates go for a pointer at (x, y) on a w by h screen: the square is carried there; the four 1 px plates are stretched over what is left of the screen, never overlapping. */
export function platesAt(x: number, y: number, w: number, h: number, R: number): Plates {
  const k = halfOf(R), cx = Math.round(x), cy = Math.round(y);
  const cl = (v: number, hi: number) => Math.max(0, Math.min(hi, v));
  const x0 = cl(cx - k, w), x1 = cl(cx + k, w), y0 = cl(cy - k, h), y1 = cl(cy + k, h);
  const box = (l: number, t: number, r: number, b: number) => `translate(${l}px, ${t}px) scale(${r - l}, ${b - t})`;
  return { hole: `translate(${cx - k}px, ${cy - k}px)`, top: box(0, 0, w, y0), bottom: box(0, y1, w, h), left: box(0, y0, x0, y1), right: box(x1, y0, w, y1) };
}

/** Whether a press is on the figure (2D offFig): not on a card, the pill, a list or any control, so a held button never becomes the laser and never loses its click. */
export const onFigure = (t: { closest?(sel: string): unknown } | null): boolean =>
  !!t?.closest && !t.closest('.deck-ui, .dk-jump, .dk-black, button, a[href], input, select, textarea, [role="dialog"], [role="menu"]') && !!t.closest('canvas, #stageView, #stageWrap');

export interface Laser { toggle(): boolean; set(on: boolean): void; readonly on: boolean; dispose(): void }
export interface LaserOptions { /** the talk can show it now (2D active(): not under the black screen) */ active?(): boolean }

export function createLaser(o: LaserOptions = {}, doc: Document = document, win: Window = window): Laser {
  let on = false, x = 0, y = 0, has = false, hold = 0, holdId = -1, hx = 0, hy = 0, touchSpot = false, eat = 0, R = 0, W = 0, H = 0;
  const active = () => o.active?.() ?? true;
  const touches = new Set<number>();
  const mk = (cls: string) => { const e = doc.createElement('i'); e.className = cls; return e; };
  const group = doc.createElement('div'), hole = mk('laser-hole'), top = mk('laser-plate'), bottom = mk('laser-plate'), left = mk('laser-plate'), right = mk('laser-plate');
  group.className = 'laser'; group.setAttribute('aria-hidden', 'true');
  group.append(hole, top, bottom, left, right);
  doc.body.append(group);
  // the window's size: when the laser comes on and when the screen changes, never while it moves
  const size = () => {
    W = win.innerWidth; H = win.innerHeight; R = radius(W, H);
    const k = halfOf(R);
    hole.style.width = hole.style.height = `${2 * k}px`;
    hole.style.setProperty('--r', `${R}px`);
  };
  const place = () => {
    const p = platesAt(x, y, W, H, R);
    hole.style.transform = p.hole; top.style.transform = p.top; bottom.style.transform = p.bottom; left.style.transform = p.left; right.style.transform = p.right;
  };
  const set = (v: boolean) => {
    v = v && active();
    if (on === v) return;
    on = v;
    doc.documentElement.style.cursor = v ? 'none' : '';   // (the laser is the pointer: the mouse arrow is hidden while it is on)
    if (v) { size(); if (!has) { x = W / 2; y = H / 2; has = true; } place(); }
    group.style.opacity = v ? '1' : '0';
  };
  const onMove = (e: PointerEvent) => {
    if (hold && e.pointerId === holdId && Math.hypot(e.clientX - hx, e.clientY - hy) > HOLD_SLOP) { clock.cancel(hold); hold = 0; }
    if (e.pointerType === 'mouse' || touchSpot) { x = e.clientX; y = e.clientY; has = true; if (on) place(); }
    if (touchSpot) { if (e.cancelable) e.preventDefault(); e.stopImmediatePropagation(); }   // (the finger that holds the laser moves the laser, not the figure)
  };
  const onDown = (e: PointerEvent) => {
    if (e.pointerType !== 'touch') return;
    if (e.isPrimary) touches.clear();
    touches.add(e.pointerId);
    clock.cancel(hold); hold = 0;
    if (touches.size > 1) return;   // (a pinch or a two-finger pan: no laser)
    if (!active() || !onFigure(e.target as Element | null)) return;
    holdId = e.pointerId; hx = e.clientX; hy = e.clientY;
    hold = win.setTimeout(() => { hold = 0; if (!active()) return; touchSpot = true; x = hx; y = hy; has = true; if (on) place(); else set(true); }, HOLD_MS);
  };
  const onUp = (e: PointerEvent) => {
    if (e.pointerType === 'touch') touches.delete(e.pointerId);
    if (hold && e.pointerId === holdId) { clock.cancel(hold); hold = 0; }
    if (touchSpot && e.pointerId === holdId) { touchSpot = false; set(false); eat = clock.now() + EAT_MS; }   // (the click a lifted hold can leave must not also open a label)
  };
  const onTouch = (e: TouchEvent) => { if (touchSpot) { if (e.cancelable) e.preventDefault(); e.stopImmediatePropagation(); } };
  const onMenu = (e: Event) => { if (touchSpot || hold) e.preventDefault(); };   // (an iPad's own press-and-hold menu)
  const onClick = (e: MouseEvent) => { if (eat && clock.now() < eat) { e.preventDefault(); e.stopImmediatePropagation(); } };
  // (only the window's own blur: a button or a field losing focus reaches a capture listener on the window too)
  const onBlur = (e: Event) => { if (e.target !== win) return; touches.clear(); clock.cancel(hold); hold = 0; touchSpot = false; set(false); };
  const onSize = () => { if (on) { size(); place(); } };
  const opts = { capture: true, passive: false } as const;
  const L: [string, EventListener][] = [['pointermove', onMove as EventListener], ['pointerdown', onDown as EventListener], ['pointerup', onUp as EventListener], ['pointercancel', onUp as EventListener],
    ['touchstart', onTouch as EventListener], ['touchmove', onTouch as EventListener], ['contextmenu', onMenu], ['click', onClick as EventListener], ['blur', onBlur]];
  for (const [t, f] of L) win.addEventListener(t, f, opts);
  win.addEventListener('resize', onSize);
  return {
    /** L: on if off, off if on (off only, where the talk cannot show it). */
    toggle() { set(!on); return on; },
    set,
    get on() { return on; },
    dispose() { set(false); on = false; doc.documentElement.style.cursor = ''; clock.cancel(hold); for (const [t, f] of L) win.removeEventListener(t, f, opts); win.removeEventListener('resize', onSize); group.remove(); },
  };
}
