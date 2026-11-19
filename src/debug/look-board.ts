// The Mac look board, `?look` (atlas look plan 8.3): an outer page that does not start the app. It holds ONE iframe of the app at a device's size, walks the fixed states of
// look-states.ts through it (the app inside applies each in place, look-app.ts), reads the canvas in the frame that draws it, shows it beside the saved baseline and the difference,
// and, when `npm run look:serve` runs, writes the PNGs to look/<commit>/. `?look&twod` adds a button per row that opens the 2D app's preview of the same patient in the row.
// Nothing runs in the cloud: the owner drives it in his own browser. A state is a picture of the figure's canvas (the cards and labels are DOM and are not in it).
import { GALLERY_DEVICES } from '../ui/debug/devices.ts';
import { flagOn } from '../ui/debug/flags.ts';
import { LOOK_STATES, stateFile, stateTitle, stateAddress, twoDAddress, visitOrder, type LookState } from './look-states.ts';
import { diffPixels, verdict, moved, type Diff } from './look-diff.ts';
import { readPixels, picture } from './look-pixels.ts';
import type { LookApi, CaptureInfo } from './look-app.ts';

const CSS = `
html, body { margin: 0; } body { font: 500 14px/1.4 system-ui, -apple-system, sans-serif; background: #f2f1ee; color: #1b1b1d; }
@media (prefers-color-scheme: dark) { body { background: #141416; color: #efefef; } .lbd-bar { background: #1c1c20 !important; } }
.lbd-bar { position: sticky; top: 0; z-index: 5; display: flex; flex-wrap: wrap; gap: 6px 8px; align-items: center; padding: 10px 14px; background: #faf9f7; border-bottom: 1px solid rgba(0,0,0,.18); }
.lbd-bar button, .lbd-bar select, .lbd-row button { font: inherit; font-weight: 600; min-height: 34px; padding: 0 12px; border-radius: 9px; border: 1px solid rgba(128,128,128,.5); background: transparent; color: inherit; cursor: pointer; }
.lbd-bar button:disabled { opacity: .45; cursor: default; }
.lbd-status { flex: 1 1 320px; font-variant-numeric: tabular-nums; }
.lbd-live { position: fixed; right: 12px; bottom: 12px; z-index: 6; border-radius: 8px; overflow: hidden; box-shadow: 0 6px 24px rgba(0,0,0,.4); background: #fff; }
.lbd-live iframe { border: 0; transform-origin: 0 0; display: block; }
.lbd-rows { padding: 10px 14px 60px; display: flex; flex-direction: column; gap: 14px; }
.lbd-row { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; align-items: start; }
.lbd-row h3 { grid-column: 1 / -1; margin: 0; font-size: 13px; font-weight: 650; } .lbd-row h3 span { font-weight: 500; opacity: .7; margin-left: 8px; }
.lbd-cell { min-height: 40px; background: rgba(128,128,128,.12); border-radius: 6px; overflow: hidden; position: relative; } .lbd-cell img, .lbd-cell canvas { width: 100%; height: auto; display: block; }
.lbd-cell small { position: absolute; left: 6px; top: 4px; font-size: 11px; font-weight: 600; opacity: .75; pointer-events: none; text-shadow: 0 0 3px rgba(255,255,255,.8); }
.lbd-row[data-moved="true"] h3 { color: #c8282e; }
.lbd-two iframe { border: 0; transform-origin: 0 0; display: block; background: #fff; }
`;

interface Row { s: LookState; el: HTMLElement; shot: HTMLElement; base: HTMLElement; diff: HTMLElement; note: HTMLElement; two: HTMLElement; result?: { blob: Blob; info: CaptureInfo; d: Diff | null } }

export function bootLookBoard(doc: Document = document, win: Window = window): void {
  const st = doc.createElement('style'); st.textContent = CSS; doc.head.append(st);
  doc.title = 'Look board';
  const mk = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', parent?: HTMLElement) => { const e = doc.createElement(tag); if (cls) e.className = cls; parent?.append(e); return e; };
  const twod = flagOn('twod');
  const bar = mk('div', 'lbd-bar'), rows = mk('div', 'lbd-rows'), live = mk('div', 'lbd-live'), status = mk('span', 'lbd-status');
  const run = mk('button', '', bar); run.textContent = 'Run all';
  const stop = mk('button', '', bar); stop.textContent = 'Stop'; stop.disabled = true;
  const only = mk('select', '', bar);
  for (const [v, t] of [['', 'All devices'], ...GALLERY_DEVICES.map((d) => [d.id, d.label] as const)]) { const o = mk('option', '', only); o.value = v; o.textContent = t; }
  const promote = mk('button', '', bar); promote.textContent = 'Make this run the baseline'; promote.disabled = true;
  const copy = mk('button', '', bar); copy.textContent = 'Copy report';
  bar.append(status);
  doc.body.append(bar, rows, live);
  status.textContent = 'Not run yet. Run all walks the states below on this computer, in order, in one frame.';

  const list: Row[] = LOOK_STATES.map((s) => {
    const el = mk('section', 'lbd-row', rows), h = mk('h3', '', el), note = mk('span', '', h);
    h.prepend(stateTitle(s));
    const two = mk('div', 'lbd-cell lbd-two', el), shot = mk('div', 'lbd-cell', el), base = mk('div', 'lbd-cell', el), diff = mk('div', 'lbd-cell', el);
    two.innerHTML = '<small>2D</small>'; shot.innerHTML = '<small>3D</small>'; base.innerHTML = '<small>baseline</small>'; diff.innerHTML = '<small>difference</small>';
    if (twod) { const b = mk('button', '', two); b.textContent = 'Open 2D here'; b.style.margin = '22px 8px 8px'; b.onclick = () => open2d(list.find((r) => r.s === s)!); } else two.style.display = 'none';
    return { s, el, shot, base, diff, note, two };
  });
  if (!twod) rows.querySelectorAll<HTMLElement>('.lbd-row').forEach((r) => { r.style.gridTemplateColumns = 'repeat(3, minmax(0, 1fr))'; });
  let open2dRow: Row | null = null;
  function open2d(r: Row): void {
    if (open2dRow && open2dRow !== r) { open2dRow.two.querySelector('iframe')?.remove(); open2dRow.two.style.height = ''; }
    open2dRow = r;
    r.two.querySelector('iframe')?.remove();
    const d = GALLERY_DEVICES.find((x) => x.id === r.s.device)!, k = Math.min(1, r.two.clientWidth / d.w);
    const f = doc.createElement('iframe'); f.src = twoDAddress(r.s); f.style.width = `${d.w}px`; f.style.height = `${d.h}px`; f.style.transform = `scale(${k})`; f.title = '2D app';
    r.two.style.height = `${Math.round(d.h * k)}px`; r.two.append(f);
  }

  let frame: HTMLIFrameElement | null = null, frameDevice = '', stopped = false, saver: { commit: string } | null = null;
  const apiOf = (): LookApi | null => ((frame?.contentWindow as unknown as { __look?: LookApi } | null)?.__look) ?? null;
  async function probeServer(): Promise<void> { try { const r = await fetch('__look/info', { cache: 'no-store' }); if (r.ok) saver = await r.json(); } catch { saver = null; } }
  async function openFrame(s: LookState): Promise<LookApi | null> {
    const d = GALLERY_DEVICES.find((x) => x.id === s.device)!;
    frame?.remove();
    frame = doc.createElement('iframe'); frameDevice = s.device;
    const k = Math.min(0.35, 360 / d.w);
    frame.style.width = `${d.w}px`; frame.style.height = `${d.h}px`; frame.style.transform = `scale(${k})`; live.style.width = `${Math.round(d.w * k)}px`; live.style.height = `${Math.round(d.h * k)}px`;
    frame.src = stateAddress(s, win.location.pathname); frame.title = 'The app being photographed'; live.append(frame);
    const t0 = performance.now();
    while (!apiOf()) { if (performance.now() - t0 > 90000 || stopped) return null; await new Promise((ok) => setTimeout(ok, 150)); }
    return apiOf();
  }
  async function visit(r: Row): Promise<void> {
    let api = frameDevice === r.s.device ? apiOf() : null;
    let settled: { settled: boolean; ms: number };
    if (api) settled = await api.apply({ ...r.s, chevrons: false });
    else { api = await openFrame(r.s); if (!api) throw new Error('the app did not start'); settled = await api.ready; }
    const { blob, info } = await api.capture();
    r.result = { blob, info, d: null };
    r.shot.querySelector('img,canvas')?.remove();
    const img = new Image(); img.src = URL.createObjectURL(blob); r.shot.append(img);
    const cur = await readPixels(blob), base = await readPixels(new URL(`look/baseline/${stateFile(r.s)}`, win.location.href).href);
    let d: Diff | null = null;
    if (cur && base) {
      r.base.querySelector('img,canvas')?.remove(); r.base.append(picture(base.img));
      if (cur.w !== base.w || cur.h !== base.h) d = { same: false, size: false, changed: 0, total: 0, percent: 100, image: null };
      else {
        d = diffPixels(cur.data, base.data, cur.w, cur.h);
        r.diff.querySelector('img,canvas')?.remove(); r.diff.append(picture({ w: cur.w, h: cur.h, data: d.image! }));
      }
    }
    r.result.d = d;
    r.el.dataset.moved = String(moved(d));
    r.note.textContent = `${info.w}×${info.h} · ${verdict(d)}${settled.settled ? '' : ' · still moving when read'}`;
    if (saver) { try { await fetch(`__look/save?file=${encodeURIComponent(stateFile(r.s))}`, { method: 'POST', body: blob }); } catch { /* the server went away: the picture stays on the page */ } }
  }
  async function runAll(): Promise<void> {
    stopped = false; run.disabled = true; stop.disabled = false; promote.disabled = true;
    await probeServer();
    const ids = new Set(LOOK_STATES.filter((s) => !only.value || s.device === only.value));
    const order = visitOrder(LOOK_STATES).filter((s) => ids.has(s)).map((s) => list.find((r) => r.s === s)!);
    const t0 = performance.now(); let n = 0, bad = 0;
    frameDevice = '';
    for (const r of order) {
      if (stopped) break;
      status.textContent = `${++n} of ${order.length}: ${stateTitle(r.s)}`;
      try { await visit(r); } catch (e) { bad++; r.note.textContent = `failed: ${(e as Error).message}`; r.el.dataset.moved = 'true'; }
    }
    const sec = Math.round((performance.now() - t0) / 1000), movedN = list.filter((r) => r.result && moved(r.result.d)).length;
    status.textContent = `${stopped ? 'Stopped' : 'Done'}: ${n} states in ${sec} s${bad ? `, ${bad} failed` : ''}${movedN ? `, ${movedN} moved from the baseline` : ''}${saver ? `; saved to look/${saver.commit}/` : '; not saved (npm run look:serve saves)'}.`;
    run.disabled = false; stop.disabled = true; promote.disabled = !saver;
  }
  run.onclick = () => { void runAll(); };
  stop.onclick = () => { stopped = true; };
  promote.onclick = async () => { try { const r = await fetch('__look/promote', { method: 'POST' }); status.textContent = r.ok ? 'This run is now the baseline (look/baseline/).' : 'The server would not.'; } catch { status.textContent = 'The server is not running.'; } };
  copy.onclick = async () => {
    const lines = [`LOOK BOARD ${String((import.meta as unknown as { env?: Record<string, string> }).env?.VITE_BUILD ?? 'dev')} ${new Date().toISOString()}`, ...list.filter((r) => r.result || r.note.textContent).map((r) => `${stateTitle(r.s)}: ${r.note.textContent}`)];
    try { await navigator.clipboard.writeText(lines.join('\n')); status.textContent = `Copied ${lines.length - 1} lines.`; } catch { status.textContent = 'The browser would not copy.'; }
  };
}
