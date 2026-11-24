// ?audit on a Mac: "Capture" beside the self-test's own buttons. It takes the slides the form names (every slide, ticked ones, or a random 5, 10, 25) in each size ticked in the bar, one frame at a time (the
// way the self-test does: the app in an iframe at the device's size, `?audit=capture`, capture-child.ts), and joins every size's files into one zip, a folder a size, to save with a tap.
import { FRAME_DEVICES, fitScale } from '../frame/frame.ts';
import { flagValue, queryWithout, searchNow } from '../flags.ts';
import { builtinDecks, lazyDecks, loadBuiltin } from '../../../decks/registry.ts';
import { pickerUi, packPick } from './capture-pick.ts';
import { zipBlob, type ZipFile } from '../../capture/zip.ts';
import { commitOf } from '../../../boot/release.ts';
import type { CaptureMsg } from './capture-child.ts';
import { readBox } from '../../layout-snap.ts';
import { clock } from '../../../clock/frame.ts';
import { saveFiles } from '../../capture/save-files.ts';

/** The address of the app in a capture frame: the same path with the capture flags (and none of the self-test's). */
export function captureSrc(pathname: string, search: string, o: { speed: number; pick: string[] | null; decks: string[] | null }): string {
  const rest = queryWithout(search, ['audit', 'sizes', 'depth', 'parallel', 'speed', 'noglass', 'sequence', 'pick', 'only', 'decks']);
  return `${pathname}?audit=capture&speed=${o.speed}${o.pick ? `&pick=${packPick(o.pick)}` : ''}${o.decks ? `&decks=${o.decks.join(',')}` : ''}${rest ? `&${rest}` : ''}`;
}
/** The zip's file name: what, where and when. */
export const captureZipName = (commit: string, sizes: readonly string[], at: Date): string => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `portal-pressure-capture-${commit || 'local'}-${sizes.join('+')}-${at.getFullYear()}${p(at.getMonth() + 1)}${p(at.getDate())}-${p(at.getHours())}${p(at.getMinutes())}${p(at.getSeconds())}.zip`;
};

export interface OuterKit { doc: Document; win: Window; bar: HTMLElement; room: HTMLElement; status: HTMLElement; sizes(): string[]; speed(): number; busy(): boolean; setBusy(b: boolean): void }

export function addCaptureControls(k: OuterKit): void {
  const { doc, win, bar, room, status } = k;
  const decks = () => builtinDecks().map((d) => ({ id: d.id, title: d.title, slides: d.slides }));
  const picker = pickerUi(doc, decks);
  void Promise.all(lazyDecks().map((l) => loadBuiltin(l.id).catch(() => null))).then(() => picker.refresh());   // (the talks' data only: the app itself is started in the frames)
  const wrap = doc.createElement('div'); wrap.className = 'ao-cap'; wrap.style.cssText = 'flex:1 1 100%;display:flex;flex-wrap:wrap;gap:6px 10px;align-items:center';
  const b = (label: string, on: () => void) => { const e = doc.createElement('button'); e.type = 'button'; e.textContent = label; e.onclick = on; return e; };
  let stop = false, zip: { blob: Blob; name: string } | null = null;
  const go = b('Capture', () => { void run(); });
  const stopBtn = b('Stop', () => { stop = true; status.textContent = 'Stopping: the frame finishes its slide, then what is done is kept.'; });
  const save = b('Save zip', () => { if (zip) void saveFiles([new File([zip.blob], zip.name, { type: 'application/zip' })]); });
  save.hidden = true;
  wrap.append(picker.el, go, stopBtn, save); bar.append(wrap);

  /** What each size says now: the status shows them side by side. */
  const lines = new Map<string, string>();
  const say = (id: string, t: string) => { lines.set(id, t); status.textContent = [...lines.values()].join(' | '); };
  /** One size: a fresh frame, its files when it ends. */
  const one = (id: string, sel: { decks: string[] | null; pick: string[] | null }, speed: number, again = 0, of = 1): Promise<{ files: ZipFile[]; notes: string[]; why?: string }> => new Promise((done) => {
    const d = FRAME_DEVICES[id]!;
    const box = doc.createElement('div'), frame = doc.createElement('iframe'); box.className = 'ao-wrap'; frame.title = `${d.label} ${d.w}x${d.h}`;
    frame.src = captureSrc(win.location.pathname, searchNow(), { speed, pick: sel.pick, decks: sel.decks }) + (again ? `&retry=${again}-${new Date().getTime()}` : '');
    box.append(frame); room.append(box); box.style.margin = '0 6px';
    const r = readBox(room), s = fitScale(d.w, d.h, Math.max(1, (r.width - 24 - 12 * (of - 1)) / of), Math.max(1, r.height - 24));
    box.style.width = `${Math.round(d.w * s)}px`; box.style.height = `${Math.round(d.h * s)}px`;
    frame.style.width = `${d.w}px`; frame.style.height = `${d.h}px`; frame.style.transform = `scale(${s})`;
    let finished = false, silent = clock.after(() => end({ files: [], notes: [], why: 'silent for 5 minutes (the frame crashed or never booted)' }), 300000);
    const end = (res: { files: ZipFile[]; notes: string[]; why?: string }) => { if (finished) return; finished = true; clock.cancel(silent); clock.cancel(poll); win.removeEventListener('message', on); box.remove(); done(res); };
    const on = (e: MessageEvent) => {
      if (e.origin !== win.location.origin || e.source !== frame.contentWindow) return;
      const m = e.data as CaptureMsg | null; if (!m || typeof m !== 'object' || !('capture' in m)) return;
      clock.cancel(silent); silent = clock.after(() => end({ files: [], notes: [], why: 'silent for 5 minutes (the frame crashed or never booted)' }), 300000);
      if (m.capture === 'hello') say(id, `${d.label}: the app has started; capturing…`);
      else if (m.capture === 'progress') say(id, `${d.label}: ${m.text}`);
      else if (m.capture === 'done') end({ files: m.files, notes: m.notes });
      else if (m.capture === 'failed') end({ files: [], notes: [], why: m.why });
    };
    const poll = clock.every(() => { if (stop) { try { (frame.contentWindow as (Window & { pps?: { audit?: { stop(): void } } }) | null)?.pps?.audit?.stop(); } catch { /* same origin */ } } }, 1000);
    win.addEventListener('message', on);
  });

  async function run(): Promise<void> {
    if (k.busy()) return;
    const sel = picker.read(), ids = k.sizes();
    if (!ids.length) { status.textContent = 'Tick at least one size in the bar.'; return; }
    if (sel.none) { status.textContent = 'Tick at least one talk first.'; return; }
    k.setBusy(true); stop = false; zip = null; save.hidden = true; go.disabled = true;
    const at = new Date(), all: ZipFile[] = [], enc = new TextEncoder(), notes: string[] = [], speed = k.speed() > 1 ? k.speed() : 20;
    try {
      // every size at once, side by side in the room (a frame is its own page: its own clock, its own GPU canvas; a Mac holds well over six). Each size's pictures wait for its own frames, so the sizes slow one another a little and the whole run is about as long as the slowest.
      lines.clear(); room.textContent = '';
      const done = await Promise.all(ids.map(async (id) => {
        say(id, `${FRAME_DEVICES[id]!.label}: loading the app…`);
        let r = await one(id, sel, speed, 0, ids.length);
        // a frame that could not fetch a part of the app (a deploy landed while it started) is started again, up to twice, on a fresh address
        for (let again = 1; r.why && /module script|dynamically imported|Load failed|Failed to fetch/i.test(r.why) && again <= 2 && !stop; again++) { say(id, `${FRAME_DEVICES[id]!.label}: a part of the app would not load; trying again (${again} of 2)…`); r = await one(id, sel, speed, again, ids.length); }
        return { id, r };
      }));
      for (const { id, r } of done) {
        if (r.why) notes.push(`${FRAME_DEVICES[id]!.label}: ${r.why}`);
        for (const f of r.files) all.push({ name: `${id}/${f.name}`, data: f.data });
      }
      all.push({ name: 'README.txt', data: enc.encode([`Portal pressure simulator: captured on a computer at the sizes ${ids.join(', ')}`, `Taken: ${sel.words}`, `Build: ${buildOf()}`, `Made: ${at.toISOString()}`, 'One folder per size (each with its own README, pictures, state files and contact sheets).', ...notes].join('\n')) });
      zip = { blob: zipBlob(all, at), name: captureZipName(commitOf(import.meta.env.VITE_BUILD) || 'local', ids, at) };
      status.textContent = `${stop ? 'Stopped. ' : 'Done. '}${all.filter((f) => f.name.endsWith('.jpg')).length} pictures in ${ids.length} size${ids.length > 1 ? 's' : ''}. Tap Save zip.${notes.length ? ` ${notes.join('; ')}` : ''}`;
      save.hidden = false;
    } catch (e) { status.textContent = `Capture failed: ${String((e as Error)?.message ?? e)}`; }
    finally { k.setBusy(false); go.disabled = false; }
  }
  const buildOf = () => commitOf(import.meta.env.VITE_BUILD) || 'local';
  if (flagValue('audit') === 'frames' && flagValue('capture') === '1') clock.after(() => { void run(); }, 600);   // (an address that asks for it starts it)
}
