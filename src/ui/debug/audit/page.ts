// ?audit, the page: the panel (Run, Stop, Copy, Copy JSON) on the app itself, for `?audit=here` (this screen) and for `?audit=run` (the app inside a frame, which starts at once and posts
// its progress and its result to the outer page, outer.ts). Loaded only when the address asks (debug/mount.ts); nothing runs until a button, or the frame's start.
import { runAudit } from './run.ts';
import { plan, startTaps, settle, QUIET_MS } from './app.ts';
import { renderText, renderJson, type Bundle, type AuditData } from './report.ts';
import { flagValue } from '../flags.ts';
import { deviceOf } from '../devices.ts';
import { buildInfo } from '../packet/sources.ts';
import { attach } from '../pps.ts';

export type Msg = { audit: 'hello' } | { audit: 'progress'; n: number; label: string } | { audit: 'done'; data: AuditData } | { audit: 'failed'; why: string };

const CSS = `.au{position:fixed;left:8px;bottom:8px;z-index:var(--z-perf,300);max-width:min(560px,94vw);font:500 12px/1.35 system-ui,-apple-system,sans-serif;color:#efefef;background:rgba(20,20,24,.92);border:1px solid rgba(255,255,255,.25);border-radius:12px;padding:8px}
.au button{font:inherit;font-weight:600;color:inherit;min-height:32px;padding:0 10px;margin:0 6px 6px 0;border-radius:8px;border:1px solid rgba(255,255,255,.35);background:transparent}
.au pre{margin:6px 0 0;max-height:38vh;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;font:11px/1.4 ui-monospace,Menlo,monospace}`;

const depthOf = (): 'quick' | 'full' => (flagValue('depth') === 'quick' ? 'quick' : 'full');

/** One run of this screen: the data for its size. */
export async function runHere(depth: 'quick' | 'full', ui: { status(s: string): void; stop(): boolean; step?(n: number, label: string): void }): Promise<AuditData> {
  const taps = startTaps();
  const notes: string[] = [];
  const w = innerWidth, h = innerHeight;
  const dev = ['iphone', 'iphone-landscape', 'ipad', 'ipad-portrait', 'mac', 'mac-short'].map((id) => deviceOf(id)!).find((d) => d.w === w && d.h === h);
  const size = { id: dev?.id ?? `${w}x${h}`, w, h, dpr: devicePixelRatio };
  try {
    const data = await runAudit(plan(depth, (s) => notes.push(s)), {
      size, mark: () => taps.mark(), settle, read: (t0) => taps.read(t0), now: () => performance.now(), quietMs: QUIET_MS,
    }, { depth, notes, shouldStop: ui.stop, onStep: (n, row) => { ui.status(`${size.id}: step ${n}: ${row.group} > ${row.label}`); ui.step?.(n, `${row.group} > ${row.label}`); } });
    return { ...data, build: buildInfo().badge };
  } finally { taps.stop(); }
}

const bundle = (parts: AuditData[], depth: 'quick' | 'full', failed: Bundle['failed'] = []): Bundle => {
  const b = buildInfo();
  return { build: b.badge || b.release || b.commit || 'dev', device: `${navigator.userAgent} · dpr ${devicePixelRatio} · ${innerWidth}x${innerHeight}`, at: new Date().toISOString(), depth, framed: false, parts, failed };
};

export function mountAudit(mode: 'here' | 'run'): void {
  if (document.getElementById('au-root')) return;
  const st = document.createElement('style'); st.textContent = CSS; document.head.append(st);
  const root = document.createElement('div'); root.className = 'au'; root.id = 'au-root'; root.setAttribute('data-debug', '');
  const status = document.createElement('div'); status.setAttribute('role', 'status'); status.textContent = mode === 'run' ? 'Audit starting…' : 'Self-test ready. Keep this tab in front while it runs.';
  const out = document.createElement('pre'); out.hidden = true;
  const row = document.createElement('div');
  let stop = false, running = false, last: Bundle | null = null;
  const btn = (label: string, on: () => void) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.onclick = on; row.append(b); return b; };
  const copy = (t: string, what: string) => { navigator.clipboard?.writeText(t).then(() => { status.textContent = `${what} copied (${t.length.toLocaleString('en-US')} characters).`; }, () => { out.hidden = false; out.textContent = t; status.textContent = 'The browser would not copy: select the text below.'; }); };
  const go = async (depth: 'quick' | 'full') => {
    if (running) return; running = true; stop = false; out.hidden = true; status.textContent = 'Starting…';
    try {
      const data = await runHere(depth, { status: (s) => { status.textContent = s; }, stop: () => stop, step: (n, label) => { if (mode === 'run') post({ audit: 'progress', n, label }); } });
      last = bundle([data], depth);
      out.textContent = renderText(last); out.hidden = false;
      status.textContent = `Done: ${data.rows.length} steps in ${Math.round(data.ms / 1000)} s${data.stopped ? ' (stopped early)' : ''}. Copy the report.`;
      if (mode === 'run') post({ audit: 'done', data });
    } catch (e) { const why = String((e as Error)?.message ?? e); status.textContent = `The audit failed: ${why}`; if (mode === 'run') post({ audit: 'failed', why }); } finally { running = false; }
  };
  if (mode === 'here') { btn('Run full', () => { void go('full'); }); btn('Run quick', () => { void go('quick'); }); btn('Stop', () => { stop = true; status.textContent = 'Stopping after this step…'; }); }
  btn('Copy report', () => { if (last) copy(renderText(last), 'The report'); }); btn('Copy JSON', () => { if (last) copy(renderJson(last), 'The JSON'); });
  root.append(status, row, out);
  document.body.append(root);
  attach('audit', { run: (d: 'quick' | 'full' = 'full') => go(d), text: () => (last ? renderText(last) : ''), json: () => (last ? renderJson(last) : ''), stop: () => { stop = true; } });
  if (mode === 'run') {
    post({ audit: 'hello' });
    // (the app inside a frame: wait for the page to be still after boot, then walk it)
    setTimeout(() => { void settle().then(() => go(depthOf())); }, 1500);
  }
}
function post(m: Msg): void { try { parent.postMessage(m, location.origin); } catch { /* no parent: standing alone */ } }
