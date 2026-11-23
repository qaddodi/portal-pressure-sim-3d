// Settings > Capture screen: one PNG of the whole screen as the person sees it, for troubleshooting. The figure (the stage drawn once at the device's pixel ratio) and everything over it
// (cards, tags, legends, pills, the dock) laid in the order the page paints them (capture-dom.ts), the build and the time stamped small in the corner, and the state that makes the
// view (patient, slide, look, lens, camera, sliders) inside the file as a text chunk (png-text.ts) and as a link that reopens the exact view (share-wire.ts). A phone or an iPad hands the
// file to the share sheet (Save Image, Messages, Mail, Files); a laptop downloads it. The toast that follows offers the link. Runs on a tap or the shortcut, never in a frame.
import { figureShot } from '../../scene/figure-shot.ts';
import { clock } from '../../clock/frame.ts';
import { useShell } from '../shell/store.ts';
import { useEngine } from '../../engine/index.ts';
import { shareLinkNow } from '../shell/share-wire.ts';
import { FEEDBACK_SHEET_MS } from '../shell/feedback.ts';
import { feedbackBuild, commitOf } from '../../boot/release.ts';
import { CAPTURE } from '../shell/words.ts';
import { readBox, readStyle } from '../layout-snap.ts';
import { readScreen, paintScreen, loadMasks } from './capture-dom.ts';
import { captureScale, stampText, captureFileName, captureRecord, deliverWay, captureNote, deviceWords, type CaptureRecord } from './capture-model.ts';
import { useUi } from '../ui-store.ts';
import { useSettings } from '../../state/settings.ts';
import { UI } from '../strings.generated.ts';
import { pngWithText, asciiJson } from './png-text.ts';

const say = (text: string, tone?: 'info' | 'bad', action?: { label: string; run: () => void }) => useShell.getState().say(text, tone, action);
let busy = false;

/** The picture and what rides with it. Null when the page could not be drawn. */
export interface Made { blob: Blob; name: string; link: string; /** the text the toast's Copy puts on the clipboard: what was captured, with the link */ note: string }

async function stateRecord(): Promise<unknown> {
  try { const { stateNow } = await import('../debug/packet/sources.ts'); return stateNow(); } catch { return null; }
}

/** The screen drawn on one canvas, with what rides with it (the record, the build, the link). Null when the page could not be drawn. */
export interface Drawn { canvas: HTMLCanvasElement; record: CaptureRecord; build: string; link: string; scale: number }

/** The whole screen on one canvas at the device's pixel ratio (or `opts.ratio`), stamped. `at` is when it was pressed (the stamp and the record). */
export async function drawScreen(at: Date, opts: { ratio?: number; /** no build and time stamp in the corner (the talk's own pictures: the build is in the zip's README and each JSON) */ stamp?: boolean } = {}): Promise<Drawn | null> {
  const want = opts.ratio ?? devicePixelRatio;
  const root = document.getElementById('root') ?? document.body, rb = readBox(root);
  const vp = { w: rb.width, h: rb.height };
  if (vp.w <= 0 || vp.h <= 0) return null;
  let link = '';
  try { link = shareLinkNow(); } catch { link = location.href; }
  const build = feedbackBuild(import.meta.env.VITE_RELEASE, import.meta.env.VITE_BUILD, import.meta.env.VITE_CHANNEL);
  const record = captureRecord({ at, build, screen: `${innerWidth}x${innerHeight} at ${devicePixelRatio}x`, link, state: await stateRecord() });
  // the figure at the device's pixel ratio, drawn now (before anything can clear its canvas), then the page over it
  let taken: ReturnType<typeof figureShot.take> = null;
  try { taken = figureShot.take(captureScale(vp, want)); } catch { taken = null; }
  const s = taken ? taken.canvas.width / taken.css.w : captureScale(vp, want);
  const out = document.createElement('canvas'); out.width = Math.round(vp.w * s); out.height = Math.round(vp.h * s);
  const g = out.getContext('2d');
  if (!g) return null;
  g.setTransform(1, 0, 0, 1, 0, 0);
  const bs = readStyle(document.body);
  g.fillStyle = !bs.backgroundColor || bs.backgroundColor === 'transparent' || /,\s*0\)$/.test(bs.backgroundColor) ? (readStyle(document.documentElement).getPropertyValue('--bg').trim() || '#fff') : bs.backgroundColor;
  g.fillRect(0, 0, out.width, out.height);
  const items = readScreen(taken ? { x: taken.css.x, y: taken.css.y, w: taken.css.w, h: taken.css.h } : null, taken?.canvas ?? null);
  await loadMasks(items, (ms) => new Promise<void>((ok) => clock.after(ok, ms)));
  g.setTransform(s, 0, 0, s, -rb.left * s, -rb.top * s);
  paintScreen(g, items, s);
  if (opts.stamp !== false) {
  // the stamp: small, in the lower right corner, solid, with a thin halo of the ground so it reads over the figure and over a card
  g.setTransform(s, 0, 0, s, 0, 0);
  g.globalAlpha = 1; g.font = `500 ${Number.parseFloat(bs.getPropertyValue("--t-cap")) || 12}px ${bs.fontFamily}`; g.textAlign = 'right'; g.textBaseline = 'alphabetic';
  const words = stampText(build, at), x = vp.w - 6, y = vp.h - 5;
  g.lineJoin = 'round'; g.lineWidth = 2; g.strokeStyle = bs.backgroundColor && !/,\s*0\)$/.test(bs.backgroundColor) ? bs.backgroundColor : '#fff'; g.strokeText(words, x, y);
  g.fillStyle = bs.color; g.fillText(words, x, y);
  }
  return { canvas: out, record, build, link, scale: s };
}

/** The file's name for a capture of the screen as it is now. */
export function nameNow(at: Date): string {
  const sh = useShell.getState();
  return captureFileName(sh.view, useEngine.getState().presetId ?? sh.patientId, commitOf(import.meta.env.VITE_BUILD) || 'local', at);
}

/** The whole screen as one PNG with its state inside. */
export async function composeScreen(at: Date): Promise<Made | null> {
  const d = await drawScreen(at);
  if (!d) return null;
  const png = await new Promise<Blob | null>((ok) => d.canvas.toBlob(ok, 'image/png'));
  if (!png) return null;
  const bytes = pngWithText(new Uint8Array(await png.arrayBuffer()), 'portal-state', asciiJson(d.record));
  const name = nameNow(at);
  return { blob: new Blob([bytes as BlobPart], { type: 'image/png' }), link: d.link, name, note: noteFor(d.record, d.build, d.link, name, at) };
}

/** The text Copy gives: the deck and slide the person was on, the patient and look, the screen, the build, the time, the file and the link. */
function noteFor(rec: CaptureRecord, build: string, link: string, file: string, at: Date): string {
  const ui = useUi.getState(), sh = useShell.getState(), k = ui.pos.stop, st = ui.deck ? ui.stops[k] : undefined;
  const preset = useEngine.getState().presetId ?? sh.patientId, patient = UI.presets.find((p) => p.id === preset)?.label ?? preset;
  const state = (rec.state && typeof rec.state === 'object' ? rec.state : {}) as Record<string, unknown>;
  const part = (label: string, v: unknown) => (typeof v === 'string' && v ? `${label} ${v}` : '');
  const scenario = [patient ? `patient ${patient}` : '', part('look', useSettings.getState().look), part('lens', state.lens), part('view', sh.view)].filter(Boolean).join(', ');
  return captureNote({
    deck: ui.deck?.title, slideNo: ui.deck ? k + 1 : undefined, slideCount: ui.deck ? ui.stops.length : undefined,
    slideTitle: st ? (st.kind === 'slide' ? st.slide.title : st.kind) : undefined,
    scenario, device: deviceWords(innerWidth, innerHeight, devicePixelRatio), build, at, file, link,
  });
}

function copyNote(text: string): void {
  const done = () => say(CAPTURE.linkCopied), fail = () => say(CAPTURE.linkFailed, 'bad');
  if (!navigator.clipboard?.writeText) { fail(); return; }
  navigator.clipboard.writeText(text).then(done, fail);
}

function download(m: Made): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(m.blob); a.download = m.name;
  document.body.appendChild(a); a.click(); a.remove();
  clock.after(() => URL.revokeObjectURL(a.href), 10000);
}

/** Capture the screen and hand it over. `settle`: the Settings sheet is open (the tap came from it), so it is let go first and not in the picture. */
export async function captureScreen(opts: { settle?: boolean } = {}): Promise<void> {
  if (busy) return;
  busy = true;
  try {
    if (opts.settle) { useShell.getState().close(); await new Promise<void>((ok) => clock.after(ok, FEEDBACK_SHEET_MS)); }
    const made = await composeScreen(new Date());
    if (!made) { say(CAPTURE.failed, 'bad'); return; }
    const file = new File([made.blob], made.name, { type: 'image/png' });
    const way = deliverWay({ touchPoints: navigator.maxTouchPoints || 0, canShareFiles: !!navigator.canShare?.({ files: [file] }) });
    const withLink = (text: string) => say(text, 'info', { label: CAPTURE.copyLink, run: () => copyNote(made.note) });
    if (way === 'download') { download(made); withLink(CAPTURE.saved); return; }
    try { await navigator.share({ files: [file], title: CAPTURE.title }); withLink(CAPTURE.shared); }
    catch (e) {
      if ((e as { name?: string })?.name === 'AbortError') { withLink(CAPTURE.notShared); return; }   // (the sheet was closed: nothing was sent, the link is still there)
      // the tap's permission ran out before the picture was ready, or the sheet would not open: the picture waits for one more tap
      say(CAPTURE.ready, 'info', { label: CAPTURE.share, run: () => { navigator.share({ files: [file], title: CAPTURE.title }).then(() => withLink(CAPTURE.shared), (e2: unknown) => { if ((e2 as { name?: string })?.name === 'AbortError') return; download(made); withLink(CAPTURE.saved); }); } });
    }
  } catch (e) {
    console.warn('[capture] the screen could not be captured', e);
    say(CAPTURE.failed, 'bad');
  } finally { busy = false; }
}
