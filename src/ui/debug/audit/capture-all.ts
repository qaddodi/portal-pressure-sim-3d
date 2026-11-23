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
import { collageLayout, slug, stampTime, deliverWay } from '../../capture/capture-model.ts';
import { zipBlob, type ZipFile } from '../../capture/zip.ts';
import { feedbackBuild, commitOf } from '../../../boot/release.ts';

export interface AllUi { status(s: string): void; progress(done: number, total: number): void; stop(): boolean }
export interface AllResult { zip: Blob; zipName: string; collages: { name: string; blob: Blob }[]; shots: number; decks: number; stopped: boolean; notes: string[] }

const sleep = (ms: number) => new Promise<void>((ok) => clock.after(ok, ms));
const until = async (cond: () => boolean, ms: number) => { const t = clock.now(); while (!cond() && clock.now() - t < ms) await sleep(50); };
const talkUp = () => talkOn() && useUi.getState().stops.length > 0 && !!document.querySelector('.dk-card[data-phase="in"]');
const pad2 = (n: number) => String(n).padStart(2, '0');
const blobOf = (c: HTMLCanvasElement, type: string, q?: number) => new Promise<Blob | null>((ok) => c.toBlob(ok, type, q));
const bytesOf = async (b: Blob) => new Uint8Array(await b.arrayBuffer());
/** Still twice over, with a breath between: the first quiet can come before a late callout or chart starts. */
async function stillPage(): Promise<void> {
  await settle({ timeoutMs: 45000, quietMs: 600, pollMs: 50 });
  try { await document.fonts?.ready; } catch { /* no font list: nothing to wait for */ }
  await sleep(500);
  await settle({ timeoutMs: 20000, quietMs: 600, pollMs: 50 });
}
const stopName = (k: number): string => { const st = useUi.getState().stops[k]; return st ? (st.kind === 'slide' ? st.slide.title : st.kind) : `stop ${k + 1}`; };

/** The contact sheet of one deck as a PNG. */
async function sheet(title: string, thumbs: { n: number; title: string; img: HTMLCanvasElement }[], shot: { w: number; h: number }): Promise<Blob | null> {
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
  const at = new Date(), notes: string[] = [], files: ZipFile[] = [], collages: { name: string; blob: Blob }[] = [], enc = new TextEncoder();
  const { failed } = await loadAllDecks();
  if (failed.length) notes.push(`these talks would not load, so they are not captured: ${failed.join(', ')}`);
  const decks = builtinDecks(), build = feedbackBuild(import.meta.env.VITE_RELEASE, import.meta.env.VITE_BUILD, import.meta.env.VITE_CHANNEL);
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
      total += stops - (d.slides.length + 2);
      const dir = `${pad2(di + 1)}-${d.id}`, thumbs: { n: number; title: string; img: HTMLCanvasElement }[] = [];
      let shape = { w: innerWidth, h: innerHeight };
      for (let k = 0; k < stops; k++) {
        if (ui.stop()) { stopped = true; break; }
        if (k > 0) { useUi.getState().go(k); await until(() => useUi.getState().pos.stop === k, 4000); }
        const title = stopName(k);
        ui.status(`${d.title}: stop ${k + 1} of ${stops} “${title}”`);
        await stillPage();
        const when = new Date(), drawn = await drawScreen(when);
        if (!drawn) { notes.push(`${d.title}: stop ${k + 1} could not be drawn`); done++; ui.progress(done, total); continue; }
        const jpg = await blobOf(drawn.canvas, 'image/jpeg', 0.86);
        shape = { w: drawn.canvas.width, h: drawn.canvas.height };
        const L = collageLayout(1, shape), thumb = document.createElement('canvas'); thumb.width = L.cellW * 2; thumb.height = L.cellH * 2;   // (twice the sheet's cell: a sharp one when the sheet is zoomed)
        thumb.getContext('2d')?.drawImage(drawn.canvas, 0, 0, thumb.width, thumb.height);
        drawn.canvas.width = 0; drawn.canvas.height = 0;   // (let the big picture go before the next)
        const base = `${dir}/${pad2(k + 1)}-${slug(title)}`;
        if (jpg) files.push({ name: `${base}.jpg`, data: await bytesOf(jpg) });
        files.push({ name: `${base}.json`, data: enc.encode(JSON.stringify({ deck: d.id, deckTitle: d.title, stop: k + 1, of: stops, title, ...drawn.record }, null, 1)) });
        thumbs.push({ n: k + 1, title, img: thumb });
        shots++; done++; ui.progress(done, total);
      }
      if (thumbs.length) {
        const png = await sheet(d.title, thumbs, shape);
        if (png) { const name = `${dir}-contact-sheet.png`; collages.push({ name, blob: png }); files.push({ name, data: await bytesOf(png) }); }
        decksDone++;
      }
      if (stopped) break;
    }
  } finally { if (talkOn()) leaveTalk(); }
  files.push({ name: 'README.txt', data: enc.encode([`Portal pressure simulator: every slide of every talk`, `Build: ${build}`, `Made: ${stampTime(at)} on ${innerWidth}x${innerHeight} at ${devicePixelRatio}x`, `${shots} slides in ${decksDone} talks${stopped ? ' (stopped early)' : ''}`, '', 'Each talk has a folder: one JPEG per slide and a JSON beside it (the link that reopens that exact view, the patient, the look, the camera, the sliders).', 'The contact sheets (one PNG per talk) sit at the top.', ...notes].join('\n')) });
  const commit = commitOf(import.meta.env.VITE_BUILD) || 'local';
  const stamp = `${at.getFullYear()}${pad2(at.getMonth() + 1)}${pad2(at.getDate())}-${pad2(at.getHours())}${pad2(at.getMinutes())}${pad2(at.getSeconds())}`;
  return { zip: zipBlob(files, at), zipName: `portal-pressure-all-decks-${commit}-${stamp}.zip`, collages, shots, decks: decksDone, stopped, notes };
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
