// ?stress (the preview copy and a local run, on any device): the stress capture's page. One button. It opens the app in a frame at each layout's size, ONE FRAME AT A TIME (a phone holds one WebGL
// page well and not three), takes the plan's pictures in it (stress/run.ts, through the capture frame audit/capture-child.ts) and ends in one small zip: the pictures by layout (pictures/<layout>/)
// and the audit's one zip format (README-FIRST, REPORT, sections, findings.json, manifest.json: request/bundle.ts, request/gpu.ts).
// A bar shows the percentage and the time left; nothing else is shown of the work. The files go to the device's own storage as they are made,
// so a page the browser ends keeps the run (Recover last capture), and the zip is saved the way every capture is (audit/capture-deliver.ts).
import { FRAME_DEVICES, fitScale } from '../frame/frame.ts';
import { flagValue, queryWithout, searchNow, flagOn } from '../flags.ts';
import type { CaptureMsg } from '../audit/capture-child.ts';
import type { ZipFile } from '../../capture/zip.ts';
import { commitOf } from '../../../boot/release.ts';
import { clock } from '../../../clock/frame.ts';
import { readBox } from '../../layout-snap.ts';
import { frameSink, stopOverdue, STOP_GRACE_MS } from '../audit/capture-keep.ts';
import { openSession, idbBackend } from '../audit/capture-store.ts';
import { recoverUi } from '../audit/capture-recover.ts';
import { deliverUi } from '../audit/capture-deliver.ts';
import { pace } from '../audit/progress.ts';
import { FRAME_SAFE } from '../promo/frames.ts';
import { STRESS_LAYOUTS, PICTURE_CAP, DEFAULT_PLAN, planFromSearch, stressSteps, stressPictures, layoutSteps, stressFlag, type StressLayout } from './plan.ts';
import { appWorld } from '../request/world.ts';
import { shotsOf, isProblem, PICTURES, type LayoutRun, type Entry } from './report.ts';
import { pictureScope, unifiedFiles } from '../request/gpu.ts';

const SILENT_MS = 300000;

/** The address of the app in a frame: the capture frame asked for one layout's stress run; this page's own flags are dropped. */
export function stressSrc(pathname: string, search: string, l: StressLayout): string {
  const rest = queryWithout(search, ['stress', 'go', 'layouts', 'audit', 'safe', 'sizes', 'pick', 'speed', 'promo', 'decks', 'only', 'cases', 'slides', 'extras']);
  const safe = FRAME_SAFE[l.id], s = safe && safe.some((n) => n > 0) ? `&safe=${safe.join(',')}` : '';
  return `${pathname}?audit=capture&${stressFlag(l)}${s}${rest ? `&${rest}` : ''}`;
}
/** The layouts an address names (`layouts=iphone,mac`), or all of them. */
export function stressLayouts(v: string | null): StressLayout[] {
  const want = (v ?? '').split(',').map((x) => x.trim()).filter(Boolean), l = STRESS_LAYOUTS.filter((x) => want.includes(x.id));
  return l.length ? l : [...STRESS_LAYOUTS];
}

const CSS = `html,body{margin:0;min-height:100%}body{font:500 15px/1.45 system-ui,-apple-system,sans-serif;background:#101114;color:#ececee;display:flex;flex-direction:column}
.st-main{padding:16px;display:flex;flex-direction:column;gap:12px;max-width:560px}
.st-main h1{font:600 20px/1.2 system-ui,sans-serif;margin:0}.st-main p{margin:0;color:#b7b7bd}
.st-main button{font:inherit;font-weight:600;color:inherit;min-height:44px;padding:0 18px;border-radius:10px;border:1px solid rgba(255,255,255,.3);background:transparent}
.st-main button:disabled{opacity:.45}.st-row{display:flex;gap:10px;flex-wrap:wrap}
.st-bar{height:10px;border-radius:5px;background:rgba(255,255,255,.14);overflow:hidden}.st-fill{height:100%;width:0;background:#7fb6ff;transition:width .4s ease}
.st-note{color:#b7b7bd;font-size:13px;overflow-wrap:anywhere}
.st-room{flex:1;min-height:160px;display:flex;align-items:center;justify-content:center;overflow:hidden;padding:8px}
.st-wrap{position:relative;flex:none}.st-wrap iframe{position:absolute;left:0;top:0;border:0;background:#fff;transform-origin:0 0;border-radius:6px}`;

export function bootStress(doc: Document = document, win: Window = window): void {
  const st = doc.createElement('style'); st.textContent = CSS; doc.head.append(st); doc.title = 'Stress capture';
  const mk = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = '') => { const e = doc.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; };
  // (an address that carries a request, `&req=feature:junctions`, replaces the key slides: request/address.ts; a request that cannot be read stops here and says why, it is never guessed at)
  const asked = planFromSearch(searchNow(), appWorld());
  const plan = asked?.ok ? asked.plan : DEFAULT_PLAN;
  const layouts = asked?.ok ? asked.layouts : stressLayouts(flagValue('layouts')), total = stressSteps(layouts, plan);
  const main = mk('div', 'st-main'), room = mk('div', 'st-room');
  const bar = mk('div', 'st-bar'), fill = mk('div', 'st-fill'); bar.append(fill); bar.setAttribute('role', 'progressbar'); bar.setAttribute('aria-valuemin',
    '0'); bar.setAttribute('aria-valuemax', '100'); bar.setAttribute('aria-valuenow', '0');
  const seedWords = plan.random ? `, seed ${plan.random.seed} (ask for the same slides again with random:${plan.random.n}@${plan.random.seed}${plan.random.spread ? '/deck' : ''})` : '';
  const said = !asked ? '' : !asked.ok ? `Request not understood: ${asked.error}. `
    : `Request ${plan.request}${seedWords}: ${plan.slides.length} slides. ${asked.dropped.length ? `Not stress layouts, left out: ${asked.dropped.join(', ')}. ` : ''}`;
  const status = mk('div', 'st-note', `${said}About ${stressPictures(layouts, plan)} pictures (at most ${PICTURE_CAP}) in ${layouts.map((l) => l.label).join(', ')},`
    + ' with a written report, in one zip. Keep this tab in front.');
  status.setAttribute('role', 'status');
  const go = mk('button', '', 'Start stress capture'), halt = mk('button', '', 'Stop');
  go.type = 'button'; halt.type = 'button'; go.disabled = !!asked && !asked.ok;
  const deliver = deliverUi(doc), recover = recoverUi(doc, (t) => { status.textContent = t; });
  void recover.refresh();
  const row = mk('div', 'st-row'); row.append(go, halt);
  main.append(mk('h1', '', 'Stress capture'), mk('p', '', 'Key slides, frames inside the main transitions, the menus and sheets, in each layout, and a written report. '
    + 'The zip is small enough to save from a phone.'),
  
    row, bar, status, recover.el, deliver.el);
  doc.body.append(main, room);

  let stop = false, stopAt = -1, running = false;
  go.onclick = () => { void run(); };
  halt.onclick = () => {
    stop = true; stopAt = clock.now();
    status.textContent = `Stopping: the frame finishes its picture, then what is done is kept (a frame that has not ended in ${STOP_GRACE_MS / 1000} s is cut off, keeping its pictures).`;
  };

  /** One layout: a fresh frame at its size, its files written to the store as they arrive. */
  const one = (l: StressLayout, again: number, onProgress: (n: number) => void): Promise<{ why?: string; count: number; notes: string[] }> => new Promise((done) => {
    const d = FRAME_DEVICES[l.id]!, wrap = mk('div', 'st-wrap'), frame = doc.createElement('iframe'); frame.title = `${d.label} ${d.w}x${d.h}`;
    frame.src = stressSrc(win.location.pathname, searchNow(), l) + (again ? `&retry=${again}-${new Date().getTime()}` : '');
    wrap.append(frame); room.append(wrap);
    const r = readBox(room), s = fitScale(d.w, d.h, Math.max(1, r.width - 16), Math.max(1, r.height - 16));
    wrap.style.width = `${Math.round(d.w * s)}px`; wrap.style.height = `${Math.round(d.h * s)}px`;
    frame.style.width = `${d.w}px`; frame.style.height = `${d.h}px`; frame.style.transform = `scale(${s})`;
    const kept = frameSink((fs) => session!.add(fs), `${PICTURES}/${l.id}/`);
    type Res = { files: ZipFile[]; notes: string[]; why?: string };
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
      if (m.capture === 'progress') onProgress(m.n);
      else if (m.capture === 'part') kept.add(m.files);
      else if (m.capture === 'done') end({ files: m.files, notes: m.notes });
      else if (m.capture === 'failed') end({ files: [], notes: [], why: m.why });
    };
    const poll = clock.every(() => {
      if (stop && stopOverdue(stopAt, clock.now())) { end({ files: [], notes: [], why: `it did not stop within ${STOP_GRACE_MS / 1000} s of Stop` }); return; }
      if (stop) { try { (frame.contentWindow as (Window & { pps?: { audit?: { stop(): void } } }) | null)?.pps?.audit?.stop(); } catch { /* same origin */ } }
    }, 1000);
    win.addEventListener('message', on);
  });

  let session: Awaited<ReturnType<typeof openSession>> | null = null;

  async function run(): Promise<void> {
    if (running) return;
    running = true; stop = false; stopAt = -1; deliver.clear(); go.disabled = true; room.textContent = '';
    const at = new Date(), dec = new TextDecoder(), build = commitOf(import.meta.env.VITE_BUILD) || 'local', started = new Date().getTime();
    const zipName = `portal-pressure-stress-${build}-${at.getTime()}.zip`;
    const show = (n: number, done = false): void => {
      const p = pace(n, total, started, new Date().getTime(), done);
      fill.style.width = `${p.pct}%`; bar.setAttribute('aria-valuenow', String(p.pct)); status.textContent = p.text;
    };
    try {
      show(0);
      const askedWords = plan.request ? `, request ${plan.request}${plan.random ? ` (seed ${plan.random.seed})` : ''}` : '';
      session = await openSession(await idbBackend().catch(() => null), {
        startedAt: at.toISOString(), build, words: `stress capture: ${layouts.map((l) => l.label).join(', ')}${askedWords}`, sizes: layouts.map((l) => l.id), zipName,
      });
      const runs: LayoutRun[] = [], why: string[] = [];
      let before = 0;
      for (const l of layouts) {
        if (stop) break;
        let r = await one(l, 0, (n) => show(before + n));
        // a frame that could not fetch a part of the app (a deploy landed while it started) is started again, up to twice
        for (let again = 1; r.why && /module script|dynamically imported|Load failed|Failed to fetch/i.test(r.why) && again <= 2 && !stop; again++) r = await one(l, again, (n) => show(before + n));
        before += layoutSteps(l, plan);
        show(before);
        room.textContent = '';
        if (r.why) why.push(`${l.label}: ${r.why}`);
        // the layout's own entries (the frame hands them up when it ends); a frame that did not end gives its pictures with no checks
        const dir = `${PICTURES}/${l.id}/`, raw = await session.read(`${dir}entries.json`);
        let run: LayoutRun | null = null;
        if (raw) { try { run = JSON.parse(dec.decode(raw)) as LayoutRun; } catch { run = null; } }
        if (!run) {
          const entries: Entry[] = session.names().filter((n) => n.startsWith(dir) && /\.(jpg|png)$/.test(n)).map((n) => {
            const file = n.slice(dir.length), section = file.startsWith('slides/') ? 'slides' : file.startsWith('moves/') ? 'moves' : 'menus';
            return { section, layout: l.label, file, title: file, state: 'the frame did not finish: no state was recorded', checks: [], issues: ['no checks were recorded for this picture'] } as Entry;
          });
          run = { layout: l.id, label: l.label, entries, notes: [], secs: 0, ended: r.why ?? 'the frame did not finish' };
        }
        if (r.why) run.ended = run.ended ?? r.why;
        run.label = l.label;
        runs.push(run);
      }
      const scope = pictureScope(searchNow(), appWorld(), { checks: ['layout', 'motion', 'pictures'], slides: plan.slides, sizes: layouts.map((l) => l.id) });
      if (!scope) throw new Error('the request could not be read again at the end');
      const { shots, ends } = shotsOf(runs);
      const validity = [
        'A real GPU run on the device named above, one frame at a time, at the page\'s own speed (not the audit\'s speed mode, which makes cards short of their height).',
        'Frames inside a transition are taken with the page\'s clock slowed to 5%, so taking a picture does not move the animation.',
        'The only checks are of the card record: a card\'s content past its foot, and a card that changes size after it lands.',
        'A pass means no card overflowed in these pictures, not that the slide is right.',
        ...(stop ? ['The run was stopped early: only what was finished is here.'] : []),
      ];
      const files: ZipFile[] = unifiedFiles({
        scope, build: { commit: build, branch: '' }, startedAt: at.toISOString(), seconds: (new Date().getTime() - started) / 1000, device: `${navigator.userAgent}; ${innerWidth}x${innerHeight}`,
        shots, ends, checks: scope.checks, validity, isProblem,
      });
      await session.add(files);
      await session.finish(stop ? 'stopped' : 'finished');
      show(total, true);
      const pictures = session.names().filter((n) => /\.(jpg|png)$/.test(n)).length;
      status.textContent = `${stop ? 'Stopped. ' : 'Done. '}${pictures} pictures and the report. Tap Save.${why.length ? ` ${why.join('; ')}` : ''}`;
      deliver.offer(session, zipName, at, () => { void session!.saved(); });
    } catch (e) { status.textContent = `The stress capture failed: ${String((e as Error)?.message ?? e)}`; }
    finally { running = false; go.disabled = false; }
  }
  if (flagOn('go')) clock.after(() => { void run(); }, 600);   // (an address that asks for it starts it: ?stress&go=1)
}
