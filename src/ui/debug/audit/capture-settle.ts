// The capture's shared settling and drawing helpers, used by the slide pass (capture-all.ts) and the case pass (capture-cases.ts): waiting until the page is still (the camera, the clock's motion, the cards,
// the charts, the callouts, the readings printed on them), and the contact sheet. One definition of "still", so a case's stop is judged by exactly the rules a slide is.
import { readBox, readStyle } from '../../layout-snap.ts';
import { cel } from '../../../scene/api.ts';
import { BLOCKED_SAYS } from '../../../scene/labels/cath-show.ts';
import { clock } from '../../../clock/frame.ts';
import { latest } from '../../../engine/index.ts';
import { figureWaiting } from '../../deck/figure-pending.ts';
import { pressWaiting, pressWhat } from '../../talk/press-pending.ts';
import { beatCardWaiting } from '../../tests/slide/beat-agree.ts';
import { menuWaiting } from '../../charts/menu/MenuCard.tsx';
import { READING_ROOTS, READING_SKIP, readingsOf, readingWatch } from './capture-still.ts';
import { evRunPending } from '../../charts/evgraph/live.ts';
import { speedAnimations, sampleRealMs, skipAnimations, finishAnimations } from './speed.ts';
import { settleLimitMs, collageLayout, slidesWord, sheetHeaderLines } from '../../capture/capture-model.ts';

export const sleep = (ms: number) => new Promise<void>((ok) => clock.after(ok, ms));
export const until = async (cond: () => boolean, ms: number) => { const t = clock.now(); while (!cond() && clock.now() - t < ms) await sleep(50); };
export const pad2 = (n: number) => String(n).padStart(2, '0');
export const blobOf = (c: HTMLCanvasElement, type: string, q?: number) => new Promise<Blob | null>((ok) => c.toBlob(ok, type, q));
export const bytesOf = async (b: Blob) => new Uint8Array(await b.arrayBuffer());
/** A Doppler strip says "—" for its speed while its canvas still reads "Acquiring…" (about 3 s of page time; a slide with no flow may say it for good). */
/** The instruments that draw a strip across time (a trace, the vital signs, a Doppler): their holds, and how many frames a strip needs to fill (about 3 s of the page at the clock's own pace). */
const LIVE = new Set(['vitals', 'trace', 'doppler', 'endo-scope', 'eus-ppg', 'ir']);
const STRIP_FRAMES = 45;
function dopplerAcquiring(): boolean {
  const dv = document.querySelector('.instrument-view.dop .dop-vel');
  return !!dv && !!dv.textContent?.includes('—') && Number(readStyle(dv).opacity) > 0.5 && !dv.closest('[data-out="true"]') && readBox(dv).width > 0;
}
/** What is still arriving on the screen, in words (empty when nothing is): the camera in flight, a card leaving, fonts loading, or a card, label or bar still easing in. Only arrivals count: a CSS animation of more than two and a
 *  half seconds (a toast's timer rule, a loop of many turns) or one on anything but the cards, the labels and the bars is a perpetual motion, not a slide settling, and is left out. The audit's own check (page/live.ts busyWhy)
 *  counts every running animation, which kept this waiting five seconds on a slide that had been still for a moment. */
/** What a wait that is about the slide's own state says (figure, pressure strip, treatment menu): the capture keeps waiting for these, and flags a picture taken without them. */
export const STATE_WAIT = /has not reached the slide|has not caught up with the slide|has not worked out its dots|press has not reached the slide/;
// (the instrument cards are in it: the Abdomen's belly slides up inside its ring on a CSS transition, which the list once left out)
export const CONTENT = `${READING_ROOTS}, .dk-bar, .topbar, .stage-credit, .zoom-pill`;
/** What the cards, tiles and callouts print now, as one string (outermost roots only: a card inside a card is read once). */
export const readingsNow = (): string => readingsOf([...document.querySelectorAll<HTMLElement>(READING_ROOTS)].filter((e) => !e.parentElement?.closest(READING_ROOTS) && !e.closest(READING_SKIP)));
/** What "a card is up" means for the pass that waits: a talk's card by default (a case's stop card for the case pass). */
export interface SettleKit { cardUp(): boolean; /** a reason it is not yet still that only this pass knows (empty when still) */ extra?(): string }
export const deckKit: SettleKit = { cardUp: () => !!document.querySelector('.dk-card[data-phase="in"], .dk-plate[data-phase="in"]') };
export function arriving(clockToo = true, stripsToo = true, frames = 99, kit: SettleKit = deckKit): string {
  try {
    // (a chip, a toggle or a slider answers after its click: the engine works the patient out, the charts then read it, the figure then eases to it. Until it has, the page is showing the
    // slide before the press: capture 36b7deac, Sites and causes 10, five chips and one chart)
    if (pressWaiting()) return `a control's press has not reached the slide yet (${pressWhat()})`;
    if (cel.rig.isMoving) return 'the camera is moving';
    if (clockToo && clock.moving > 0) return `moving: ${clock.movingTags().join(', ')}`;   // (a glide, a tween, a card sliding, the labels placing: the clock's own list of what is in motion; the steady instruments, a live trace, are not in it)
    if (clockToo && latest.frame?.morphing) return 'the model is morphing';   // (a procedure's change runs in the engine for seconds of its own time: a paracentesis slide's litres read 5.9 on every step until it ended, Ascites 13, build 572259fd)
    if (document.querySelector('.dk-card[data-phase="out"], .dk-plate[data-phase="out"]')) return 'a card is leaving';
    if (document.fonts && document.fonts.status === 'loading') return 'fonts are loading';
    if ([...document.querySelectorAll('.dk-card .dk-roll-in, .dk-card .dk-roll-now')].some((e) => (e.textContent ?? '').trim() === '…')) return 'a reading on a card is still "…" (its number has not arrived)';   // (the line's blank gap, TIPS follow-up 5 "her PPG is …", build e4810ea9)
    if (clock.stats().holds.includes('chart:evgraph') || evRunPending()) return 'the procedure graph is still drawing to its end';   // (the card says the slide's end value while the plot's head is still on its way: Gastric varices 7, 19.4 against 18.1)
    if (menuWaiting()) return 'the treatment menu has not worked out its dots yet';
    if (beatCardWaiting()) return 'the pressure strip has not caught up with the slide\'s numbers (its history is still coming, or the model is still easing to the slide)';
    if (figureWaiting()) return 'the figure has not reached the slide\'s state yet (its labels would print the slide before\'s patient)';
    if (document.querySelector('.sh-waitcue')) return 'a "Preparing…" cue is up (the lobule, a pane or a dive is still being made)';
    if (stripsToo) {
      if (dopplerAcquiring()) return 'the Doppler is acquiring';
      if (!kit.cardUp()) return 'no card is up yet';
      if (frames < STRIP_FRAMES && clock.stats().holds.some((t) => LIVE.has(t))) return 'a live strip is still filling';
    }
    for (const a of document.getAnimations()) {
      if (a.playState !== 'running' || !(a.effect instanceof KeyframeEffect)) continue;
      if (!Number.isFinite(a.effect.getTiming().iterations) || Number(a.effect.getComputedTiming().endTime) > 2500) continue;
      const el = a.effect.target;
      if (!el?.closest?.(CONTENT) || el.closest('[data-debug], [data-capture-skip], .sh-toast')) continue;
      return `${(a as CSSAnimation).animationName ?? (a as CSSTransition).transitionProperty ?? 'an animation'} is running on ${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)}`;
    }
  } catch { /* a page that will not say: taken as still */ }
  return '';
}
/** Waits until nothing is arriving for a moment (a few real frames), at most five seconds; returns what was still moving when it gave up, or ''. At speed N the clock's waits are N times shorter in real time, so the real pauses are given in page time (`real`). */
/** The words of the callouts on the figure now (their small names: "Occluded", "No reading", "FHVP"...), joined. */
export const tagWords = (): string => [...document.querySelectorAll('.lb-layer .cl-k')].map((e) => e.textContent ?? '').join('|');
/** Waits until nothing is arriving for a moment, at most five seconds. Returns what was still moving when it gave up ('' when it settled) and the callouts' words at that moment. A catheter against a blocked vein says "Occluded" for
 *  only 2.6 s (BLOCKED_SAYS) before "No reading", so the wait is short once those words stand (a few real frames) and the picture is taken while they are up. At speed N the clock's waits are N times shorter in real time, so the
 *  real pauses are given in page time (`real`). */
export async function stillPage(real: (ms: number) => number, needWords = false, fast = false, kit: SettleKit = deckKit): Promise<{ moving: string; words: string; perpetual: string }> {
  const q = 1;   // (the first wait and the still hold stay whole in skip mode: the press needs a few frames, and a React commit, to reach the cards, and a shorter wait judged the slide before as settled)
  await sleep(real(60 * q));   // (the press has reached the cards: they mount and begin on the next frames)
  let frames = 0;
  const off = clock.on('tween', () => { frames++; });   // (frames drawn since this wait began: a strip fills by frames, not by the clock)
  const t0 = clock.now(), base = needWords ? 14000 : 12000;
  // (a reading on a card that is still changing holds the picture, for the first 6 s of the wait: a live instrument's numbers that never stop are a perpetual motion, said in
  // the README, not waited on for ever)
  const watch = readingWatch(real(250));
  let still = -1, why = '', words = '';
  // (a procedure's graph draws its head to the end on the page's own frames, which a slow screen makes few: the wait for it is the long one, so the picture and the tucked one after it show the run's end, never its middle.
  //  Gastric varices 7, capture 2b947e48: "Left renal vein 1.0" in one picture and "LRV 0.9" in the next, the run still going)
  const limitNow = () => real(settleLimitMs(why, base));
  while (clock.now() - t0 < limitNow()) {
    why = arriving(clock.now() - t0 < real(10000), clock.now() - t0 < real(9000), frames, kit) || kit.extra?.() || ''; words = tagWords();   // (the clock's motion list counts for 4 s of the 5: a hold that is still there after that is a perpetual one, and is said in the README)
    const moved = watch.see(readingsNow(), clock.now());   // (every poll, so the baseline is always the last read)
    if (!why && moved && clock.now() - t0 < real(6000)) why = moved;
    if (!why && needWords && !words.includes(BLOCKED_SAYS.first) && !words.includes(BLOCKED_SAYS.then)) why = 'the blocked catheter has no words yet';
    if (!why) { if (still < 0) still = clock.now(); else if (clock.now() - still >= real((words.includes(BLOCKED_SAYS.first) ? 25 : 60) * q)) { why = ''; break; } } else still = -1;
    await sleep(real(fast ? 8 : 15));
  }
  off();
  const gaveUp = clock.now() - t0 >= limitNow();
  if (!words.includes(BLOCKED_SAYS.first)) await sleep(real(30));   // (the last frame: the charts draw their last mesh, the callouts have placed)
  const soft = arriving(false, true, frames, kit);
  const perpetual = [clock.moving > 0 ? `the clock still held motion after 4 s (${clock.movingTags().join(', ')})` : '', soft ? `${soft}, still, after 3 s (the picture shows it so; it may in the app too)` : ''].filter(Boolean).join('; ');
  return { moving: gaveUp ? why : '', words: tagWords(), perpetual };
}
/** The contact sheet of one deck as a PNG. */
export async function sheet(title: string, thumbs: { n: string; title: string; img: HTMLCanvasElement }[], shot: { w: number; h: number }): Promise<Blob | null> {
  const L = collageLayout(thumbs.length, shot);
  const c = document.createElement('canvas'); c.width = L.width; c.height = L.height;
  const g = c.getContext('2d');
  if (!g) return null;
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#111111'; g.textBaseline = 'middle'; g.font = '700 22px system-ui, -apple-system, sans-serif';
  const head = `${title} · ${slidesWord(thumbs.length)}`, one = sheetHeaderLines(head, L.width - 2 * L.pad, (t) => g.measureText(t).width);
  if (one.length > 1) { g.font = '700 18px system-ui, -apple-system, sans-serif'; }
  const lines = one.length > 1 ? sheetHeaderLines(head, L.width - 2 * L.pad, (t) => g.measureText(t).width) : one;
  lines.forEach((ln, i) => g.fillText(ln, L.pad, L.pad + (L.headH * (i + 0.5)) / lines.length));
  thumbs.forEach((t, i) => {
    const { x, y } = L.cells[i]!;
    g.drawImage(t.img, x, y, L.cellW, L.cellH);
    g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 1; g.strokeRect(x + 0.5, y + 0.5, L.cellW - 1, L.cellH - 1);
    g.font = '600 14px system-ui, -apple-system, sans-serif'; g.fillStyle = '#111111';
    let words = `${t.n} · ${t.title}`;
    while (words.length > 4 && g.measureText(words).width > L.cellW) words = `${words.slice(0, -2).trimEnd()}…`;
    g.fillText(words, x, y + L.cellH + L.labelH / 2);
  });
  return blobOf(c, 'image/png');
}

/** The clock for a capture run: the page's speed (every glide, fade and wait runs `speed` times faster) and, in skip mode, every animation landing at once (audit/speed.ts). Returns what puts it all back. */
export function startCaptureClock(speed: number, skip: boolean): () => void {
  clock.setScale(speed);
  const off = skip ? skipAnimations(document) : null;
  if (skip) clock.setSkip(true);
  const rate = clock.every(() => { speedAnimations(document, speed); if (skip) finishAnimations(document); }, skip ? 16 : sampleRealMs(33, speed));
  return () => { clock.cancel(rate); clock.setScale(1); clock.setSkip(false); clock.setDrawing(true); off?.(); };
}
/** Skip mode holds the draw back while a state is reached: once it has landed, a frame or two are drawn before the picture. */
export async function showLanded(skip: boolean, real: (ms: number) => number): Promise<void> {
  if (!skip) return;
  let drawn = 0;
  const offR = clock.on('render', () => { drawn++; });
  clock.setDrawing(true);
  await until(() => drawn >= 1, real(2000));
  offR();
}
