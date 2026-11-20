// A label's number rolling to its new value (400 ms, transform and opacity only).
import { MOTION } from '../../clock/tween.ts';

/** A number that changes rolls: the old one goes up and out, the new one comes up from below (400 ms, transform and opacity).
 *  Until the two animations have started (a busy frame: a settings sheet or the Tests card opening can hold the first frame for seconds) only the old number is seen, never both
 *  stacked ("IVC 4.6" with a grey 4.5 behind it, Mac play-test, 19 Nov): the new one is held at opacity 0 by its own style until its animation takes over, and the old one is
 *  removed when its animation ends, is cancelled, or in any case a little after it should have ended. */
const rolls = new WeakMap<HTMLElement, number>();
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
  const ease = 'cubic-bezier(.2, .7, .2, 1)';
  const out = old.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-0.55em)' }], { duration: MOTION.rollMs, easing: ease, fill: 'both' });
  const inn = cur.animate([{ opacity: 0, transform: 'translateY(0.55em)' }, { opacity: 1, transform: 'none' }], { duration: MOTION.rollMs, easing: ease, fill: 'both' });
  const doneOut = () => old.remove();
  const doneIn = () => { if (rolls.get(cur) === mine) cur.style.opacity = ''; };   // (a newer roll on this number holds its own)
  out.onfinish = doneOut; out.oncancel = doneOut;
  inn.onfinish = () => { doneIn(); inn.cancel(); }; inn.oncancel = doneIn;
  setTimeout(() => { doneOut(); doneIn(); }, MOTION.rollMs * 4);
}

