// ?audit on a Mac: the outer page. It does not start the app. It holds ONE iframe at a time (the GPU keeps about 16 canvases per page), loads the app in it at the first size with `?audit=run`,
// listens for its progress and its result, takes the frame away, and does the next size. At the end it joins every size's data into one report with Copy and Copy JSON.
// A frame is a layout preview (the app inside sees that width; its hover and touch answers, pixel ratio and GPU are this computer's), so the frame rates here are the Mac's.
import { FRAME_DEVICES, fitScale } from '../frame/frame.ts';
import { flagValue, queryWithout, searchNow } from '../flags.ts';
import { renderText, renderJson, type Bundle, type AuditData } from './report.ts';
import type { Msg } from './page.ts';

export const DEFAULT_SIZES = ['iphone', 'ipad-portrait', 'ipad', 'mac'];
export const ALL_SIZES = ['iphone', 'iphone-landscape', 'ipad-portrait', 'ipad', 'mac-short', 'mac'];
/** A frame that says nothing for this long is taken to have died (a tab kill, a crash, a page that never booted). */
export const SILENT_MS = 150000;

/** The address of the app inside a frame: the same path, `?audit=run`, the depth, and whatever else the outer address carried (the frame list and the old audit flags are dropped). */
export function childSrc(pathname: string, search: string, depth: string): string {
  const rest = queryWithout(search, ['audit', 'sizes', 'depth']);
  return `${pathname}?audit=run&depth=${depth}${rest ? `&${rest}` : ''}`;
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
  const bar = mk('div', 'ao-bar'), main = mk('div', 'ao-main'), room = mk('div', 'ao-room'), wrap = mk('div', 'ao-wrap'), out = mk('pre', 'ao-out');
  const status = mk('span', '', 'Pick the sizes and press Start; the app appears here.'); status.setAttribute('role', 'status');
  const note = mk('div', 'ao-note', 'Runs the app by itself in each size, one after the other, and measures layout, timing, fades, frame rate and errors; no AI, nothing is sent anywhere. Keep this tab in front until it ends (a hidden tab stops the clock). The frame rates are this computer\'s: run ?audit=here on the iPhone and iPad for theirs.');
  const wanted = new Set(sizesOf(flagValue('sizes')));
  const boxes = ALL_SIZES.map((id) => { const l = mk('label'); const c = doc.createElement('input'); c.type = 'checkbox'; c.checked = wanted.has(id); c.onchange = () => { if (c.checked) wanted.add(id); else wanted.delete(id); }; l.append(c, `${FRAME_DEVICES[id]!.label} ${FRAME_DEVICES[id]!.w}`); return l; });
  let depth: 'quick' | 'full' = flagValue('depth') === 'quick' ? 'quick' : 'full';
  const dsel = doc.createElement('select'); for (const d of ['full', 'quick']) { const o = doc.createElement('option'); o.value = d; o.textContent = d === 'full' ? 'Full (everything)' : 'Quick (3 slides a talk)'; dsel.append(o); } dsel.value = depth; dsel.onchange = () => { depth = dsel.value as 'quick' | 'full'; };
  let stop = false, running = false, last: Bundle | null = null, frame: HTMLIFrameElement | null = null;
  const btn = (label: string, on: () => void) => { const b = mk('button', '', label); b.type = 'button'; b.onclick = on; bar.append(b); return b; };
  const copy = (t: string, what: string) => { win.navigator.clipboard?.writeText(t).then(() => { status.textContent = `${what} copied (${t.length.toLocaleString('en-US')} characters).`; }, () => { status.textContent = 'The browser would not copy: select the text on the right.'; }); };
  bar.append(...boxes, dsel);
  const start = btn('Start', () => { void run(); });
  btn('Stop', () => { stop = true; status.textContent = 'Stopping: the frame finishes its step, then this ends.'; });
  btn('Copy report', () => { if (last) copy(renderText(last), 'The report'); }); btn('Copy JSON', () => { if (last) copy(renderJson(last), 'The JSON'); });
  bar.append(status, note);
  wrap.style.cssText = 'width:0;height:0'; room.append(wrap); main.append(room, out); doc.body.append(bar, main);

  const fit = (w: number, h: number) => {
    const r = room.getBoundingClientRect(), k = fitScale(w, h, Math.max(1, r.width - 24), Math.max(1, r.height - 24));
    wrap.style.width = `${Math.round(w * k)}px`; wrap.style.height = `${Math.round(h * k)}px`;
    if (frame) { frame.style.width = `${w}px`; frame.style.height = `${h}px`; frame.style.transform = `scale(${k})`; }
  };
  /** One size: a fresh frame, wait for its result, take it away. */
  const one = (id: string): Promise<{ data?: AuditData; why?: string }> => new Promise((done) => {
    const d = FRAME_DEVICES[id]!;
    frame = doc.createElement('iframe'); frame.title = `${d.label} ${d.w}x${d.h}`; frame.src = childSrc(win.location.pathname, searchNow(), depth);
    wrap.replaceChildren(frame); fit(d.w, d.h);
    let silent: ReturnType<typeof setTimeout>, finished = false;
    const end = (r: { data?: AuditData; why?: string }) => { if (finished) return; finished = true; clearTimeout(silent); win.removeEventListener('message', on); clearInterval(poll); frame?.remove(); frame = null; done(r); };
    const wake = () => { clearTimeout(silent); silent = setTimeout(() => end({ why: `silent for ${SILENT_MS / 1000} s (the frame crashed or never booted)` }), SILENT_MS); };
    const on = (e: MessageEvent) => {
      if (e.origin !== win.location.origin || e.source !== frame?.contentWindow) return;
      const m = e.data as Msg | null; if (!m || typeof m !== 'object' || !('audit' in m)) return;
      wake();
      if (m.audit === 'progress') status.textContent = `${d.label}: step ${m.n}: ${m.label}`;
      else if (m.audit === 'done') end({ data: m.data });
      else if (m.audit === 'failed') end({ why: m.why });
    };
    const poll = setInterval(() => { if (stop) { try { (frame?.contentWindow as unknown as { pps?: { audit?: { stop(): void } } }).pps?.audit?.stop(); } catch { /* cross-origin: cannot happen, same origin */ } } }, 1000);
    win.addEventListener('message', on); wake();
  });
  async function run() {
    if (running) return; running = true; stop = false; start.disabled = true; out.textContent = '';
    const ids = ALL_SIZES.filter((id) => wanted.has(id)), parts: AuditData[] = [], failed: Bundle['failed'] = [];
    const mkBundle = (): Bundle => ({ build: parts[0]?.build ?? 'unknown', device: `${win.navigator.userAgent} · dpr ${win.devicePixelRatio}`, at: new Date().toISOString(), depth, framed: true, parts, failed });
    for (const id of ids) {
      if (stop) break;
      status.textContent = `${FRAME_DEVICES[id]!.label}: loading the app…`;
      const r = await one(id);
      if (r.data) parts.push(r.data); else failed.push({ size: id, why: r.why ?? 'no result' });
      last = mkBundle(); out.textContent = renderText(last);
    }
    status.textContent = `Finished ${parts.length} of ${ids.length} sizes${failed.length ? ` (${failed.length} did not finish)` : ''}. Copy the report.`;
    running = false; start.disabled = false;
  }
  if (flagValue('audit') === 'frames' && flagValue('sizes') !== null) setTimeout(() => { void run(); }, 300);   // (an address that names its sizes starts itself)
}
