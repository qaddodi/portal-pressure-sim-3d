// A Mac trackpad's two-finger sideways swipe works the slide as a finger does (2D presenter.js, "A trackpad or wheel on a Mac", ported). One slide a gesture: a gesture is a run of wheel
// events with no more than WHEEL_QUIET ms between them, the glide after the fingers lift included, and once it has moved a slide it is spent, so momentum never skips a second one.
// Only a sideways gesture is taken (its events are cancelled, so the browser's own back/forward swipe and the figure's pan stay out of the talk); anything up or down is left to the cards' own scroll.
export const WHEEL_X = 80;      // px of fingers moving sideways before it moves a slide
export const WHEEL_QUIET = 250; // ms without a wheel event ends a gesture

export interface WheelG { x: number; y: number; lock: '' | 'x' | 'y'; spent: boolean; dir: number; back: number; t: number }

/** One wheel event's movement as the fingers' (right positive): Safari says whether the delta is inverted by natural scrolling. */
export function wheelFinger(dx: number, dy: number, mode = 0, inverted = true, page = 800): [number, number] {
  const m = mode === 1 ? 16 : mode === 2 ? page : 1, sg = inverted === false ? 1 : -1;
  return [sg * dx * m, sg * dy * m];
}

/** Takes the finger movement at time `now`; gives the gesture so far and the move it made, if any (null while undecided, vertical or spent): -1 fingers left (next), +1 fingers right (back). */
export function wheelGesture(g: WheelG | null, fx: number, fy: number, now: number): { g: WheelG; dir: 1 | -1 | null } {
  const s: WheelG = g && now - g.t <= WHEEL_QUIET ? g : { x: 0, y: 0, lock: '', spent: false, dir: 0, back: 0, t: now };
  s.t = Math.max(s.t, now);
  if (!Number.isFinite(fx) || !Number.isFinite(fy)) return { g: s, dir: null };
  if (s.spent) {
    // the glide after a move never acts again, however it jitters: only an unbroken run of movement the other way, as far as a fresh gesture needs, is the fingers' own
    if (s.lock === 'x' && fx !== 0) s.back = Math.sign(fx) === -s.dir ? s.back + Math.abs(fx) : 0;
    if (s.lock !== 'x' || s.back < WHEEL_X) return { g: s, dir: null };
    s.dir = -s.dir; s.back = 0;
    return { g: s, dir: s.dir as 1 | -1 };
  }
  s.x += fx; s.y += fy;
  const ax = Math.abs(s.x), ay = Math.abs(s.y);
  if (!s.lock && ax + ay >= 10) s.lock = ax > 1.5 * ay ? 'x' : ay > 1.5 * ax ? 'y' : ax + ay >= 80 ? (ax >= ay ? 'x' : 'y') : '';
  if (s.lock === 'x' && ax >= WHEEL_X) { s.spent = true; s.dir = Math.sign(s.x); return { g: s, dir: s.dir as 1 | -1 }; }
  return { g: s, dir: null };
}

/** Whether this event is the talk's to cancel: a sideways gesture (decided, or still undecided and leaning sideways). A vertical one is left alone. */
export const sidewaysGesture = (g: WheelG, fx: number, fy: number): boolean => g.lock === 'x' || (!g.lock && Math.abs(fx) >= Math.abs(fy));
