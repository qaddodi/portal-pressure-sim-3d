// The one flick (the 2D app's flick.js, same numbers): a pan let go at speed glides on and slows; carried past the figure's edge it is braked hard, the
// overshoot shows only as a short tanh stretch, and it returns to the edge within a few frames. Positions are canvas pixels, velocities pixels per ms.
export const FLICK = { decay: 0.9955, brake: 0.5, overshoot: 0.78, band: 36, minSpeed: 0.25, stop: 0.03 };

export interface FlickOptions {
  x: number; y: number; vx: number; vy: number;
  /** The nearest resting place [x, y] (the view's bounds). */
  hard(x: number, y: number): [number, number];
  apply(x: number, y: number): void;
  done?(): void;
  ask(cb: (now: number) => void): number;
  cancel(id: number): void;
  now(): number;
}

export function runFlick({ x, y, vx, vy, hard, apply, done, ask, cancel, now }: FlickOptions): () => void {
  let raf = 0, last = now(), rx = x, ry = y;
  const L = FLICK.band;
  const step = (t: number) => {
    raf = 0;
    const dt = Math.min(34, t - last), decay = Math.pow(FLICK.decay, dt), f16 = dt / 16;
    last = t; vx *= decay; vy *= decay;
    rx += vx * dt; ry += vy * dt;
    const [cx, cy] = hard(rx, ry);
    let ox = rx - cx, oy = ry - cy;
    if (ox) { vx *= Math.pow(FLICK.brake, f16); ox *= Math.pow(FLICK.overshoot, f16); rx = cx + ox; }
    if (oy) { vy *= Math.pow(FLICK.brake, f16); oy *= Math.pow(FLICK.overshoot, f16); ry = cy + oy; }
    apply(cx + (ox ? L * Math.tanh(ox / L) : 0), cy + (oy ? L * Math.tanh(oy / L) : 0));
    if (Math.hypot(vx, vy) > FLICK.stop || Math.abs(ox) > 0.5 || Math.abs(oy) > 0.5) raf = ask(step);
    else { apply(cx, cy); done?.(); }
  };
  raf = ask(step);
  return () => { if (raf) cancel(raf); raf = 0; };
}
