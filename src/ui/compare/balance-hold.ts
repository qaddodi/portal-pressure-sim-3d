import { clock } from '../../clock/frame.ts';
// The daily balance a live readout shows (2D balance-hold.js, pure part). The model's rate swings with every breath and beat, so: average it over about 6 s of screen time, keep the
// shown hundred until the average is 100 mL/day past it, and change the shown value at most once every 1.5 s. step(raw, now) returns the value to show, or null when it stays.
export function balanceHold({ tau = 6000, band = 100, hold = 1500 } = {}) {
  let avg: number | null = null, t = 0, shown: number | null = null, next = -Infinity;
  return {
    step(raw: number, now: number): number | null {
      if (!Number.isFinite(raw)) raw = 0;
      avg = avg == null ? raw : avg + (raw - avg) * (1 - Math.exp(-Math.min(Math.max(now - t, 0), 2000) / tau));
      t = now;
      if (shown != null && (Math.abs(avg - shown) <= band || now < next)) return null;
      const b = Math.round(avg / 100) * 100 || 0;
      if (b === shown) return null;
      shown = b; next = now + hold;
      return b;
    },
    get shown(): number | null { return shown; },
  };
}
const live = balanceHold();
/** One shared hold for the live patient's ascites rate outside the belly (the Compare table's "now" column). */
export function liveBalance(raw: number, now = clock.now()): number { live.step(raw, now); return live.shown ?? Math.round(raw / 100) * 100; }
