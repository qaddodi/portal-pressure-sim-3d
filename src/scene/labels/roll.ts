// A label's number rolling to its new value (400 ms, transform and opacity only).
import { MOTION } from '../../clock/tween.ts';

import { clock } from '../../clock/frame.ts';
import { D_SMALL, EASE_ARRIVE } from '../../ui/motion.ts';
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
  const ease = EASE_ARRIVE;
  const out = old.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-0.55em)' }], { duration: MOTION.rollMs, easing: ease, fill: 'both' });
  const inn = cur.animate([{ opacity: 0, transform: 'translateY(0.55em)' }, { opacity: 1, transform: 'none' }], { duration: MOTION.rollMs, easing: ease, fill: 'both' });
  const doneOut = () => old.remove();
  const doneIn = () => { if (rolls.get(cur) === mine) cur.style.opacity = ''; };   // (a newer roll on this number holds its own)
  out.onfinish = doneOut; out.oncancel = doneOut;
  inn.onfinish = () => { doneIn(); inn.cancel(); }; inn.oncancel = doneIn;
  clock.after(() => { doneOut(); doneIn(); }, MOTION.rollMs * 4);
}


/** A part of a label comes in from nothing to its own opacity, linear, over `ms`: the keyframe is the START (`offset: 0`), and the end is the part's own opacity as the page
 *  has it every frame (the browser fills in the keyframe missing at 1 from the element itself). A lone keyframe with no offset is the END of an animation:
 *  `animate([{ opacity: 0 }])` runs from the part's opacity DOWN to 0 and snaps back when it ends, so the words that were meant to come in dimmed out instead,
 *  for as long as the crossing ran (the flicker of every callout that was given its words as it came in). One place, so no crossing is written the wrong way round. */
export function comeIn(k: Element, ms: number): Animation {
  return k.animate([{ opacity: 0, offset: 0 }], { duration: ms, easing: 'linear', fill: 'backwards' });
}

/** When the crossing running on a label ends (clock ms): one crossing at a time per label (restyle). */
const crossing = new WeakMap<Element, number>();

/** A label showing at least this much is crossed over when its look changes; one fainter takes the change at once (nobody can see it). */
export const RESTYLE_SHOWING = 0.05;

/** A standing label whose tone, tint, weight, words, number or unit changes while it is on screen: the change is crossed over, never stepped (Mohammad: "everything eases, nothing pops").
 *  A colour transition would repaint; this keeps everything on the compositor, opacity only, the way `roll` does for a number: before `apply` writes the change, the label is cloned as `.lb-was`
 *  (its old look, its old words) and put beside it; `apply` then writes the live one; the clone fades 1 to 0 and each part of the live label whose words changed fades 0 to 1, linear, over D_SMALL,
 *  so the two weights sum to 1 the whole way. A part whose words are the same (a colour change only) is not faded, so it never dips: the old colour fades off the new one.
 *  `alpha` is how much of the label is ON THE SCREEN now: what its owner painted last, never the opacity it is about to write this frame. A label that is only now coming in
 *  is not showing: its first frame already has an opacity of 0.1 or more, and judged by that a card handed its words for the first time (or other words than it last stood
 *  with, while it was hidden) was crossed over from them, the old words and the new fighting through the whole of its arrival: it "flickered, then appeared"
 *  (Mohammad, 27 Nov: the FHVP and WHVP cards, the sinusoid and WHVP callouts). At or under RESTYLE_SHOWING (hidden, or just coming in) `apply` is simply run, and no clone is made.
 *  An element with parts (a label, a card) fades its parts and leaves its own opacity to its owner (a card's glass must never sit under a fading ancestor); one with none (a leader, a ring) fades itself. */
export function restyle(el: Element, apply: () => void, alpha: number): void {
  const parent = el.parentElement;
  if (!(alpha > RESTYLE_SHOWING) || !parent || typeof el.animate !== 'function' || typeof el.cloneNode !== 'function') { apply(); return; }
  const kids = Array.from(el.children) as HTMLElement[];
  const before = kids.map((k) => k.textContent);
  // A crossing already runs on this label (an earlier change, under D_SMALL ago): the new change is written into the live label and rides that crossing, which fades the one old copy out
  // and the live words in. A second copy started now would begin again at full opacity beside the first, once per change, and a reading that changes every few frames (the EUS-PPG's PV and HV
  // while the needle reads) pulsed instead of easing (Mohammad, 22 Nov: "the callout flickers as it's measuring"). A part whose words change now and is not already fading in does so for the time left.
  // (`comeIn`: the part's own opacity is the way it ends, whatever that does meanwhile.)
  const run = crossing.get(el), at = clock.now();
  if (run && at < run) {
    apply();
    const left = run - at;
    kids.forEach((k, i) => { if (k.textContent !== before[i] && !(k.getAnimations?.().length)) comeIn(k, left); });
    return;
  }
  crossing.set(el, at + D_SMALL);
  const old = el.cloneNode(true) as HTMLElement;
  old.setAttribute('class', `${el.getAttribute('class') ?? ''} lb-was`);
  old.setAttribute('aria-hidden', 'true');
  parent.insertBefore(old, el);
  apply();
  const opts = { duration: D_SMALL, easing: 'linear', fill: 'both' } as const;
  const oldParts = Array.from(old.children) as HTMLElement[];
  const parts = oldParts.length ? oldParts : [old];
  const anims: Animation[] = [];
  for (const part of parts) {
    const o = parseFloat(part.style.opacity), from = Number.isFinite(o) ? o : 1;   // (inline opacity, '' when it has none)
    anims.push(part.animate([{ opacity: from }, { opacity: 0 }], opts));
  }
  // (a part of the live label whose words changed comes in as the old ones leave; it ends where its own opacity stands, however that moves meanwhile)
  kids.forEach((k, i) => { if (k.textContent !== before[i]) anims.push(comeIn(k, D_SMALL)); });
  let done = false;
  const finish = () => { if (done) return; done = true; old.remove(); };
  anims[0]!.onfinish = finish; anims[0]!.oncancel = finish;
  clock.after(finish, D_SMALL * 4);
}

/** Write a label's colour (the slide's tone, 2D .lb.term) onto one of its pieces. Only for a picture whose look LabelFader crosses over (its tone is in the fader's key, so the old picture keeps the old
 *  colour and this one is written while it is still at zero); a piece the fader does not cross (a station's ring) goes through `restyle`. */
export function writeTone(x: HTMLElement, tone: string): void {
  if (tone) { x.style.setProperty('--lb-tone', tone); x.setAttribute('data-tone', ''); } else { x.style.removeProperty('--lb-tone'); x.removeAttribute('data-tone'); }
}
/** The same for the velocity lens's tint and the Doppler gate's weight. */
export function writeTint(x: HTMLElement, tint: string, gate: boolean): void {
  if (tint) { x.style.setProperty('--lb-vtint', tint); x.setAttribute('data-tint', ''); } else { x.style.removeProperty('--lb-vtint'); x.removeAttribute('data-tint'); }
  if (gate) x.setAttribute('data-gate', ''); else x.removeAttribute('data-gate');
}
