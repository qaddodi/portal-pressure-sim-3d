// ?audit on a Mac: the outer page. It does not start the app. It holds ONE iframe at a time (the GPU keeps about 16 canvases per page), loads the app in it at the first size with `?audit=run`,
// listens for its progress and its result, takes the frame away, and does the next size. At the end it joins every size's data into one report with Copy and Copy JSON.
// A frame is a layout preview (the app inside sees that width; its hover and touch answers, pixel ratio and GPU are this computer's), so the frame rates here are the Mac's.
import { FRAME_DEVICES, fitScale } from '../frame/frame.ts';
import { flagValue, queryWithout, searchNow } from '../flags.ts';
import { speedOf } from './speed.ts';
import { renderText, renderJson, type Bundle, type AuditData } from './report.ts';
import type { Msg } from './page.ts';
import { buildInfo } from '../packet/sources.ts';
import { pace, combine, sequenceOn } from './progress.ts';

import { clock, type TimerId } from '../../../clock/frame.ts';
export const DEFAULT_SIZES = ['iphone', 'ipad-portrait', 'ipad', 'mac'];
export const ALL_SIZES = ['iphone', 'iphone-landscape', 'ipad-portrait', 'ipad', 'mac-short', 'mac'];
/** A frame that says nothing for this long is taken to have died (a tab kill, a crash, a page that never booted). */
/** The speeds the banner offers, each with what it is good for (the report says what a speed leaves out). */
export const SPEEDS: { n: number; label: string; hint: string }[] = [
  { n: 1, label: '1x real time', hint: 'Real frame rates, stalls and the glass cost. The slowest run; use it for the final numbers.' },
  { n: 2, label: '2x faster', hint: 'Still judges fades and snaps, and every stall; frame rates are not measured. The most that still judges fades: the page draws a frame per 16 ms, so faster than this an ease gets too few frames.' },
  { n: 10, label: '10x fast', hint: 'Layout, words, coverage, errors and any lag (a real gap over 50 ms is a serious lag). Fades and snaps are not judged.' },
  { n: 20, label: '20x quickest', hint: 'The quickest layout, words, coverage, errors and lag check. Fades and snaps are not judged.' },
];
/** The address the banner's choices make: the current one with sizes, depth, speed, glass and parallel set to match (the others, such as look, are kept). */
export function addressFor(search: string, c: { auto?: boolean; sizes: string[]; depth: string; speed: number; noglass: boolean; parallel: boolean; sequence?: boolean }): string {
  const rest = queryWithout(search, ['audit', 'sizes', 'depth', 'parallel', 'speed', 'noglass', 'sequence']);
  return `?audit${c.auto ? '=frames' : ''}&sizes=${c.sizes.join(',')}&depth=${c.depth}${c.speed > 1 ? `&speed=${c.speed}` : ''}${c.noglass ? '&noglass=1' : ''}${c.parallel ? '&parallel=1' : ''}${c.sequence === undefined ? '' : `&sequence=${c.sequence ? 1 : 0}`}${rest ? `&${rest}` : ''}`;
}
export const SILENT_MS = 150000;
/** How long a frame's app has to say hello (it boots the whole app first) before the status says it has not. */
export const HELLO_MS = 20000;

/** The address of the app inside a frame: the same path, `?audit=run`, the depth, and whatever else the outer address carried (the frame list and the old audit flags are dropped). */
export function childSrc(pathname: string, search: string, depth: string, o: { speed?: number; noglass?: boolean; sequence?: boolean } = {}): string {
  const rest = queryWithout(search, ['audit', 'sizes', 'depth', 'parallel', 'speed', 'noglass', 'sequence']);
  return `${pathname}?audit=run&depth=${depth}${o.speed && o.speed > 1 ? `&speed=${o.speed}` : ''}${o.noglass ? '&noglass=1' : ''}${o.sequence === undefined ? '' : `&sequence=${o.sequence ? 1 : 0}`}${rest ? `&${rest}` : ''}`;
}
/** The sizes the address names (a comma list of device ids), or the default four; unknown names are dropped. */
export function sizesOf(v: string | null): string[] {
  const l = (v ?? '').split(',').map((s) => s.trim()).filter((s) => Object.hasOwn(FRAME_DEVICES, s));
  return l.length ? l : DEFAULT_SIZES;
}

const CSS = `html,body{margin:0;height:100%}body{font:500 14px/1.4 system-ui,-apple-system,sans-serif;background:#f2f1ee;color:#1b1b1d;display:flex;flex-direction:column}
@media(prefers-color-scheme:dark){body{background:#141416;color:#efefef}.ao-bar{background:#1c1c20!important}}
.ao-bar{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;padding:10px 14px;background:#faf9f7;border-bottom:1px solid rgba(0,0,0,.18)}
.ao-bar button{font:inherit;font-weight:600;color:inherit;min-height:34px;padding:0 12px;border-radius:9px;border:1px solid rgba(0,0,0,.3);background:transparent}
.ao-bar label{display:inline-flex;gap:4px;align-items:center}.ao-bar button:disabled{opacity:.45}
.ao-note{flex:1 1 100%;color:#5b5a57}
.ao-main{flex:1;min-height:0;display:flex}.ao-room{flex:1;min-width:0;display:flex;align-items:center;justify-content:center;overflow:hidden}
.ao-wrap{position:relative;flex:none}.ao-wrap iframe{position:absolute;left:0;top:0;border:0;background:#fff;transform-origin:0 0;border-radius:6px;box-shadow:0 8px 28px -8px rgba(0,0,0,.45)}
.ao-out{width:min(520px,40vw);margin:0;padding:10px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;font:11px/1.4 ui-monospace,Menlo,monospace;border-left:1px solid rgba(0,0,0,.18)}`;

export function bootOuter(doc: Document = document, win: Window = window): void {
  const st = doc.createElement('style'); st.textContent = CSS; doc.head.append(st); doc.title = 'Self-test';
  const mk = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = '') => { const e = doc.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; };
  const bar = mk('div', 'ao-bar'), main = mk('div', 'ao-main'), room = mk('div', 'ao-room'), out = mk('pre', 'ao-out');
  const hash = buildInfo().badge || buildInfo().commit || 'dev';
  const stamp = mk('strong', '', `build ${hash}`); stamp.title = 'The build this self-test is running';
  const meter = doc.createElement('progress'); meter.max = 100; meter.value = 0; meter.hidden = true; meter.style.cssText = 'width:min(320px,40vw);height:12px';
  const meterText = mk('span', '', ''); meterText.hidden = true;
  const status = mk('span', '', 'Pick the sizes and press Start; the app appears here.'); status.setAttribute('role', 'status');
  const note = mk('div', 'ao-note', 'Runs the app by itself in each size, one after the other, and measures layout, timing, fades, frame rate and errors; no AI, nothing is sent anywhere. Keep this tab in front until it ends (a hidden tab stops the clock). The frame rates are this computer\'s: run ?audit=here on the iPhone and iPad for theirs.');
  const wanted = new Set(sizesOf(flagValue('sizes')));
  const boxes = ALL_SIZES.map((id) => { const l = mk('label'); const c = doc.createElement('input'); c.type = 'checkbox'; c.checked = wanted.has(id); c.onchange = () => { if (c.checked) wanted.add(id); else wanted.delete(id); }; l.append(c, `${FRAME_DEVICES[id]!.label} ${FRAME_DEVICES[id]!.w}`); return l; });
  let depth: 'quick' | 'full' = flagValue('depth') === 'quick' ? 'quick' : 'full';
  const dsel = doc.createElement('select'); dsel.title = 'How much to walk'; for (const d of ['full', 'quick']) { const o = doc.createElement('option'); o.value = d; o.textContent = d === 'full' ? 'Full: every slide' : 'Quick: 4 slides a talk'; dsel.append(o); } dsel.value = depth;
  const wantSpeed = speedOf(flagValue('speed')); let speed = SPEEDS.reduce((best, s2) => (Math.abs(s2.n - wantSpeed) < Math.abs(best - wantSpeed) ? s2.n : best), 1);
  const ssel = doc.createElement('select'); ssel.title = 'How fast the page runs during the test'; for (const sp of SPEEDS) { const o = doc.createElement('option'); o.value = String(sp.n); o.textContent = sp.label; ssel.append(o); } ssel.value = String(speed);
  const hint = mk('div', 'ao-note', ''); const showHint = () => { hint.textContent = `Speed ${speed}x: ${SPEEDS.find((x) => x.n === speed)!.hint}`; };
  const ng = doc.createElement('input'); ng.type = 'checkbox'; ng.checked = flagValue('noglass') === '1';
  const ngL = mk('label'); ngL.title = 'Turns the frosted-glass blur off for the run. Run twice (glass on, then off) to see what the glass costs the frame rate.'; ngL.append(ng, 'No glass (blur off)');
  // the sequential pass: on for Full, off for Quick, until the person says otherwise
  let seqTouched = flagValue('sequence') !== null;
  const sq = doc.createElement('input'); sq.type = 'checkbox'; sq.checked = sequenceOn(flagValue('sequence'), depth);
  const sqL = mk('label'); sqL.title = 'After the quick jumps, presses Next one press at a time through every talk, and Back then Next at each stop edge, reading headings and tapping tab selectors. About doubles the steps of each talk.'; sqL.append(sq, 'Walk every press (slower)');
  const par = doc.createElement('input'); par.type = 'checkbox'; par.checked = flagValue('parallel') === '1';
  const parL = mk('label'); parL.title = 'All the sizes at once: much faster, but the frames share this computer, so frame rates and timings are NOT valid (layout, snaps, coverage and errors are).'; parL.append(par, 'All sizes at once (fps not valid)');
  let stop = false, running = false, last: Bundle | null = null;
  const btn = (label: string, on: () => void) => { const b = mk('button', '', label); b.type = 'button'; b.onclick = on; bar.append(b); return b; };
  const copy = (t: string, what: string) => { win.navigator.clipboard?.writeText(t).then(() => { status.textContent = `${what} copied (${t.length.toLocaleString('en-US')} characters).`; }, () => { status.textContent = 'The browser would not copy: select the text on the right.'; }); };
  /** the address follows the controls, so a copied link repeats this run */
  const syncUrl = () => { try { win.history.replaceState(null, '', addressFor(searchNow(), { auto: flagValue('audit') === 'frames', sizes: ALL_SIZES.filter((id) => wanted.has(id)), depth, speed, noglass: ng.checked, parallel: par.checked, sequence: sq.checked })); } catch { /* an address that will not change */ } };
  dsel.onchange = () => { depth = dsel.value as 'quick' | 'full'; if (!seqTouched) sq.checked = sequenceOn(null, depth); syncUrl(); };
  sq.onchange = () => { seqTouched = true; syncUrl(); };
  ssel.onchange = () => { speed = Number(ssel.value); showHint(); syncUrl(); };
  ng.onchange = syncUrl; par.onchange = syncUrl; for (const l of boxes) l.querySelector('input')!.addEventListener('change', syncUrl);
  showHint();
  bar.append(...boxes, dsel, ssel, sqL, ngL, parL);
  const start = btn('Start', () => { void run(); });
  btn('Stop', () => { stop = true; status.textContent = 'Stopping: the frame finishes its step, then this ends.'; });
  btn('Copy report', () => { if (last) copy(renderText(last), 'The report'); }); btn('Copy short', () => { if (last) copy(renderText(last, { short: true }), 'The short report'); }); btn('Copy JSON', () => { if (last) copy(renderJson(last), 'The JSON'); });
  bar.prepend(stamp); bar.append(meter, meterText, status, note);
  void import('./capture-outer.ts').then((m) => m.addCaptureControls({ doc, win, bar, room, status, sizes: () => ALL_SIZES.filter((id) => wanted.has(id)), speed: () => speed, busy: () => running, setBusy: (b) => { running = b; start.disabled = b; } }));
  main.append(room, out); doc.body.append(bar, main);

  /** One size: a fresh frame in its own place, wait for its result, take it away. `of`: how many frames share the room. */
  const one = (id: string, of: number): Promise<{ data?: AuditData; why?: string }> => new Promise((done) => {
    const d = FRAME_DEVICES[id]!;
    const wrap = mk('div', 'ao-wrap'), frame = doc.createElement('iframe'); frame.title = `${d.label} ${d.w}x${d.h}`; frame.src = childSrc(win.location.pathname, searchNow(), depth, { speed, noglass: ng.checked, sequence: sq.checked });
    wrap.append(frame); room.append(wrap);
    const r = room.getBoundingClientRect(), k = fitScale(d.w, d.h, Math.max(1, (r.width - 24 - 12 * (of - 1)) / of), Math.max(1, r.height - 24));
    wrap.style.width = `${Math.round(d.w * k)}px`; wrap.style.height = `${Math.round(d.h * k)}px`; wrap.style.margin = '0 6px';
    frame.style.width = `${d.w}px`; frame.style.height = `${d.h}px`; frame.style.transform = `scale(${k})`;
    let silent: TimerId, finished = false, heard = false;
    // (a frame whose app has not said hello says so, with its address: the self-test never sits on "Loading the app…" without a word)
    const late = clock.after(() => { if (!heard && !finished) status.textContent = `${d.label}: the app in the frame has not started after ${HELLO_MS / 1000} s. Open ${frame.src} on its own and add &perf to see where its start is waiting.`; }, HELLO_MS);
    const end = (res0: { data?: AuditData; why?: string }) => { if (finished) return; finished = true; const kept = partial.get(id); const res = !res0.data && kept ? { data: { ...kept, stopped: true, notes: [...kept.notes, `PARTIAL: this size did not finish (${res0.why ?? 'no result'}); these are the steps it got through`] } } : res0; clock.cancel(silent); clock.cancel(late); win.removeEventListener('message', on); clock.cancel(poll); wrap.remove(); done(res); };
    const wake = () => { clock.cancel(silent); silent = clock.after(() => end({ why: `silent for ${SILENT_MS / 1000} s (the frame crashed or never booted)` }), SILENT_MS); };
    const on = (e: MessageEvent) => {
      if (e.origin !== win.location.origin || e.source !== frame.contentWindow) return;
      const m = e.data as Msg | null; if (!m || typeof m !== 'object' || !('audit' in m)) return;
      wake();
      if (m.audit === 'hello') { heard = true; status.textContent = `${d.label}: the app has started; it settles, then the walk begins.`; }
      else if (m.audit === 'progress') { progress.set(id, `${d.label}: step ${m.n}: ${m.label}`); status.textContent = [...progress.values()].join(' | '); counts.set(id, { n: m.n, total: m.total ?? m.n }); showPace(); }
      else if (m.audit === 'partial') partial.set(id, m.data);
      else if (m.audit === 'done') end({ data: m.data });
      else if (m.audit === 'failed') end({ why: m.why });
    };
    const poll = clock.every(() => { if (stop) { try { (frame.contentWindow as unknown as { pps?: { audit?: { stop(): void } } }).pps?.audit?.stop(); } catch { /* same origin: cannot happen */ } } }, 1000);
    win.addEventListener('message', on); wake();
  });
  const partial = new Map<string, AuditData>(), progress = new Map<string, string>(), counts = new Map<string, { n: number; total: number }>(), prior = { n: 0, total: 0 };
  let runStart = 0, sizesTotal = 1, finished = 0;
  /** the whole run's bar: steps done in the sizes finished, plus the ones running now, over the estimate for all sizes */
  const showPace = (done = false) => { const c = combine(sizesTotal - finished, counts), p = pace(prior.n + c.n, Math.max(prior.total + c.total, prior.n + c.n), runStart, clock.now(), done); meter.hidden = false; meterText.hidden = false; meter.value = p.pct; meterText.textContent = p.text; };
  async function run() {
    if (running) return; syncUrl(); running = true; stop = false; start.disabled = true; out.textContent = ''; progress.clear(); partial.clear(); counts.clear(); prior.n = 0; prior.total = 0; finished = 0; runStart = clock.now();
    const ids = ALL_SIZES.filter((id) => wanted.has(id)), parts: AuditData[] = [], failed: Bundle['failed'] = [], t0 = clock.now(), together = par.checked && ids.length > 1;   // (one size alone shares the computer with nobody: its timings stand)
    const mkBundle = (): Bundle => ({ build: parts[0]?.build ?? 'unknown', device: `${win.navigator.userAgent} · dpr ${win.devicePixelRatio}`, at: new Date().toISOString(), depth, framed: true, sha: buildInfo().commit || undefined, parallel: together, speed: parts[0]?.speed, wallMs: Math.round(clock.now() - t0), parts, failed });
    const take = (id: string, r: { data?: AuditData; why?: string }) => { const c = counts.get(id); if (!together && c) { prior.n += r.data ? r.data.rows.length : c.n; prior.total += r.data ? r.data.rows.length : c.total; counts.delete(id); finished++; } if (r.data) parts.push(r.data); else failed.push({ size: id, why: r.why ?? 'no result' }); last = mkBundle(); out.textContent = renderText(last, { short: true }); };
    sizesTotal = ids.length; status.textContent = 'Loading the app…';
    if (together) await Promise.all(ids.map(async (id) => take(id, await one(id, ids.length))));
    else for (const id of ids) { if (stop) break; take(id, await one(id, 1)); }
    showPace(true); status.textContent = `Finished ${parts.length} of ${ids.length} sizes in ${((clock.now() - t0) / 60000).toFixed(1)} min${failed.length ? ` (${failed.length} did not finish)` : ''}. Copy the report.`;
    running = false; start.disabled = false;
  }
  if (flagValue('audit') === 'frames' && flagValue('sizes') !== null) clock.after(() => { void run(); }, 300);   // (an address that names its sizes starts itself)
}
