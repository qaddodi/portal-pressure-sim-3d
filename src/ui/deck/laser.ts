// The laser pointer of a talk (2D ink-gl.js: L switches it on and off; on an iPad, press and hold). In 2D it is a spotlight: the figure is as it is inside a window round the pointer
// and steps back under a veil of the stage's own colour outside it ("keep the figure lit as normal, and dim everything not laser", owner, 5 Nov), with a faint thin ring at the window's
// edge in the pen's colour; no dot and no glow; the mouse arrow is hidden while it is on. Here the veil is one fixed gradient square that is moved by `transform` and shown by
// `opacity` (the page's per-frame rule), so the pointer moving writes nothing but a transform. The window is the 2D one: R = min(W, H) x 0.09 between 50 and 100 px, soft from 0.8 R to 1.55 R.
// (its stylesheet, laser.css, is imported where the talk's keys are: useDeckInput.ts)

/** 2D ink-gl.js: the press-and-hold time of a finger, how far it may wander, the veil's strength and the window's size. */
export const HOLD_MS = 500, HOLD_SLOP = 10, VEIL = 0.62;
export const radius = (w: number, h: number): number => Math.max(50, Math.min(100, Math.min(w, h) * 0.09));

export interface Laser { toggle(): boolean; set(on: boolean): void; readonly on: boolean; dispose(): void }

export function createLaser(doc: Document = document, win: Window = window): Laser {
  let on = false, x = 0, y = 0, has = false, hold = 0, holdId = -1, hx = 0, hy = 0, touchSpot = false, eat = 0;
  const touches = new Set<number>();
  const veil = doc.createElement('div'), ring = doc.createElement('div');
  veil.className = 'laser-veil'; ring.className = 'laser-ring';
  veil.setAttribute('aria-hidden', 'true'); ring.setAttribute('aria-hidden', 'true');
  doc.body.append(veil, ring);
  const size = () => {
    const R = radius(win.innerWidth, win.innerHeight), S = 2 * Math.max(win.innerWidth, win.innerHeight) + 4 * R;
    veil.style.width = veil.style.height = `${S}px`;
    veil.style.setProperty('--r', `${R}px`);
    ring.style.width = ring.style.height = `${1.6 * R}px`;
    return { R, S };
  };
  const place = () => {
    const { R, S } = size();
    veil.style.transform = `translate(${x - S / 2}px, ${y - S / 2}px)`;
    ring.style.transform = `translate(${x - 0.8 * R}px, ${y - 0.8 * R}px)`;
  };
  const set = (v: boolean) => {
    if (on === v) return;
    on = v;
    doc.documentElement.style.cursor = v ? 'none' : '';   // (the laser is the pointer: the mouse arrow is hidden while it is on)
    if (v) { if (!has) { x = win.innerWidth / 2; y = win.innerHeight / 2; has = true; } place(); }
    veil.style.opacity = ring.style.opacity = v ? '1' : '0';
  };
  const onMove = (e: PointerEvent) => {
    if (hold && e.pointerId === holdId && Math.hypot(e.clientX - hx, e.clientY - hy) > HOLD_SLOP) { clearTimeout(hold); hold = 0; }
    if (e.pointerType === 'mouse' || touchSpot) { x = e.clientX; y = e.clientY; has = true; if (on) place(); }
  };
  const onDown = (e: PointerEvent) => {
    if (e.pointerType !== 'touch') return;
    if (e.isPrimary) touches.clear();
    touches.add(e.pointerId);
    if (touches.size > 1) { clearTimeout(hold); hold = 0; return; }   // (a pinch or a two-finger pan: no laser)
    clearTimeout(hold); holdId = e.pointerId; hx = e.clientX; hy = e.clientY;
    hold = win.setTimeout(() => { hold = 0; touchSpot = true; x = hx; y = hy; has = true; set(true); }, HOLD_MS);
  };
  const onUp = (e: PointerEvent) => {
    if (e.pointerType === 'touch') touches.delete(e.pointerId);
    if (hold && e.pointerId === holdId) { clearTimeout(hold); hold = 0; }
    if (touchSpot && e.pointerId === holdId) { touchSpot = false; set(false); eat = performance.now() + 600; }   // (the click a lifted hold can leave must not also open a label)
  };
  const onTouch = (e: TouchEvent) => { if (touchSpot && e.cancelable) e.preventDefault(); };
  const onClick = (e: MouseEvent) => { if (eat && performance.now() < eat) { e.preventDefault(); e.stopImmediatePropagation(); } };
  const onBlur = (e: Event) => { if (e.target !== win) return; touches.clear(); clearTimeout(hold); hold = 0; touchSpot = false; set(false); };
  const opts = { capture: true, passive: false } as const;
  const L: [string, EventListener][] = [['pointermove', onMove as EventListener], ['pointerdown', onDown as EventListener], ['pointerup', onUp as EventListener], ['pointercancel', onUp as EventListener],
    ['touchmove', onTouch as EventListener], ['click', onClick as EventListener], ['blur', onBlur]];
  for (const [t, f] of L) win.addEventListener(t, f, opts);
  win.addEventListener('resize', () => { if (on) place(); });
  return {
    toggle() { set(!on); return on; },
    set,
    get on() { return on; },
    dispose() { set(false); clearTimeout(hold); for (const [t, f] of L) win.removeEventListener(t, f, opts); veil.remove(); ring.remove(); },
  };
}
