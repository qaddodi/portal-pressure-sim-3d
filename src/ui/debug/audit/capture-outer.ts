// ?audit on a Mac: "Capture" beside the self-test's own buttons. It takes the slides the form names (every slide, ticked ones, or a random 5, 10, 25) in each size ticked in
// the bar, one frame at a time (the
// way the self-test does: the app in an iframe at the device's size, `?audit=capture`, capture-child.ts), and joins every size's files into one zip, a folder a size, to save with a tap.
import { FRAME_DEVICES, fitScale } from '../frame/frame.ts';
import { flagValue, queryWithout, searchNow } from '../flags.ts';
import { builtinDecks, lazyDecks, loadBuiltin } from '../../../decks/registry.ts';
import { pickerUi, packPick } from './capture-pick.ts';
import { pickFromSearch } from './capture-request.ts';
import { appWorld } from '../request/world.ts';
import { whatUi } from './capture-what.ts';
import { frameSink, stopOverdue, STOP_GRACE_MS } from './capture-keep.ts';
import { openSession, idbBackend, type Session } from './capture-store.ts';
import { recoverUi } from './capture-recover.ts';
import { deliverUi } from './capture-deliver.ts';
import { whatOf, joinManifests, manifestJson, type CaptureWhat, type Manifest } from './capture-cases-plan.ts';
import type { ZipFile } from '../../capture/zip.ts';
import { commitOf } from '../../../boot/release.ts';
import type { CaptureMsg } from './capture-child.ts';
import { readBox } from '../../layout-snap.ts';
import { clock } from '../../../clock/frame.ts';

/** The address of the app in a capture frame: the same path with the capture flags (and none of the self-test's). */
export function captureSrc(pathname: string, search: string, o: { speed: number; pick: string[] | null; decks: string[] | null; what?: CaptureWhat; cases?: string | null }): string {
  const rest = queryWithout(search, ['audit', 'sizes', 'depth', 'parallel', 'speed', 'noglass', 'sequence', 'pick', 'only', 'decks', 'cases', 'slides', 'req']);
  const what = o.what ?? 'slides', cases = what === 'slides' ? '' : `&cases=${o.cases && /^[\w,-]+$/.test(o.cases) ? o.cases : 'all'}${what === 'both' ? '&slides=1' : ''}`;
  // (cases alone take no slide pick: a pick or a talk list in the address would add the slides)
  const slides = what === 'cases' ? '' : `${o.pick ? `&pick=${packPick(o.pick)}` : ''}${o.decks ? `&decks=${o.decks.join(',')}` : ''}`;
  return `${pathname}?audit=capture&speed=${o.speed}${slides}${cases}${rest ? `&${rest}` : ''}`;
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
  // (an address that names cases starts on them: `?audit=frames&capture=1&cases=all`, and `&slides=1` for both)
  const casesFlag = flagValue('cases'), what = whatUi(doc, whatOf({ cases: !!casesFlag, slides: flagValue('slides'), pick: !!flagValue('pick'), decks: !!flagValue('decks') }));
  void Promise.all(lazyDecks().map((l) => loadBuiltin(l.id).catch(() => null))).then(() => picker.refresh());   // (the talks' data only: the app itself is started in the frames)
  const wrap = doc.createElement('div'); wrap.className = 'ao-cap'; wrap.style.cssText = 'flex:1 1 100%;display:flex;flex-wrap:wrap;gap:6px 10px;align-items:center';
  const b = (label: string, on: () => void) => { const e = doc.createElement('button'); e.type = 'button'; e.textContent = label; e.onclick = on; return e; };
  let stop = false, stopAt = -1, session: Session | null = null;
  const go = b('Capture', () => { void run(); });
  const stopBtn = b('Stop', () => {
    stop = true; stopAt = clock.now();
    status.textContent = `Stopping: each frame finishes its slide, then what is done in every size is kept and Save zip comes (a frame that has not ended in ${STOP_GRACE_MS / 1000} s is cut off, keeping its finished talks).`;
  });
  // (the finished run is offered here: written straight to a file where the browser can, else as zips of a size Safari holds, one Save a part; capture-deliver.ts)
  const deliver = deliverUi(doc);
  // (a capture the page was ended in the middle of, or before its zip was saved, is offered back: capture-store.ts)
  const recover = recoverUi(doc, (t) => { status.textContent = t; });
  void recover.refresh();
  wrap.append(recover.el, what.el, picker.el, go, stopBtn, deliver.el); bar.append(wrap);

  /** What each size says now: the status shows them side by side. */
  const lines = new Map<string, string>();
  const say = (id: string, t: string) => { lines.set(id, t); status.textContent = [...lines.values()].join(' | '); };
  /** One size: a fresh frame; its files go to the session as they arrive, and it says how many it gave when it ends. */
  type Sel = { decks: string[] | null; pick: string[] | null; what: CaptureWhat };
  const one = (id: string, sel: Sel, speed: number, again = 0, of = 1): Promise<{ count: number; notes: string[]; why?: string }> => new Promise((done) => {
    const d = FRAME_DEVICES[id]!;
    const box = doc.createElement('div'), frame = doc.createElement('iframe'); box.className = 'ao-wrap'; frame.title = `${d.label} ${d.w}x${d.h}`;
    const q = { speed, pick: sel.pick, decks: sel.decks, what: sel.what, cases: casesFlag };
    frame.src = captureSrc(win.location.pathname, searchNow(), q) + (again ? `&retry=${again}-${new Date().getTime()}` : '');
    box.append(frame); room.append(box); box.style.margin = '0 6px';
    const r = readBox(room), s = fitScale(d.w, d.h, Math.max(1, (r.width - 24 - 12 * (of - 1)) / of), Math.max(1, r.height - 24));
    box.style.width = `${Math.round(d.w * s)}px`; box.style.height = `${Math.round(d.h * s)}px`;
    frame.style.width = `${d.w}px`; frame.style.height = `${d.h}px`; frame.style.transform = `scale(${s})`;
    // (every file the frame handed up as its talks ended, and the ones it ends with: a frame that crashes, hangs or is cut off after Stop still gives what it had finished)
    const kept = frameSink((fs) => session!.add(fs), `${id}/`);
    let finished = false, silent = clock.after(() => end({ files: [], notes: [], why: 'silent for 5 minutes (the frame crashed or never booted)' }), 300000);
    const end = (res: { files: ZipFile[]; notes: string[]; why?: string }) => {
      if (finished) return;
      finished = true; clock.cancel(silent); clock.cancel(poll); win.removeEventListener('message', on); box.remove();
      void kept.end(res).then(done);
    };
    const on = (e: MessageEvent) => {
      if (e.origin !== win.location.origin || e.source !== frame.contentWindow) return;
      const m = e.data as CaptureMsg | null; if (!m || typeof m !== 'object' || !('capture' in m)) return;
      clock.cancel(silent); silent = clock.after(() => end({ files: [], notes: [], why: 'silent for 5 minutes (the frame crashed or never booted)' }), 300000);
      if (m.capture === 'hello') say(id, `${d.label}: the app has started; capturing…`);
      else if (m.capture === 'progress') say(id, `${d.label}: ${m.text}`);
      else if (m.capture === 'part') kept.add(m.files);
      else if (m.capture === 'done') end({ files: m.files, notes: m.notes });
      else if (m.capture === 'failed') end({ files: [], notes: [], why: m.why });
    };
    const poll = clock.every(() => {
      if (stop && stopOverdue(stopAt, clock.now())) { end({ files: [], notes: [], why: `it did not stop within ${STOP_GRACE_MS / 1000} s of Stop` }); return; }
      if (stop) { try { (frame.contentWindow as (Window & { pps?: { audit?: { stop(): void } } }) | null)?.pps?.audit?.stop(); } catch { /* same origin */ } } }, 1000);
    win.addEventListener('message', on);
  });

  async function run(): Promise<void> {
    if (k.busy()) return;
    // (an address that carries a request, `&req=random:10@4471`, picks the slides and, with `layout:`, the sizes: the seed is printed in the README)
    const asked = pickFromSearch(searchNow(), appWorld());
    if (asked && !asked.ok) { status.textContent = `Request not understood: ${asked.error}`; return; }
    const sel0 = asked ? asked.sel : picker.read(), ids = asked?.sel.sizes?.filter((z) => Object.hasOwn(FRAME_DEVICES, z)) ?? k.sizes(), sel = { ...sel0, what: what.read() };
    if (!ids.length) { status.textContent = 'Tick at least one size in the bar.'; return; }
    if (sel.none && sel.what !== 'cases') { status.textContent = 'Tick at least one talk first.'; return; }
    k.setBusy(true); stop = false; stopAt = -1; deliver.clear(); go.disabled = true;
    const at = new Date(), enc = new TextEncoder(), notes: string[] = [], speed = k.speed() > 1 ? k.speed() : 20;
    const zipName = captureZipName(commitOf(import.meta.env.VITE_BUILD) || 'local', ids, at);
    const takenWords = sel.what === 'cases' ? 'every history case, played' : sel.what === 'both' ? `${sel.words}, and every history case played` : sel.words;
    // (every picture is written to the device's storage as its talk ends and the page keeps only the names: a page the browser ends keeps the capture, and "Recover last capture" offers it back)
    const sess = session = await openSession(await idbBackend().catch(() => null), { startedAt: at.toISOString(), build: buildOf(), words: takenWords, sizes: ids, zipName });
    try {
      // every size at once, side by side in the room (a frame is its own page: its own clock, its own GPU canvas; a Mac holds well over six). Each size's pictures wait for its
      // own frames, so the sizes slow one another a little and the whole run is about as long as the slowest.
      lines.clear(); room.textContent = '';
      const done = await Promise.all(ids.map(async (id) => {
        say(id, `${FRAME_DEVICES[id]!.label}: loading the app…`);
        let r = await one(id, sel, speed, 0, ids.length);
        // a frame that could not fetch a part of the app (a deploy landed while it started) is started again, up to twice, on a fresh address
        for (let again = 1; r.why && /module script|dynamically imported|Load failed|Failed to fetch/i.test(r.why) && again <= 2 && !stop; again++) { say(id, `${FRAME_DEVICES[id]!.label}: a part of the app would not load; trying again (${again} of 2)…`); r = await one(id, sel, speed, again, ids.length); }
        return { id, r };
      }));
      const manifests: Record<string, Manifest> = {};
      for (const { id, r } of done) {
        if (r.why) notes.push(`${FRAME_DEVICES[id]!.label}: ${r.why}`);
        // (a size that played the cases has a manifest of them: the zip's own, at the top, joins every size's)
        const raw = await sess.read(`${id}/cases/manifest.json`);
        if (!raw) continue;
        try { manifests[id] = JSON.parse(new TextDecoder().decode(raw)) as Manifest; } catch { notes.push(`${FRAME_DEVICES[id]!.label}: its cases manifest could not be read`); }
      }
      if (sess.degraded) notes.push(`NOTE: the device's storage would not take the pictures (${sess.degraded}); they were held in memory, and a crash would lose them`);
      const extra: ZipFile[] = [];
      if (Object.keys(manifests).length) extra.push({ name: 'cases-manifest.json', data: enc.encode(manifestJson(joinManifests(manifests))) });
      const readme = [
        `Portal pressure simulator: captured on a computer at the sizes ${ids.join(', ')}`, `Taken: ${takenWords}`, `Build: ${buildOf()}`, `Made: ${at.toISOString()}`,
        'One folder per size (each with its own README, pictures, state files and contact sheets).', ...notes,
      ];
      extra.push({ name: 'README.txt', data: enc.encode(readme.join('\n')) });
      await sess.add(extra);
      await sess.finish(stop ? 'stopped' : 'finished');
      const pictures = sess.names().filter((n) => /\.(jpg|png)$/.test(n) && !n.endsWith('contact-sheet.png')).length;
      status.textContent = `${stop ? 'Stopped. ' : 'Done. '}${pictures} pictures in ${ids.length} size${ids.length > 1 ? 's' : ''}. Tap Save.${notes.length ? ` ${notes.join('; ')}` : ''}`;
      // (no zip is made here: the delivery makes each from storage when it is saved, so the page never holds the whole of it)
      deliver.offer(sess, zipName, at, () => { void sess.saved(); });
    } catch (e) { status.textContent = `Capture failed: ${String((e as Error)?.message ?? e)}`; }
    finally { k.setBusy(false); go.disabled = false; }
  }
  const buildOf = () => commitOf(import.meta.env.VITE_BUILD) || 'local';
  if (flagValue('audit') === 'frames' && flagValue('capture') === '1') clock.after(() => { void run(); }, 600);   // (an address that asks for it starts it)
}
