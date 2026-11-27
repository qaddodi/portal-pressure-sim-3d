// ?promotion (the preview copy and a local run, on a Mac): the promotion pictures. Give it slides (`deck:number`, one to a line) and it opens the app in a frame at each size ticked (a Mac window,
// an iPhone and an iPad upright), takes each slide the way the capture does (audit/capture-all.ts: settled, no PREVIEW tab, no build or debug marks, the Rich figure, 2x or 3x), lays every picture
// in a plain device outline under the app's logo and name (promo/frames.ts), and offers one zip: a folder a size. It does not start the app itself, and nothing is sent anywhere.
import { FRAME_DEVICES, fitScale } from '../frame/frame.ts';
import { flagValue, queryWithout, searchNow } from '../flags.ts';
import { packPick } from '../audit/capture-pick.ts';
import type { CaptureMsg } from '../audit/capture-child.ts';
import type { ZipFile } from '../../capture/zip.ts';
import { commitOf } from '../../../boot/release.ts';
import { clock } from '../../../clock/frame.ts';
import { readBox } from '../../layout-snap.ts';
import { frameSink, stopOverdue, STOP_GRACE_MS } from '../audit/capture-keep.ts';
import { openSession, idbBackend, type Session } from '../audit/capture-store.ts';
import { recoverUi } from '../audit/capture-recover.ts';
import { deliverUi } from '../audit/capture-deliver.ts';
import { layoutFor, drawComposite, FRAME_KIND, FRAME_SAFE, type Brand } from './frames.ts';
import { PROMO_SIZES, PROMO_RATIO, PROMO_SLIDES, PROMO_EXTRAS, parseSlides, slidesText, promoNameOf, baseOf, splitKeys } from './slides.ts';

/** The app's name as it stands on the pictures. */
export const BRAND_NAME = 'Portal Pressure Simulator';
const SILENT_MS = 300000;

/** The address of the app inside a frame: the capture child's (`?audit=capture`) with the promotion flags; the promotion page's own flags are dropped, any other kept. */
// (`safe`: the device's safe edges, top, right, bottom, left in CSS px, frames.ts FRAME_SAFE: the app in the frame lays out round the island and home bar as on the device; none when all are 0)
export function promoSrc(pathname: string, search: string, o: { keys: string[]; ratio: number; safe?: readonly number[] }): string {
  const rest = queryWithout(search, ['promotion', 'audit', 'sizes', 'pick', 'extras', 'speed', 'promo', 'decks', 'only', 'depth', 'parallel', 'safe']);
  const safe = o.safe && o.safe.some((n) => n > 0) ? `&safe=${o.safe.join(',')}` : '';
  // (the slides of the talks go in `pick`, a case at a stop and the menu's screens in `extras`; a run of extras alone has no `pick`, so the frame does not take every slide)
  const { slides, extras } = splitKeys(o.keys);
  return `${pathname}?audit=capture&promo=${o.ratio}${safe}${slides.length ? `&pick=${packPick(slides)}` : ''}${extras.length ? `&extras=${extras.join(',')}` : ''}${rest ? `&${rest}` : ''}`;
}
/** The sizes an address names (`sizes=mac,iphone`), or all three. */
export function promoSizes(v: string | null): string[] {
  const l = (v ?? '').split(',').map((s) => s.trim()).filter((s) => (PROMO_SIZES as readonly string[]).includes(s));
  return l.length ? l : [...PROMO_SIZES];
}

const CSS = `html,body{margin:0;height:100%}body{font:500 14px/1.4 system-ui,-apple-system,sans-serif;background:#101114;color:#ececee;display:flex;flex-direction:column}
.pr-bar{display:flex;flex-wrap:wrap;gap:8px 12px;align-items:flex-start;padding:12px 14px;background:#18191d;border-bottom:1px solid rgba(255,255,255,.14)}
.pr-bar textarea{flex:1 1 420px;min-height:150px;font:12px/1.4 ui-monospace,Menlo,monospace;background:#0e0f12;color:inherit;border:1px solid rgba(255,255,255,.2);border-radius:8px;padding:8px}
.pr-side{display:flex;flex-direction:column;gap:8px;min-width:200px}
.pr-bar button{font:inherit;font-weight:600;color:inherit;min-height:36px;padding:0 14px;border-radius:9px;border:1px solid rgba(255,255,255,.3);background:transparent}
.pr-bar button:disabled{opacity:.45}.pr-status{flex:1 1 100%;color:#b7b7bd}
.pr-segs{display:flex;gap:4px}.pr-segs button{flex:1 1 0;padding:0 8px}.pr-segs button[aria-pressed=true]{background:rgba(255,255,255,.22);border-color:transparent}
.pr-cap{font-size:12px;font-weight:600;letter-spacing:.04em;opacity:.6}
.pr-room{flex:1;min-height:200px;display:flex;align-items:center;justify-content:center;gap:12px;overflow:hidden;padding:12px}
.pr-wrap{position:relative;flex:none}.pr-wrap iframe{position:absolute;left:0;top:0;border:0;background:#fff;transform-origin:0 0;border-radius:6px}
.pr-out{display:flex;flex-wrap:wrap;gap:10px;padding:12px;overflow:auto}.pr-out figure{margin:0;width:200px}.pr-out img{width:100%;border-radius:6px;display:block}
.pr-out figcaption{font-size:11px;color:#b7b7bd;margin-top:3px;overflow-wrap:anywhere}`;

const blobOf = (c: HTMLCanvasElement, type: string, q?: number) => new Promise<Blob | null>((ok) => c.toBlob(ok, type, q));

/** The logo's picture (null when it cannot be had: the name stands alone) and the name's font, loaded before the first picture is drawn. */
async function brandNow(doc: Document): Promise<Brand> {
  const family = '"Source Serif 4", Georgia, serif';
  try { await doc.fonts.load(`600 40px ${family}`); } catch { /* the fallback serif draws */ }
  const mark = await new Promise<HTMLImageElement | null>((ok) => {
    const im = new Image(); im.onload = () => ok(im); im.onerror = () => ok(null);
    im.src = new URL('brand/mark.svg', doc.baseURI).href;
  });
  return { name: BRAND_NAME, mark, family };
}

export function bootPromotion(doc: Document = document, win: Window = window): void {
  const st = doc.createElement('style'); st.textContent = CSS; doc.head.append(st); doc.title = 'Promotion pictures';
  const mk = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = '') => { const e = doc.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; };
  const bar = mk('div', 'pr-bar'), room = mk('div', 'pr-room'), out = mk('div', 'pr-out'), side = mk('div', 'pr-side');
  const status = mk('div', 'pr-status', 'One picture to a line: deck:number, history:<case>[:<stop>] or overview[:tab]. Choose a device, press Make pictures, keep this tab in front.');
  status.setAttribute('role', 'status');
  const box = doc.createElement('textarea'); box.spellcheck = false; box.setAttribute('aria-label', 'Pictures to capture');
  const asked = parseSlides([flagValue('pick') ?? '', flagValue('extras') ?? ''].join(',').split(',').join('\n'));
  box.value = asked.keys.length ? asked.keys.join('\n') : slidesText();
  // which device: one of the three, or all three at once (the address's `sizes=` starts it on that choice)
  const first = promoSizes(flagValue('sizes'));
  let choice: string = first.length === PROMO_SIZES.length ? 'all' : first[0]!;
  const CHOICES: [string, string][] = [['iphone', 'iPhone'], ['ipad-portrait', 'iPad'], ['mac', 'Mac'], ['all', 'All three']];
  const picks = CHOICES.map(([id, label]) => {
    const b = mk('button', 'pr-seg', label); b.type = 'button';
    b.onclick = () => { choice = id; for (const [k, e] of picks) e.setAttribute('aria-pressed', String(k === id)); };
    return [id, b] as const;
  });
  for (const [k, e] of picks) e.setAttribute('aria-pressed', String(k === choice));
  const seg = mk('div', 'pr-segs'); seg.setAttribute('role', 'group'); seg.setAttribute('aria-label', 'Device to capture');
  seg.append(...picks.map(([, b]) => b));
  const chosen = (): string[] => (choice === 'all' ? [...PROMO_SIZES] : [choice]);
  let stop = false, stopAt = -1, running = false;
  const btn = (label: string, on: () => void) => { const b = mk('button', '', label); b.type = 'button'; b.onclick = on; return b; };
  const go = btn('Make pictures', () => { void run(); });
  const halt = btn('Stop', () => {
    stop = true; stopAt = clock.now();
    status.textContent = `Stopping: each frame finishes its slide, then what is done is kept (a frame that has not ended in ${STOP_GRACE_MS / 1000} s is cut off, keeping its finished pictures).`;
  });
  // (the finished run is offered by `deliver`: written straight to a file where the browser can, else as zips of a size Safari holds, one Save a part; audit/capture-deliver.ts)
  const deliver = deliverUi(doc);
  // (a run the page was ended in the middle of, or before its zip was saved, is offered back: the same store and the same recovery as the capture page)
  const recover = recoverUi(doc, (t) => { status.textContent = t; });
  void recover.refresh();
  side.append(mk('div', 'pr-cap', 'DEVICE'), seg, go, halt, deliver.el);
  bar.append(box, side, recover.el, status);
  doc.body.append(bar, room, out);

  const lines = new Map<string, string>();
  const say = (id: string, t: string) => { lines.set(id, t); status.textContent = [...lines.values()].join(' | '); };

  /** What a run stands on while its frames work: the store its pictures go to, the brand they are framed with, and what has been framed. */
  interface Ctx { session: Session; brand: Brand; keys: string[]; first: string; made: { n: number; key: string; title: string }[]; tried: Set<string>; notes: string[] }
  let ctx: Ctx | null = null;

  /** What a frame hands up (a talk's captures and state files, as it ends) is framed at once and only the finished JPEG is written to the store: the raw captures are never kept, and a page
   *  that is ended in the middle keeps every picture framed so far (Recover last capture). */
  const framer = (id: string) => async (fs: ZipFile[]): Promise<void> => {
    const c = ctx!, byName = new Map(fs.map((f) => [f.name, f.data])), label = FRAME_DEVICES[id]!.label;
    for (const [i, key] of c.keys.entries()) {
      const base = baseOf(key), png = byName.get(`${base}.png`);
      if (!png) continue;
      c.tried.add(`${id}|${key}`);
      let title = '';
      try { title = String((JSON.parse(new TextDecoder().decode(byName.get(`${base}.json`))) as { title?: string }).title ?? ''); } catch { /* no state file: the name has no title */ }
      say(id, `${label}: framing ${key}`);
      const jpg = await compose(id, png, c.brand);
      if (!jpg) { c.notes.push(`${label}: ${key} could not be framed`); continue; }
      const name = promoNameOf(i + 1, key, title, id);
      await c.session.add([{ name: `${id}/${name}`, data: new Uint8Array(await jpg.arrayBuffer()) }]);
      const fig = mk('figure'), im = doc.createElement('img'), cap = mk('figcaption', '', `${id}/${name}`);
      im.src = URL.createObjectURL(jpg); im.alt = title; fig.append(im, cap); out.append(fig);
      if (id === c.first) c.made.push({ n: i + 1, key, title });
    }
  };

  /** One size: a fresh frame at the device's size; its pictures are framed and written to the store as its talks end, and it says how many it gave when it ends. */
  const one = (id: string, keys: string[], again: number, of: number): Promise<{ notes: string[]; why?: string; count: number }> => new Promise((done) => {
    const d = FRAME_DEVICES[id]!, wrap = mk('div', 'pr-wrap'), frame = doc.createElement('iframe'); frame.title = `${d.label} ${d.w}x${d.h}`;
    frame.src = promoSrc(win.location.pathname, searchNow(), { keys, ratio: PROMO_RATIO[id]!, safe: FRAME_SAFE[id] }) + (again ? `&retry=${again}-${new Date().getTime()}` : '');
    wrap.append(frame); room.append(wrap);
    const r = readBox(room), s = fitScale(d.w, d.h, Math.max(1, (r.width - 24 - 12 * (of - 1)) / of), Math.max(1, r.height - 24));
    wrap.style.width = `${Math.round(d.w * s)}px`; wrap.style.height = `${Math.round(d.h * s)}px`;
    frame.style.width = `${d.w}px`; frame.style.height = `${d.h}px`; frame.style.transform = `scale(${s})`;
    type Res = { files: ZipFile[]; notes: string[]; why?: string };
    // (the files a frame hands up as it goes, and the ones it ends with: a frame that crashes or is cut off after Stop still gives what it had finished)
    const kept = frameSink(framer(id), '');
    let finished = false, silent = clock.after(() => end({ files: [], notes: [], why: 'silent for 5 minutes (the frame crashed or never booted)' }), SILENT_MS);
    const end = (res: Res) => {
      if (finished) return;
      finished = true; clock.cancel(silent); clock.cancel(poll); win.removeEventListener('message', on); wrap.remove();
      void kept.end(res).then(done);
    };
    const on = (e: MessageEvent) => {
      if (e.origin !== win.location.origin || e.source !== frame.contentWindow) return;
      const m = e.data as CaptureMsg | null; if (!m || typeof m !== 'object' || !('capture' in m)) return;
      clock.cancel(silent); silent = clock.after(() => end({ files: [], notes: [], why: 'silent for 5 minutes (the frame crashed or never booted)' }), SILENT_MS);
      if (m.capture === 'hello') say(id, `${d.label}: the app has started`);
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

  /** One captured screen laid in its device: a JPEG of the finished picture. */
  async function compose(id: string, png: Uint8Array, brand: Brand): Promise<Blob | null> {
    const img = await createImageBitmap(new Blob([png as BlobPart], { type: 'image/png' }));
    const L = layoutFor(FRAME_KIND[id]!, img.width, img.height);
    const c = doc.createElement('canvas'); c.width = L.w; c.height = L.h;
    const g = c.getContext('2d'); if (!g) return null;
    drawComposite(g, L, img, brand);
    img.close();
    const jpg = await blobOf(c, 'image/jpeg', 0.92);
    c.width = 0; c.height = 0;
    return jpg;
  }

  async function run(): Promise<void> {
    if (running) return;
    const { keys, bad } = parseSlides(box.value), ids = chosen();
    if (bad.length) { status.textContent = `These are not deck:number, history:<case>[:<stop>] or overview[:<tab>], so nothing was made: ${bad.join(', ')}`; return; }
    if (!keys.length) { status.textContent = 'Type at least one picture, as deck:number, history:<case>[:<stop>] or overview.'; return; }
    running = true; stop = false; stopAt = -1; deliver.clear(); go.disabled = true; room.textContent = ''; out.textContent = ''; lines.clear();
    const at = new Date(), enc = new TextEncoder(), notes: string[] = [], build = commitOf(import.meta.env.VITE_BUILD) || 'local';
    const zipName = `portal-pressure-promotion-${build}-${at.getTime()}.zip`;
    try {
      const brand = await brandNow(doc);
      // (every picture is framed and written to the device's storage as its talk ends, and the page keeps only the names: the same store as the capture page, so a page the browser ends keeps the run)
      const session = await openSession(await idbBackend().catch(() => null), {
        startedAt: at.toISOString(), build, words: `promotion pictures: ${keys.length} pictures at ${ids.join(', ')}`, sizes: ids, zipName,
      });
      const c: Ctx = { session, brand, keys, first: ids[0]!, made: [], tried: new Set(), notes };
      ctx = c;
      // every size at once, side by side (each frame is its own page with its own clock and GPU canvas); a frame that could not fetch a part of the app (a deploy landed) starts again, up to twice
      const done = await Promise.all(ids.map(async (id) => {
        say(id, `${FRAME_DEVICES[id]!.label}: loading the app…`);
        let r = await one(id, keys, 0, ids.length);
        for (let again = 1; r.why && /module script|dynamically imported|Load failed|Failed to fetch/i.test(r.why) && again <= 2 && !stop; again++) r = await one(id, keys, again, ids.length);
        return { id, r };
      }));
      room.textContent = '';
      for (const { id, r } of done) {
        const label = FRAME_DEVICES[id]!.label;
        if (r.why) notes.push(`${label}: ${r.why}`);
        notes.push(...r.notes.map((n) => `${label}: ${n}`));
        for (const key of keys) if (!c.tried.has(`${id}|${key}`)) notes.push(`${label}: ${key} was not captured`);
      }
      if (session.degraded) notes.push(`NOTE: the device's storage would not take the pictures (${session.degraded}); they were held in memory, and a crash would lose them`);
      const why = new Map([...PROMO_SLIDES.map((s) => [`${s.deck}:${s.slide}`, s.why] as const), ...PROMO_EXTRAS.map((x) => [x.key, x.why] as const)]);
      const made = [...c.made].sort((a, b) => a.n - b.n);
      const list = made.flatMap((m) => [`${String(m.n).padStart(2, '0')}. ${m.key}  ${m.title}`, why.has(m.key) ? `    ${why.get(m.key)}` : ''].filter(Boolean));
      const readme = [
        `${BRAND_NAME}: promotion pictures`, `Build: ${build}`, `Made: ${at.toISOString()}`,
        `Sizes: ${ids.map((i) => `${i} at ${PROMO_RATIO[i]}x`).join(', ')}`, 'One folder per size; each file is numbered by its place in the list below.', '', ...list, '', ...notes,
      ].join('\n');
      await session.add([{ name: 'README.txt', data: enc.encode(readme) }]);
      await session.finish(stop ? 'stopped' : 'finished');
      status.textContent = `${stop ? 'Stopped. ' : 'Done. '}${session.names().filter((n) => n.endsWith('.jpg')).length} pictures. Tap Save.${notes.length ? ` ${notes.join('; ')}` : ''}`;
      // (no zip is made here: the delivery makes each from storage when it is saved, so the page never holds the whole of it)
      deliver.offer(session, zipName, at, () => { void session.saved(); });
    } catch (e) { status.textContent = `The pictures could not be made: ${String((e as Error)?.message ?? e)}`; }
    finally { running = false; ctx = null; go.disabled = false; }
  }
}
