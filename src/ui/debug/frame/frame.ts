// The device frame, `?debug=frame` (the 2D app's gallery/device-frame.js): a light outer page that does NOT start the app and holds ONE <iframe> at a phone's or iPad's size,
// so the app inside sees a 390 px wide screen and its media queries lay a card out as a phone does. A frame is a layout preview, not a phone: (hover) and (pointer: coarse)
// answer as this computer does, the pixel ratio is this computer's, and the engine is this browser's. One frame at a time, because WebKit keeps about 16 WebGL contexts per
// page and each app instance uses several (tests/webgl-budget.test.ts).
//
// Pure helpers first (a Node test loads them); `bootFrame(doc, win)` draws the page.
//   frameRequest('?debug=frame&device=iphone&look=navy') -> { device: 'iphone', rest: 'look=navy' }
//   frameSrc({ pathname: '/preview/', search, hash })    -> '/preview/?debug&look=navy#...'   (the page inside the frame: the app with the debug panel)
//   fitScale(390, 844, 1200, 800)                        -> 0.9 (drawn at 0.9 so the whole phone shows; the app inside still sees 390 x 844)
import { GALLERY_DEVICES } from '../devices.ts';
import { flagValue, queryWithout } from '../flags.ts';
export { isFrameRequest } from './request.ts';

export interface FrameDevice { label: string; w: number; h: number; turn: string | null; phone: boolean }
export const FRAME_DEVICES: Readonly<Record<string, FrameDevice>> = Object.freeze(Object.fromEntries(GALLERY_DEVICES.map((d) => [d.id, { label: d.label, w: d.w, h: d.h, turn: d.turn, phone: d.phone }])));
export const DEFAULT_FRAME = 'iphone';

/** The device and the rest of the address a frame request names (everything but `debug`, `gallery` and `device`, kept in its order). */
export function frameRequest(search: string): { device: string; rest: string } {
  const d = flagValue('device', search ?? '') ?? '';
  const device = Object.hasOwn(FRAME_DEVICES, d) ? d : DEFAULT_FRAME;
  return { device, rest: queryWithout(search, ['debug', 'gallery', 'device']) };
}

interface Loc { pathname: string; search: string; hash?: string }
/** The address of the page inside the frame: the same path, the debug page itself (`?debug`) and the rest of the query, the hash kept (a state link). */
export function frameSrc(loc: Loc): string {
  const { rest } = frameRequest(loc.search);
  return `${loc.pathname}?debug${rest ? `&${rest}` : ''}${loc.hash || ''}`;
}
/** The address of the outer page for a device (what the picker writes to the address bar). */
export function framePageUrl(loc: Loc, device: string): string {
  const { rest } = frameRequest(loc.search);
  return `${loc.pathname}?debug=frame&device=${device}${rest ? `&${rest}` : ''}${loc.hash || ''}`;
}
/** The scale that fits a w x h frame in the room (never above 1: a frame is not blown up). */
export const fitScale = (w: number, h: number, roomW: number, roomH: number): number => Math.max(0.1, Math.min(1, roomW / w, roomH / h));

const CSS = `
html, body { margin: 0; height: 100%; }
body { font: 500 14px/1.4 system-ui, -apple-system, 'Segoe UI', sans-serif; background: #f2f1ee; color: #1b1b1d; display: flex; flex-direction: column; }
@media (prefers-color-scheme: dark) { body { background: #141416; color: #efefef; } .dfr-bar { background: #1c1c20 !important; border-color: rgba(255,255,255,.22) !important; } .dfr-bar button, .dfr-bar a { border-color: rgba(255,255,255,.3) !important; } .dfr-note, .dfr-size { color: #a8a8ad !important; } }
.dfr-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; padding: 10px 14px; background: #faf9f7; border-bottom: 1px solid rgba(0,0,0,.18); }
.dfr-bar button, .dfr-bar a { font: inherit; font-weight: 600; color: inherit; min-height: 34px; padding: 0 12px; border-radius: 9px; border: 1px solid rgba(0,0,0,.3); background: transparent; cursor: pointer; text-decoration: none; display: inline-flex; align-items: center; }
.dfr-bar button[aria-pressed="true"] { background: #1b1b1d; color: #faf9f7; border-color: #1b1b1d; }
.dfr-bar button:disabled { opacity: .45; cursor: default; }
.dfr-bar button:focus-visible, .dfr-bar a:focus-visible { outline: 2px solid #c8282e; outline-offset: 2px; }
.dfr-note { flex: 1 1 260px; color: #5b5a57; font-weight: 500; }
.dfr-room { flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; overflow: hidden; }
.dfr-wrap { position: relative; flex: none; }
.dfr-wrap iframe { position: absolute; left: 0; top: 0; border: 0; background: #fff; transform-origin: 0 0; border-radius: 6px; box-shadow: 0 8px 28px -8px rgba(0,0,0,.45); }
.dfr-size { font-variant-numeric: tabular-nums; color: #5b5a57; }
`;

/** Draws the outer page into `doc.body`. Does nothing else: the app is not started, and there is exactly one iframe at any time. */
export function bootFrame(doc: Document = document, win: Window = window): { select(device: string): void; dispose(): void } {
  const loc = win.location;
  const st = doc.createElement('style'); st.textContent = CSS; doc.head.append(st);
  doc.title = 'Device frame';
  const mk = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string) => { const e = doc.createElement(tag); e.className = cls; return e; };
  const bar = mk('div', 'dfr-bar'), room = mk('div', 'dfr-room'), wrap = mk('div', 'dfr-wrap'), note = mk('span', 'dfr-note'), size = mk('span', 'dfr-size');
  note.textContent = "A layout preview, not a phone: hover and touch rules, the pixel ratio and the engine are this computer's. One frame at a time (the GPU keeps about 16 canvases per page).";
  const buttons: Record<string, HTMLButtonElement> = {};
  for (const [id, d] of Object.entries(FRAME_DEVICES)) {
    const b = doc.createElement('button'); b.type = 'button'; b.textContent = d.label; b.dataset.device = id; b.setAttribute('aria-pressed', 'false');
    b.onclick = () => select(id); buttons[id] = b; bar.append(b);
  }
  const turn = doc.createElement('button'); turn.type = 'button'; turn.textContent = 'Turn'; turn.title = 'Hold the device the other way';
  turn.onclick = () => { const t = cur ? FRAME_DEVICES[cur]?.turn : null; if (t) select(t); };
  const full = doc.createElement('a'); full.textContent = 'Open at full size'; full.target = '_blank'; full.rel = 'noopener';
  bar.append(turn, full, size, note);
  room.append(wrap); doc.body.append(bar, room);
  let cur: string | null = null, frame: HTMLIFrameElement | null = null;
  const fit = () => {
    const d = cur ? FRAME_DEVICES[cur] : null;
    if (!d || !frame) return;
    const rect = room.getBoundingClientRect();   // (this page's own layout, read on a pick or a resize, never per frame; the app is not running here)
    const k = fitScale(d.w, d.h, Math.max(1, rect.width - 24), Math.max(1, rect.height - 24));
    wrap.style.width = `${Math.round(d.w * k)}px`; wrap.style.height = `${Math.round(d.h * k)}px`;
    frame.style.width = `${d.w}px`; frame.style.height = `${d.h}px`; frame.style.transform = `scale(${k})`;
    size.textContent = `${d.w} x ${d.h}${k < 1 ? ` at ${Math.round(k * 100)}%` : ''}`;
  };
  function select(device: string): void {
    if (!Object.hasOwn(FRAME_DEVICES, device)) return;
    const first = cur === null;
    cur = device;
    for (const [id, b] of Object.entries(buttons)) b.setAttribute('aria-pressed', String(id === device));
    turn.disabled = !FRAME_DEVICES[device]!.turn;   // (a Mac frame has no other way round)
    if (!frame) { frame = doc.createElement('iframe'); frame.title = "The app at this device's size"; frame.src = frameSrc(loc); wrap.append(frame); }
    full.href = frameSrc(loc);
    // (The address bar follows, so a copied link reopens this device; the frame itself is not reloaded: only its size changes, and the app inside lays out again.)
    if (win.history?.replaceState && !first) win.history.replaceState(null, '', framePageUrl(loc, device));
    fit();
  }
  win.addEventListener('resize', fit);
  select(frameRequest(loc.search).device);
  return { select, dispose() { win.removeEventListener('resize', fit); bar.remove(); room.remove(); st.remove(); } };
}
