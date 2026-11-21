// A label's number rolling to its new value (400 ms, transform and opacity only).
import { MOTION } from '../../clock/tween.ts';

import { clock } from '../../clock/frame.ts';
/** A number that changes rolls: the old one goes up and out, the new one comes up from below (400 ms, transform and opacity).
 *  Until the two animations have started (a busy frame: a settings sheet or the Tests card opening can hold the first frame for seconds) only the old number is seen, never both
 *  stacked ("IVC 4.6" with a grey 4.5 behind it, Mac play-test, 19 Nov): the new one is held at opacity 0 by its own style until its animation takes over, and the old one is
 *  removed when its animation ends, is cancelled, or in any case a little after it should have ended. */
const rolls = new WeakMap<HTMLElement, number>();

/** A change smaller than this (mmHg) is a reading breathing round a rounding boundary (a beat-filtered pressure at 4.55 reads 4.5 then 4.6 then 4.5), not news: the text is swapped in place, as the 2D
 *  app does (refreshValues writes the new text where the old stood), and never rolls. A roll runs 400 ms, so a reading that flips every second or two would show its old number under its new one
 *  nearly all the time ("IVC 4.6" with a grey 4.5 behind it, Mac play-test, 19 and 20 Nov: on first load, while the model settles, and after a tilt). */
export const ROLL_MIN = 0.5;
const num = (t: string): number => (/^-?\d+(\.\d+)?$/.test(t) ? parseFloat(t) : NaN);
export const rollsFor = (next: string, was: string): boolean => Math.abs(num(next) - num(was)) >= ROLL_MIN;

/** Show a new number: a real change rolls, a flicker is swapped in place (and clears a roll that is still running, so no old number is left behind). */
export function showNumber(r: { cur?: HTMLElement }, next: string, was: string): void {
  if (rollsFor(next, was)) { roll(r, next, was); return; }
  const cur = r.cur!;
  rolls.set(cur, (rolls.get(cur) ?? 0) + 1);
  cur.parentElement?.querySelectorAll('.lb-old').forEach((e) => e.remove());
  cur.getAnimations?.().forEach((a) => a.cancel());
  cur.style.opacity = '';
  cur.textContent = next;
}

export function roll(r: { cur?: HTMLElement }, next: string, was: string): void {
  const cur = r.cur!;
  const mine = (rolls.get(cur) ?? 0) + 1;
  rolls.set(cur, mine);
  const box = cur.parentElement!;
  box.querySelectorAll('.lb-old').forEach((e) => e.remove());
  const old = document.createElement('span');
  old.className = 'lb-old'; old.textContent = was;
  box.appendChild(old);
  cur.textContent = next;
  cur.style.opacity = '0';
  const ease = 'cubic-bezier(.2, .8, .2, 1)';
  const out = old.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-0.55em)' }], { duration: MOTION.rollMs, easing: ease, fill: 'both' });
  const inn = cur.animate([{ opacity: 0, transform: 'translateY(0.55em)' }, { opacity: 1, transform: 'none' }], { duration: MOTION.rollMs, easing: ease, fill: 'both' });
  const doneOut = () => old.remove();
  const doneIn = () => { if (rolls.get(cur) === mine) cur.style.opacity = ''; };   // (a newer roll on this number holds its own)
  out.onfinish = doneOut; out.oncancel = doneOut;
  inn.onfinish = () => { doneIn(); inn.cancel(); }; inn.oncancel = doneIn;
  clock.after(() => { doneOut(); doneIn(); }, MOTION.rollMs * 4);
}

