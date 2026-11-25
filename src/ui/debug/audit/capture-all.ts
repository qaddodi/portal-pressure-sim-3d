// ?audit=here > "Capture all decks": the Capture pipeline (ui/capture/capture.ts) run over every slide of every talk, on this device. It opens each talk, steps to each stop, waits until the page is still
// (the camera, the cards, the charts, the callouts) twice over, captures the screen, and keeps: a JPEG of the slide and a JSON of its state (for the ZIP), and a small copy of it for the deck's
// contact sheet (one PNG per deck: a grid of its slides with their numbers and titles). The ZIP holds every slide, its state and the contact sheets. Started by a tap, can be stopped (what was
// captured so far is kept); nothing is sent anywhere: the person saves the file with the share sheet (iPhone, iPad) or the download (Mac).
import { builtinDecks } from '../../../decks/registry.ts';
import { loadAllDecks, liveCatalog, openEntry } from '../page/live.ts';
import { readBox, readStyle } from '../../layout-snap.ts';
import { cel } from '../../../scene/api.ts';
import { BLOCKED_SAYS } from '../../../scene/labels/cath-show.ts';
import { useUi } from '../../ui-store.ts';
import { talkOn, talkId } from '../../../state/deck.ts';
import { leaveTalk } from '../../shell/talk.ts';
import { clock } from '../../../clock/frame.ts';
import { latest } from '../../../engine/index.ts';
import { figureWaiting } from '../../deck/figure-pending.ts';
import { beatCardWaiting } from '../../tests/slide/beat-agree.ts';
import { menuWaiting } from '../../charts/menu/MenuCard.tsx';
import { drawScreen } from '../../capture/capture.ts';
import { speedAnimations, sampleRealMs, skipAnimations, finishAnimations } from './speed.ts';
import { captureViews, CHOICE_SEL, CHOICE_ON_SEL, CHOICE_MAX, choiceName, collageLayout, settleLimitMs, countWords, slidesWord, sheetHeaderLines, slug, stampTime } from '../../capture/capture-model.ts';
import { isSideways, layoutOf } from '../../layout/rules2d.ts';
import { lastPicked, stopKey, pickWords } from './capture-pick.ts';
import { growCaptureTotal } from './progress.ts';
import { zipBlob, type ZipFile } from '../../capture/zip.ts';
import { feedbackBuild, commitOf } from '../../../boot/release.ts';

export interface AllUi { /** only these talks (ids); absent: every talk */ decks?: ReadonlySet<string> | null; /** only these slides (`deck:k`, k the stop: 1 the first slide); null or absent: every slide */ pick?: ReadonlySet<string> | null; status(s: string): void; progress(done: number, total: number): void; stop(): boolean; /** the page clock's speed for the run (default 8) */ speed?: number; /** land every slide on its settled state at once: no CSS or script animation plays (see skipAnimations) */ skip?: boolean;
  /** capture this one talk only (its id); default every talk */ only?: string;
  /** leave the talk open on this stop at the end (the talk the person was in); default the talk is left */ restore?: number }
export interface AllResult { /** every file of the zip (name and bytes), for a page that joins several runs */ files: ZipFile[]; /** wall seconds for the whole run, and per slide: waiting for the slide to be still, drawing it */ secs: number; perSlide: { waitMs: number; drawMs: number }; speed: number; zip: Blob; zipName: string; collages: { name: string; blob: Blob }[]; shots: number; decks: number; stopped: boolean; notes: string[] }

const sleep = (ms: number) => new Promise<void>((ok) => clock.after(ok, ms));
const until = async (cond: () => boolean, ms: number) => { const t = clock.now(); while (!cond() && clock.now() - t < ms) await sleep(50); };
/** The talk NAMED is open and showing a card. (Not just "a talk": the one before is still open while the next loads, and its stops and cards passed the old check: capture 2c00c0ce took Circuit 2 with the gastric varices title and the circuit outline's picture.) */
const talkUp = (id: string) => talkId() === id && useUi.getState().stops.length > 0 && !!document.querySelector('.dk-card[data-phase="in"]');
/** The cards standing now (not leaving), by id: a Next has reached the screen when this changes or a card starts to leave. */
const cardIds = (): string => [...document.querySelectorAll('.dk-card[data-card]:not([data-phase="out"])')].map((e) => e.getAttribute('data-card')).sort().join(',');
const pad2 = (n: number) => String(n).padStart(2, '0');
const blobOf = (c: HTMLCanvasElement, type: string, q?: number) => new Promise<Blob | null>((ok) => c.toBlob(ok, type, q));
const bytesOf = async (b: Blob) => new Uint8Array(await b.arrayBuffer());
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
const STATE_WAIT = /has not reached the slide|has not caught up with the slide|has not worked out its dots/;
const CONTENT = '.dk-card, .dk-plate, .lb-layer, .dk-bar, .vdock, .topbar, .stage-credit, .zoom-pill, .dk-strip';
function arriving(clockToo = true, stripsToo = true, frames = 99): string {
  try {
    if (cel.rig.isMoving) return 'the camera is moving';
    if (clockToo && clock.moving > 0) return `moving: ${clock.movingTags().join(', ')}`;   // (a glide, a tween, a card sliding, the labels placing: the clock's own list of what is in motion; the steady instruments, a live trace, are not in it)
    if (clockToo && latest.frame?.morphing) return 'the model is morphing';   // (a procedure's change runs in the engine for seconds of its own time: a paracentesis slide's litres read 5.9 on every step until it ended, Ascites 13, build 572259fd)
    if (document.querySelector('.dk-card[data-phase="out"], .dk-plate[data-phase="out"]')) return 'a card is leaving';
    if (document.fonts && document.fonts.status === 'loading') return 'fonts are loading';
    if ([...document.querySelectorAll('.dk-card .dk-roll-in, .dk-card .dk-roll-now')].some((e) => (e.textContent ?? '').trim() === '…')) return 'a reading on a card is still "…" (its number has not arrived)';   // (the line's blank gap, TIPS follow-up 5 "her PPG is …", build e4810ea9)
    if (clock.stats().holds.includes('chart:evgraph')) return 'the procedure graph is still drawing to its end';   // (the card says the slide's end value while the plot's head is still on its way: Gastric varices 7, 19.4 against 18.1)
    if (menuWaiting()) return 'the treatment menu has not worked out its dots yet';
    if (beatCardWaiting()) return 'the pressure strip has not caught up with the slide\'s numbers (its history is still coming, or the model is still easing to the slide)';
    if (figureWaiting()) return 'the figure has not reached the slide\'s state yet (its labels would print the slide before\'s patient)';
    if (document.querySelector('.sh-waitcue')) return 'a "Preparing…" cue is up (the lobule, a pane or a dive is still being made)';
    if (stripsToo) {
      if (dopplerAcquiring()) return 'the Doppler is acquiring';
      if (!document.querySelector('.dk-card[data-phase="in"], .dk-plate[data-phase="in"]')) return 'no card is up yet';
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
const tagWords = (): string => [...document.querySelectorAll('.lb-layer .cl-k')].map((e) => e.textContent ?? '').join('|');
/** Waits until nothing is arriving for a moment, at most five seconds. Returns what was still moving when it gave up ('' when it settled) and the callouts' words at that moment. A catheter against a blocked vein says "Occluded" for
 *  only 2.6 s (BLOCKED_SAYS) before "No reading", so the wait is short once those words stand (a few real frames) and the picture is taken while they are up. At speed N the clock's waits are N times shorter in real time, so the
 *  real pauses are given in page time (`real`). */
async function stillPage(real: (ms: number) => number, needWords = false, fast = false): Promise<{ moving: string; words: string; perpetual: string }> {
  const q = 1;   // (the first wait and the still hold stay whole in skip mode: the press needs a few frames, and a React commit, to reach the cards, and a shorter wait judged the slide before as settled)
  await sleep(real(60 * q));   // (the press has reached the cards: they mount and begin on the next frames)
  let frames = 0;
  const off = clock.on('tween', () => { frames++; });   // (frames drawn since this wait began: a strip fills by frames, not by the clock)
  const t0 = clock.now(), base = needWords ? 14000 : 12000;
  let still = -1, why = '', words = '';
  // (a procedure's graph draws its head to the end on the page's own frames, which a slow screen makes few: the wait for it is the long one, so the picture and the tucked one after it show the run's end, never its middle.
  //  Gastric varices 7, capture 2b947e48: "Left renal vein 1.0" in one picture and "LRV 0.9" in the next, the run still going)
  const limitNow = () => real(settleLimitMs(why, base));
  while (clock.now() - t0 < limitNow()) {
    why = arriving(clock.now() - t0 < real(10000), clock.now() - t0 < real(9000), frames); words = tagWords();   // (the clock's motion list counts for 4 s of the 5: a hold that is still there after that is a perpetual one, and is said in the README)
    if (!why && needWords && !words.includes(BLOCKED_SAYS.first) && !words.includes(BLOCKED_SAYS.then)) why = 'the blocked catheter has no words yet';
    if (!why) { if (still < 0) still = clock.now(); else if (clock.now() - still >= real((words.includes(BLOCKED_SAYS.first) ? 25 : 60) * q)) { why = ''; break; } } else still = -1;
    await sleep(real(fast ? 8 : 15));
  }
  off();
  const gaveUp = clock.now() - t0 >= limitNow();
  if (!words.includes(BLOCKED_SAYS.first)) await sleep(real(30));   // (the last frame: the charts draw their last mesh, the callouts have placed)
  const soft = arriving(false, true, frames);
  const perpetual = [clock.moving > 0 ? `the clock still held motion after 4 s (${clock.movingTags().join(', ')})` : '', soft ? `${soft}, still, after 3 s (the picture shows it so; it may in the app too)` : ''].filter(Boolean).join('; ');
  return { moving: gaveUp ? why : '', words: tagWords(), perpetual };
}
/** A slide whose catheter stands against a blocked vein (its words "Occluded" and "No reading" must be on the figure). */
const blockedSlide = (k: number): boolean => { const st = useUi.getState().stops[k]; return !!st && st.kind === 'slide' && st.slide.cath === 'blocked'; };
const stopName = (k: number): string => { const st = useUi.getState().stops[k]; return st ? (st.kind === 'slide' ? st.slide.title : st.kind) : `stop ${k + 1}`; };

/** The contact sheet of one deck as a PNG. */
async function sheet(title: string, thumbs: { n: string; title: string; img: HTMLCanvasElement }[], shot: { w: number; h: number }): Promise<Blob | null> {
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

/** Every slide of every talk, captured. */
export async function captureAllDecks(ui: AllUi): Promise<AllResult> {
  const encoding: Promise<void>[] = [];
  const at = new Date(), notes: string[] = [], files: ZipFile[] = [], collages: { name: string; blob: Blob }[] = [], enc = new TextEncoder();
  const { failed } = ui.only && builtinDecks().some((d) => d.id === ui.only) ? { failed: [] as string[] } : await loadAllDecks();
  if (failed.length) notes.push(`these talks would not load, so they are not captured: ${failed.join(', ')}`);
  const decks = builtinDecks().filter((d) => (!ui.only || d.id === ui.only) && (!ui.decks || ui.decks.has(d.id))), build = feedbackBuild(import.meta.env.VITE_RELEASE, import.meta.env.VITE_BUILD, import.meta.env.VITE_CHANNEL);
  const speed = ui.speed && ui.speed > 1 ? ui.speed : 60, real = (ms: number) => ms * speed, t0 = new Date().getTime();
  clock.setScale(speed);   // (every glide, fade and wait of the page runs `speed` times faster: a camera flight lands in a few frames. The audit's own speed mode, audit/speed.ts)
  const off = ui.skip ? skipAnimations(document) : null;
  if (ui.skip) clock.setSkip(true);
  const rate = clock.every(() => { speedAnimations(document, speed); if (ui.skip) finishAnimations(document); }, ui.skip ? 16 : sampleRealMs(33, speed));
  const seen = new Set<string>(), single = !!(ui.pick && ui.pick.size);
  let reached = 0;
  const put = (f: ZipFile): void => { const i = files.findIndex((x) => x.name === f.name); if (i >= 0) files[i] = f; else files.push(f); };
  let waitMs = 0, drawMs = 0, shape0 = { w: 0, h: 0 };
  const pick = ui.pick && ui.pick.size ? ui.pick : null;
  const slidesSeen = new Set<string>();   // (the slides that have a picture: the README counts these and the pictures apart, a slide on a phone on its side has two)
  let total = pick ? pick.size : decks.reduce((n, d) => n + d.slides.length + 2, 0), done = 0, shots = 0, stopped = false, decksDone = 0;
  try {
    for (const [di, d] of decks.entries()) {
      if (ui.stop()) { stopped = true; break; }
      const last = pick ? lastPicked(pick, d.id) : Infinity;
      if (last < 0) continue;   // (no slide of this talk is picked)
      const entry = liveCatalog().find((e) => e.id === `slide:${d.id}:0`);
      if (!entry) { notes.push(`talk ${d.id} is not in the catalog`); continue; }
      ui.status(`${d.title}: opening`);
      clock.setDrawing(true);   // (skip mode holds the draw back between slides: a talk always opens with it on)
      await openEntry(entry);
      await until(() => talkUp(d.id), real(25000));   // (25 s of the WALL: `until` counts page time, which at 300x passes 300 times faster, so a bare 25000 was 83 ms and the cold first talk never had time to load)
      const stops = useUi.getState().stops.length;
      if (!stops) { notes.push(`${d.title}: the talk did not open (no stops after 25 s)`); continue; }
      total = growCaptureTotal(total, stops, single);   // (the talk's stops are a floor: the steps within them add more as they are met)
      const dir = `${pad2(di + 1)}-${d.id}`, thumbs: { n: string; title: string; img: HTMLCanvasElement }[] = [];
      let shape = { w: innerWidth, h: innerHeight };
      // one picture of what stands now: the talk's own position says which (stop, then the step within it: the case card, each beat, each page, each procedure step and reading)
      let prevIds = '', sub = 0, lastStop = -1, presses = 0, shownNow = '', inStop = 0, inStopAt = -1, lastThumbs = 0;
      const showLanded = async (): Promise<void> => { if (!ui.skip) return; let drawn = 0; const offR = clock.on('render', () => { drawn++; }); clock.setDrawing(true); await until(() => drawn >= 1, real(2000)); offR(); };   // (the landed slide is drawn, a frame or two, before the picture)
      const roots = '.dk-card[data-phase="in"], .t-card';
      const standing = (sel: string): HTMLElement[] => Array.from(document.querySelectorAll<HTMLElement>(roots)).flatMap((c) => Array.from(c.querySelectorAll<HTMLElement>(sel))).filter((t) => { const r = readBox(t); return r.width > 1 && r.height > 1 && Number(readStyle(t).opacity) > 0.1 && !(t as HTMLButtonElement).disabled; });
      const grab = async (): Promise<void> => {
        const p = useUi.getState().pos, k = p.stop;
        const fresh = k !== lastStop;   // (the first picture of this slide)
        sub = single ? 0 : fresh ? 0 : sub + 1; lastStop = k;   // (a random sample is one picture a slide, its last step: each step replaces the one before it)
        if (pick && !pick.has(stopKey(d.id, k))) {   // (a slide that is not picked is walked past, not taken: the walk still presses Next, so the steps the next slide stands on are the ones a person would reach)
          shownNow = '';
          const t = clock.now();
          await sleep(real(ui.skip ? 16 : 40));
          while (clock.now() - t < real(1500) && (cel.rig.isMoving || document.querySelector('.dk-card[data-phase="out"], .dk-plate[data-phase="out"]'))) await sleep(real(15));
          return;
        }
        const title = stopName(k), n = sub ? `${k + 1}.${sub + 1}` : `${k + 1}`;
        if (single && fresh) reached++;
        ui.status(single ? `${reached} of ${pick!.size}: ${d.title} “${title}”` : `${d.title}: ${n} of ${stops} “${title}”`);
        const w0 = new Date().getTime();
        if (ui.skip && fresh && prevIds) await until(() => cardIds() !== prevIds || !!document.querySelector('.dk-card[data-phase="out"]'), real(1200));   // (skip mode: the press has reached the screen before anything is judged still; else the slide before reads as settled)
        let { moving, words, perpetual } = await stillPage(real, blockedSlide(k), !!ui.skip);
        // (a picture whose figure, strip or menu has not reached the slide's own state shows the case wrong, whatever the cards say: it waits up to a minute more, and if it still has not, the README says the picture FAILED, so it is retaken, never read: One patient, ten years 9, reviewer 24 Nov 2026)
        for (let tries = 0; moving && STATE_WAIT.test(moving) && tries < 11; tries++) ({ moving, words, perpetual } = await stillPage(real, blockedSlide(k), !!ui.skip));
        if (moving) notes.push(STATE_WAIT.test(moving) ? `${d.title} ${n}: CAPTURE FAILED, the picture does not show the slide's own state (${moving}); retake it` : `${d.title} ${n}: still not still after 5 s (${moving}); captured as it was`);
        shownNow = words; prevIds = cardIds();
        await showLanded();
        if (perpetual && !seen.has(perpetual)) { seen.add(perpetual); notes.push(`${d.title} ${n}: ${perpetual}; the picture was taken anyway`); }
        // a phone on its side with both cards (the words and the instrument stand in one column that a swipe up slides): two pictures of the slide, the teaching card in view, then the column slid up so the instrument is
        const views = captureViews({ w: innerWidth, h: innerHeight, layout: layoutOf(innerWidth, innerHeight), sideways: isSideways(innerWidth, innerHeight) }, { data: !!useUi.getState().boxes.data, words: !!useUi.getState().boxes.words }), both = views.length === 2;   // (an upright phone or tablet: the instrument card up, then tucked)
        const base0 = `${dir}/${pad2(k + 1)}-${pad2(sub + 1)}-${slug(title)}`;
        if (single && !fresh) { thumbs.length = Math.max(0, thumbs.length - lastThumbs); }   // (a step replaces the one before it: its pictures' small copies go too)
        let pushed = 0;
        const shoot = async (view: string, choice?: string): Promise<boolean> => {
          const t1 = new Date().getTime();
          const when = new Date(), drawn = await drawScreen(when, { ratio: Math.min(devicePixelRatio, 2), stamp: false });   // (the device's own sharpness, 2x at most; no stamp in the corner: the build and time are in the README and each JSON)
          if (!drawn) { notes.push(`${d.title}: ${n}${view ? ` ${view}` : ''} could not be drawn`); return false; }
          const jpegP = blobOf(drawn.canvas, 'image/jpeg', 0.85).then(async (b) => (b ? bytesOf(b) : null));   // (the encoder takes its own copy of the picture at once and works off this thread while the next is reached)
          shape = { w: drawn.canvas.width, h: drawn.canvas.height }; shape0 = shape;
          const L = collageLayout(1, shape), thumb = document.createElement('canvas'); thumb.width = L.cellW * 2; thumb.height = L.cellH * 2;   // (twice the sheet's cell: a sharp one when the sheet is zoomed)
          thumb.getContext('2d')?.drawImage(drawn.canvas, 0, 0, thumb.width, thumb.height);
          drawn.canvas.width = 0; drawn.canvas.height = 0;   // (let the big picture go before the next)
          drawMs += new Date().getTime() - t1;
          const base = view ? `${base0}-${view}` : base0;
          const meta = enc.encode(JSON.stringify({ deck: d.id, deckTitle: d.title, stop: k + 1, step: sub + 1, of: stops, beat: p.beat + 1, page: useUi.getState().page, title, ...(view ? { card: view } : {}), ...(choice ? { choice } : {}), ...drawn.record }, null, 1));
          encoding.push(jpegP.then((data) => { if (data) put({ name: `${base}.jpg`, data }); }));
          put({ name: `${base}.json`, data: meta });
          thumbs.push({ n: view ? `${n} ${view}` : n, title, img: thumb }); pushed++;
          slidesSeen.add(`${d.id}/${k}`);
          if (!single || fresh) shots++;
          return true;
        };
        // a teaching slide with several choices (tabs, toggles, options): each is pressed and the result taken, named for the button; the first picture's choice is put back before the next state
        const choiceShots = async (view: string): Promise<void> => {
          const names = standing(CHOICE_SEL).map((t, i) => choiceName(t.textContent, t.getAttribute('aria-label'), i)), was = standing(CHOICE_ON_SEL).map((t, i) => choiceName(t.textContent, t.getAttribute('aria-label'), i));
          const pressed = new Set<string>();
          for (let i = 0; i < Math.min(names.length, CHOICE_MAX); i++) {
            if (ui.stop()) break;
            const t = standing(CHOICE_SEL).find((e, j) => { const nm = choiceName(e.textContent, e.getAttribute('aria-label'), j); return !pressed.has(nm); });
            if (!t) break;
            const nm = choiceName(t.textContent, t.getAttribute('aria-label'), i); pressed.add(nm);
            if (ui.skip) clock.setDrawing(false);
            t.click();
            await stillPage(real, false, !!ui.skip); await showLanded();
            await shoot(`${view ? `${view}-` : ''}choice${pad2(i + 1)}-${nm}`, nm);
          }
          if (pressed.size) {   // (put back what stood: the first of the cards' choices)
            for (const nm of was) { const back = standing(CHOICE_SEL).find((e, j) => choiceName(e.textContent, e.getAttribute('aria-label'), j) === nm); if (back) { if (ui.skip) clock.setDrawing(false); back.click(); await stillPage(real, false, !!ui.skip); await showLanded(); } }
          }
        };
        const d0 = new Date().getTime(); waitMs += d0 - w0;
        const ok = await shoot(views[0]);
        if (ok && fresh) await choiceShots(views[0]);
        if (both && ok) {
          useUi.getState().setDocked(true);   // (sideways: the swipe up, the column slides until the instrument card is the one in view; upright: the instrument card tucks into its strip)
          await stillPage(real, false, !!ui.skip);
          const ok2 = await shoot(views[1]!);
          if (ok2 && fresh) await choiceShots(views[1]!);
          useUi.getState().setDocked(false);   // (and back: the next slide starts on its words)
          await sleep(real(60));
        }
        lastThumbs = pushed;
        if (!ok) { if (!single || fresh) done++; ui.progress(done, total); return; }
        if (!single || fresh) done++;
        if (!single && done >= total) total = done + stops;
        ui.progress(done, total);
      };
      // the talk from its first stop, then Next as a person presses it, to the end: every beat (the case card first, then the slide), every page of a split card, every step of a procedure
      // (a catheter's advance, the EUS-PPG and HVPG readings) and every reading of a tracing. Next says whether it did anything: when it does not, the talk is over.
      // a catheter against a blocked vein says "Occluded" at its tip, then 2.6 s later "No reading" (cath-show.ts): the second words are a picture of their own, taken once they stand
      const blockedThen = async (): Promise<void> => {
        if (!blockedSlide(useUi.getState().pos.stop) || !shownNow.includes(BLOCKED_SAYS.first)) return;
        await until(() => tagWords().includes(BLOCKED_SAYS.then), BLOCKED_SAYS.afterMs + real(2000));   // (the words come on the label layer's FRAMES, a few a second on a slow screen: so the wait is two REAL seconds past the 2.6 s, not 1.5 s of page time, which at speed N is 1/N of a second and a handful of frames)
        if (tagWords().includes(BLOCKED_SAYS.then)) await grab(); else notes.push(`${d.title} ${sub + 1}: the words "${BLOCKED_SAYS.then}" did not come`);
      };
      if (ui.skip) clock.setDrawing(false); useUi.getState().go(0);
      await grab(); await blockedThen();
      for (; presses < stops * 40; presses++) {
        if (ui.stop()) { stopped = true; break; }
        if (ui.skip) clock.setDrawing(false);
        if (!useUi.getState().move('next')) break;
        // a Next that keeps saying yes without the talk leaving its stop (a page that is never the last, a step that never ends): after 30 presses the walk jumps on and says so, so one stuck slide costs one picture, not the rest of the talk
        const here = useUi.getState().pos.stop;
        inStop = here === inStopAt ? inStop + 1 : 1; inStopAt = here;
        if (inStop > 30) {
          const st = useUi.getState();
          notes.push(`${d.title} stop ${here + 1}: Next was pressed ${inStop} times and the talk stayed on it (page ${typeof st.page === 'number' ? st.page + 1 : st.page} of ${st.pageCount}, beat ${st.pos.beat + 1}); the walk jumped on. On a phone this could be a slide Next cannot leave: check it`);
          st.go(here + 1); inStop = 0;
          if (useUi.getState().pos.stop === here) break;
        }
        if (useUi.getState().pos.stop > last) break;   // (past the last picked slide of this talk)
        await grab(); await blockedThen();
      }
      if (!stopped && presses >= stops * 40) notes.push(`${d.title}: stopped after ${presses} presses (the talk did not end)`);
      if (thumbs.length) {
        const png = await sheet(d.title, thumbs, shape);
        if (png) { const name = `${dir}-contact-sheet.png`; collages.push({ name, blob: png }); files.push({ name, data: await bytesOf(png) }); }
        decksDone++;
      }
      if (stopped) break;
    }
  } finally {
    clock.cancel(rate); clock.setScale(1); clock.setSkip(false); clock.setDrawing(true); off?.();
    if (ui.restore !== undefined && talkOn()) useUi.getState().go(ui.restore); else if (talkOn()) leaveTalk();   // (the talk the person was in stays open where they were)
  }
  await Promise.all(encoding);
  const secs = Math.round((new Date().getTime() - t0) / 100) / 10;
  files.push({ name: 'README.txt', data: enc.encode([`Portal pressure simulator: every slide of every talk`, `Build: ${build}`, `Made: ${stampTime(at)} on ${innerWidth}x${innerHeight} at ${devicePixelRatio}x; the pictures are ${shape0.w}x${shape0.h} px`, countWords(files.filter((f) => f.name.endsWith('.jpg')).length, slidesSeen.size, decksDone)+`${stopped ? ' (stopped early)' : ''}${pick ? ` (picked slides: ${pickWords([...pick])})` : ''}`, `Took ${secs} s at ${speed}x: about ${shots ? Math.round(waitMs / shots) : 0} ms waiting for each slide to be still and ${shots ? Math.round(drawMs / shots) : 0} ms drawing it (real time)`, '', 'Each talk has a folder: one JPEG per slide and a JSON beside it (the link that reopens that slide, and the patient, the look, the lens and the view it was taken with).', 'On a phone on its side a slide with both cards has two pictures: -teaching (the words in view) and -instrument (the column swiped up). On an upright iPhone or iPad a slide with an instrument card has two: -untucked (the card up) and -tucked (the card in its strip). A slide with several choices (tabs, options, toggles) has a picture for each, named -choiceNN-<the button> (after -untucked, -tucked, -teaching or -instrument when it has those). A random sample counts slides, not pictures.', 'The contact sheets (one PNG per talk) sit at the top.', ...notes].join('\n')) });
  const commit = commitOf(import.meta.env.VITE_BUILD) || 'local';
  const stamp = `${at.getFullYear()}${pad2(at.getMonth() + 1)}${pad2(at.getDate())}-${pad2(at.getHours())}${pad2(at.getMinutes())}${pad2(at.getSeconds())}`;
  return { files, secs, perSlide: { waitMs: shots ? Math.round(waitMs / shots) : 0, drawMs: shots ? Math.round(drawMs / shots) : 0 }, speed, zip: zipBlob(files, at), zipName: `portal-pressure-${ui.only ? slug(ui.only) : 'all-decks'}-${commit}-${stamp}.zip`, collages, shots, decks: decksDone, stopped, notes };
}

export { saveFiles } from '../../capture/save-files.ts';
