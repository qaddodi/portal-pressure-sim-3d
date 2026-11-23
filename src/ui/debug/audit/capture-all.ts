// ?audit=here > "Capture all decks": the Capture pipeline (ui/capture/capture.ts) run over every slide of every talk, on this device. It opens each talk, steps to each stop, waits until the page is still
// (the camera, the cards, the charts, the callouts) twice over, captures the screen, and keeps: a JPEG of the slide and a JSON of its state (for the ZIP), and a small copy of it for the deck's
// contact sheet (one PNG per deck: a grid of its slides with their numbers and titles). The ZIP holds every slide, its state and the contact sheets. Started by a tap, can be stopped (what was
// captured so far is kept); nothing is sent anywhere: the person saves the file with the share sheet (iPhone, iPad) or the download (Mac).
import { builtinDecks } from '../../../decks/registry.ts';
import { loadAllDecks, liveCatalog, openEntry, settle } from '../page/live.ts';
import { useUi } from '../../ui-store.ts';
import { talkOn } from '../../../state/deck.ts';
import { leaveTalk } from '../../shell/talk.ts';
import { clock } from '../../../clock/frame.ts';
import { drawScreen } from '../../capture/capture.ts';
import { speedAnimations, sampleRealMs } from './speed.ts';
import { collageLayout, slug, stampTime, deliverWay } from '../../capture/capture-model.ts';
import { zipBlob, type ZipFile } from '../../capture/zip.ts';
import { feedbackBuild, commitOf } from '../../../boot/release.ts';

export interface AllUi { status(s: string): void; progress(done: number, total: number): void; stop(): boolean; /** the page clock's speed for the run (default 8) */ speed?: number;
  /** capture this one talk only (its id); default every talk */ only?: string;
  /** leave the talk open on this stop at the end (the talk the person was in); default the talk is left */ restore?: number }
export interface AllResult { /** wall seconds for the whole run, and per slide: waiting for the slide to be still, drawing it */ secs: number; perSlide: { waitMs: number; drawMs: number }; speed: number; zip: Blob; zipName: string; collages: { name: string; blob: Blob }[]; shots: number; decks: number; stopped: boolean; notes: string[] }

const sleep = (ms: number) => new Promise<void>((ok) => clock.after(ok, ms));
const until = async (cond: () => boolean, ms: number) => { const t = clock.now(); while (!cond() && clock.now() - t < ms) await sleep(50); };
const talkUp = () => talkOn() && useUi.getState().stops.length > 0 && !!document.querySelector('.dk-card[data-phase="in"]');
const pad2 = (n: number) => String(n).padStart(2, '0');
const blobOf = (c: HTMLCanvasElement, type: string, q?: number) => new Promise<Blob | null>((ok) => c.toBlob(ok, type, q));
const bytesOf = async (b: Blob) => new Uint8Array(await b.arrayBuffer());
/** The page still: nothing moving (the camera, a card in or out, fonts, a running animation), twice over with a few real frames between so a late callout or chart that starts after the first quiet is caught.
 *  At speed N the clock's waits are N times shorter in real time, so the real pauses are given in page time (`real`). */
async function stillPage(real: (ms: number) => number): Promise<void> {
  await sleep(real(80));   // (the press has reached the cards: they mount and begin on the next frames)
  await settle({ timeoutMs: real(8000), quietMs: real(120), pollMs: real(20) });
  try { await document.fonts?.ready; } catch { /* no font list: nothing to wait for */ }
  await sleep(real(60));   // (the glides have landed, the charts have drawn their last frame, the callouts have placed)
  await settle({ timeoutMs: real(4000), quietMs: real(80), pollMs: real(20) });
}
const stopName = (k: number): string => { const st = useUi.getState().stops[k]; return st ? (st.kind === 'slide' ? st.slide.title : st.kind) : `stop ${k + 1}`; };

/** The contact sheet of one deck as a PNG. */
async function sheet(title: string, thumbs: { n: string; title: string; img: HTMLCanvasElement }[], shot: { w: number; h: number }): Promise<Blob | null> {
  const L = collageLayout(thumbs.length, shot);
  const c = document.createElement('canvas'); c.width = L.width; c.height = L.height;
  const g = c.getContext('2d');
  if (!g) return null;
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#111111'; g.textBaseline = 'middle'; g.font = '700 22px system-ui, -apple-system, sans-serif';
  g.fillText(`${title} · ${thumbs.length} slides`, L.pad, L.pad + L.headH / 2);
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
  const decks = builtinDecks().filter((d) => !ui.only || d.id === ui.only), build = feedbackBuild(import.meta.env.VITE_RELEASE, import.meta.env.VITE_BUILD, import.meta.env.VITE_CHANNEL);
  const speed = ui.speed && ui.speed > 1 ? ui.speed : 60, real = (ms: number) => ms * speed, t0 = new Date().getTime();
  clock.setScale(speed);   // (every glide, fade and wait of the page runs `speed` times faster: a camera flight lands in a few frames. The audit's own speed mode, audit/speed.ts)
  const rate = clock.every(() => speedAnimations(document, speed), sampleRealMs(33, speed));
  let waitMs = 0, drawMs = 0;
  let total = decks.reduce((n, d) => n + d.slides.length + 2, 0), done = 0, shots = 0, stopped = false, decksDone = 0;
  try {
    for (const [di, d] of decks.entries()) {
      if (ui.stop()) { stopped = true; break; }
      const entry = liveCatalog().find((e) => e.id === `slide:${d.id}:0`);
      if (!entry) { notes.push(`talk ${d.id} is not in the catalog`); continue; }
      ui.status(`${d.title}: opening`);
      await openEntry(entry);
      await until(talkUp, 25000);
      const stops = useUi.getState().stops.length;
      if (!stops) { notes.push(`${d.title}: the talk did not open (no stops after 25 s)`); continue; }
      total += stops;   // (the talk's stops are a floor: the steps within them add more as they are met)
      const dir = `${pad2(di + 1)}-${d.id}`, thumbs: { n: string; title: string; img: HTMLCanvasElement }[] = [];
      let shape = { w: innerWidth, h: innerHeight };
      // one picture of what stands now: the talk's own position says which (stop, then the step within it: the case card, each beat, each page, each procedure step and reading)
      let sub = 0, lastStop = -1, presses = 0;
      const grab = async (): Promise<void> => {
        const p = useUi.getState().pos, k = p.stop;
        sub = k === lastStop ? sub + 1 : 0; lastStop = k;
        const title = stopName(k), n = sub ? `${k + 1}.${sub + 1}` : `${k + 1}`;
        ui.status(`${d.title}: ${n} of ${stops} “${title}”`);
        const w0 = new Date().getTime();
        await stillPage(real);
        const d0 = new Date().getTime(); waitMs += d0 - w0;
        const when = new Date(), drawn = await drawScreen(when, { ratio: innerWidth < 600 ? Math.min(devicePixelRatio, 1.5) : 1 });   // (1x for a laptop or an iPad: the slides are for reading through)
        if (!drawn) { notes.push(`${d.title}: ${n} could not be drawn`); done++; ui.progress(done, total); return; }
        const jpegP = blobOf(drawn.canvas, 'image/jpeg', 0.85).then(async (b) => (b ? bytesOf(b) : null));   // (the encoder takes its own copy of the picture at once and works off this thread while the next is reached)
        shape = { w: drawn.canvas.width, h: drawn.canvas.height };
        const L = collageLayout(1, shape), thumb = document.createElement('canvas'); thumb.width = L.cellW * 2; thumb.height = L.cellH * 2;   // (twice the sheet's cell: a sharp one when the sheet is zoomed)
        thumb.getContext('2d')?.drawImage(drawn.canvas, 0, 0, thumb.width, thumb.height);
        drawn.canvas.width = 0; drawn.canvas.height = 0;   // (let the big picture go before the next)
        drawMs += new Date().getTime() - d0;
        const base = `${dir}/${pad2(k + 1)}-${pad2(sub + 1)}-${slug(title)}`;
        const meta = enc.encode(JSON.stringify({ deck: d.id, deckTitle: d.title, stop: k + 1, step: sub + 1, of: stops, beat: p.beat + 1, page: useUi.getState().page, title, ...drawn.record }, null, 1));
        encoding.push(jpegP.then((data) => { if (data) files.push({ name: `${base}.jpg`, data }); }));
        files.push({ name: `${base}.json`, data: meta });
        thumbs.push({ n, title, img: thumb });
        shots++; done++; if (done >= total) total = done + stops; ui.progress(done, total);
      };
      // the talk from its first stop, then Next as a person presses it, to the end: every beat (the case card first, then the slide), every page of a split card, every step of a procedure
      // (a catheter's advance, the EUS-PPG and HVPG readings) and every reading of a tracing. Next says whether it did anything: when it does not, the talk is over.
      useUi.getState().go(0);
      await grab();
      for (; presses < stops * 40; presses++) {
        if (ui.stop()) { stopped = true; break; }
        if (!useUi.getState().move('next')) break;
        await grab();
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
    clock.cancel(rate); clock.setScale(1);
    if (ui.restore !== undefined && talkOn()) useUi.getState().go(ui.restore); else if (talkOn()) leaveTalk();   // (the talk the person was in stays open where they were)
  }
  await Promise.all(encoding);
  const secs = Math.round((new Date().getTime() - t0) / 100) / 10;
  files.push({ name: 'README.txt', data: enc.encode([`Portal pressure simulator: every slide of every talk`, `Build: ${build}`, `Made: ${stampTime(at)} on ${innerWidth}x${innerHeight} at ${devicePixelRatio}x`, `${shots} pictures in ${decksDone} talks${stopped ? ' (stopped early)' : ''}`, `Took ${secs} s at ${speed}x: about ${shots ? Math.round(waitMs / shots) : 0} ms waiting for each slide to be still and ${shots ? Math.round(drawMs / shots) : 0} ms drawing it (real time)`, '', 'Each talk has a folder: one JPEG per slide and a JSON beside it (the link that reopens that exact view, the patient, the look, the camera, the sliders).', 'The contact sheets (one PNG per talk) sit at the top.', ...notes].join('\n')) });
  const commit = commitOf(import.meta.env.VITE_BUILD) || 'local';
  const stamp = `${at.getFullYear()}${pad2(at.getMonth() + 1)}${pad2(at.getDate())}-${pad2(at.getHours())}${pad2(at.getMinutes())}${pad2(at.getSeconds())}`;
  return { secs, perSlide: { waitMs: shots ? Math.round(waitMs / shots) : 0, drawMs: shots ? Math.round(drawMs / shots) : 0 }, speed, zip: zipBlob(files, at), zipName: `portal-pressure-${ui.only ? slug(ui.only) : 'all-decks'}-${commit}-${stamp}.zip`, collages, shots, decks: decksDone, stopped, notes };
}

/** Hands a file over: the share sheet on a touch device that takes files, otherwise a download. Must be called from a tap (the share sheet asks for one). Resolves false when the person closed the sheet. */
export async function saveFiles(files: File[]): Promise<boolean> {
  const way = deliverWay({ touchPoints: navigator.maxTouchPoints || 0, canShareFiles: !!navigator.canShare?.({ files }) });
  if (way === 'share') {
    try { await navigator.share({ files }); return true; } catch (e) { if ((e as { name?: string })?.name === 'AbortError') return false; }
  }
  for (const f of files) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(f); a.download = f.name;
    document.body.appendChild(a); a.click(); a.remove();
    clock.after(() => URL.revokeObjectURL(a.href), 20000);
    if (files.length > 1) await sleep(250);
  }
  return true;
}
