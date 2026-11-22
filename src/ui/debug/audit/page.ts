// ?audit, the page: the panel (Run, Stop, Copy, Copy JSON) on the app itself, for `?audit=here` (this screen) and for `?audit=run` (the app inside a frame, which starts at once and posts
// its progress and its result to the outer page, outer.ts). Loaded only when the address asks (debug/mount.ts); nothing runs until a button, or the frame's start.
import { bootDigest } from '../../../boot/digest.ts';
import { runAudit } from './run.ts';
import { plan, planTotal, startTaps, settle, QUIET_MS } from './app.ts';
import { pace } from './progress.ts';
import { loadAllDecks } from '../page/live.ts';
import { renderText, renderJson, type Bundle, type AuditData, type Coverage } from './report.ts';
import { flagValue } from '../flags.ts';
import { deviceOf } from '../devices.ts';
import { buildInfo } from '../packet/sources.ts';
import { attach } from '../pps.ts';
import type { SequenceProof } from './sequence.ts';
import { speedOf } from './speed.ts';
import { SPEEDS } from './outer.ts';

import { clock } from '../../../clock/frame.ts';
export type Msg = { audit: 'hello' } | { audit: 'progress'; n: number; label: string; total?: number } | { audit: 'partial'; data: AuditData } | { audit: 'done'; data: AuditData } | { audit: 'failed'; why: string };

const CSS = `.au{position:fixed;left:8px;bottom:8px;z-index:var(--z-perf,300);max-width:min(560px,94vw);font:500 12px/1.35 system-ui,-apple-system,sans-serif;color:#efefef;background:rgba(20,20,24,.92);border:1px solid rgba(255,255,255,.25);border-radius:12px;padding:8px}
.au button{font:inherit;font-weight:600;color:inherit;min-height:32px;padding:0 10px;margin:0 6px 6px 0;border-radius:8px;border:1px solid rgba(255,255,255,.35);background:transparent}
.au pre{margin:6px 0 0;max-height:38vh;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;font:11px/1.4 ui-monospace,Menlo,monospace}`;

const depthOf = (): 'quick' | 'full' => (flagValue('depth') === 'quick' ? 'quick' : 'full');

/** One run of this screen: the data for its size. */
export async function runHere(depth: 'quick' | 'full', ui: { status(s: string): void; stop(): boolean; step?(n: number, label: string, total: number): void; /** the data so far, every few steps */ partial?(d: AuditData): void }, speedIn?: number): Promise<AuditData> {
  const notes: string[] = [], coverage: Coverage[] = [], sequenceProofs: SequenceProof[] = [];
  const { failed } = await loadAllDecks();   // (the registry holds only the HVPG talk until the rest are read in)
  if (failed.length) notes.push(`these talks would not load, so they are not walked: ${failed.join(', ')}`);
  const speed = speedOf(speedIn !== undefined ? String(speedIn) : flagValue('speed'));
  if (speed > 1) notes.push(`SPEED x${speed}: the page's clock ran ${speed} times faster (clock.now, every clock.after wait and every CSS animation), so frame rates are not valid (stalls are: they are real-time gaps); fades, settle times, layout and words are.`);
  const glassOff = flagValue('noglass') === '1';
  if (glassOff) { document.documentElement.setAttribute('data-noglass', ''); notes.push('NOGLASS: the frosted-glass blur was off for this run (&noglass=1). Compare its talk-open frame rates with a normal run to see what the glass costs.'); }
  clock.setScale(speed);   // (one number: every tween, wait and reader of clock.now() follows)
  const taps = startTaps(window, speed);
  const total = planTotal(depth);
  const w = innerWidth, h = innerHeight;
  const dev = ['iphone', 'iphone-landscape', 'ipad', 'ipad-portrait', 'mac', 'mac-short'].map((id) => deviceOf(id)!).find((d) => d.w === w && d.h === h);
  const size = { id: dev?.id ?? `${w}x${h}`, w, h, dpr: devicePixelRatio };
  try {
    const data = await runAudit(plan(depth, (s) => notes.push(s), (c) => coverage.push(c), (p) => sequenceProofs.push(p)), {
      size, mark: () => taps.mark(), settle, read: (t0) => taps.read(t0), now: () => clock.now(), quietMs: QUIET_MS,
    }, { depth, notes, coverage, sequence: sequenceProofs, onPartial: (d) => ui.partial?.({ ...d, build: buildInfo().badge, speed: speed > 1 ? speed : undefined, boot: bootDigest() }), shouldStop: ui.stop, onStep: (n, row) => { ui.status(`${size.id}: step ${n}: ${row.group} > ${row.label}`); ui.step?.(n, `${row.group} > ${row.label}`, total); } });
    return { ...data, build: buildInfo().badge, speed: speed > 1 ? speed : undefined, boot: bootDigest() };
  } finally { taps.stop(); clock.setScale(1); if (glassOff) document.documentElement.removeAttribute('data-noglass'); }
}

const bundle = (parts: AuditData[], depth: 'quick' | 'full', failed: Bundle['failed'] = []): Bundle => {
  const b = buildInfo();
  return { build: b.badge || b.release || b.commit || 'dev', sha: b.commit || undefined, device: `${navigator.userAgent} · dpr ${devicePixelRatio} · ${innerWidth}x${innerHeight}`, at: new Date().toISOString(), depth, framed: false, speed: parts[0]?.speed, parts, failed };
};

export function mountAudit(mode: 'here' | 'run'): void {
  if (document.getElementById('au-root')) return;
  const st = document.createElement('style'); st.textContent = CSS; document.head.append(st);
  const root = document.createElement('div'); root.className = 'au'; root.id = 'au-root'; root.setAttribute('data-debug', '');
  const status = document.createElement('div'); status.setAttribute('role', 'status'); status.textContent = mode === 'run' ? 'Audit starting…' : 'Self-test ready. Keep this tab in front while it runs.';
  const hash = buildInfo().badge || buildInfo().commit || 'dev';
  const head = document.createElement('div'); head.textContent = `Self-test · build ${hash}`; head.style.cssText = 'font-weight:700;margin-bottom:4px';
  const bar = document.createElement('progress'); bar.max = 100; bar.value = 0; bar.hidden = true; bar.style.cssText = 'width:100%;height:10px';
  const pctLine = document.createElement('div'); pctLine.hidden = true;
  let startedAt = 0;
  const out = document.createElement('pre'); out.hidden = true;
  const row = document.createElement('div');
  let stop = false, running = false, last: Bundle | null = null;
  // the speed of the walk, chosen here (an address's &speed=N is the starting choice): what each speed is good for is written under the list
  const nearest = (n: number) => SPEEDS.reduce((best, c) => (Math.abs(c.n - n) < Math.abs(best - n) ? c.n : best), SPEEDS[0]!.n);
  const hintOf = (n: number) => `Speed ${n}x: ${SPEEDS.find((x) => x.n === n)!.hint}`;
  let speed = nearest(speedOf(flagValue('speed')));
  const sel = document.createElement('select'); sel.setAttribute('aria-label', 'Speed of the test');
  for (const c of SPEEDS) { const o = document.createElement('option'); o.value = String(c.n); o.textContent = c.label; sel.append(o); }
  sel.value = String(speed);
  const why = document.createElement('div'); why.style.cssText = 'opacity:.75;margin:4px 0'; why.textContent = hintOf(speed);
  sel.onchange = () => { speed = Number(sel.value); why.textContent = hintOf(speed); };
  const speedRow = document.createElement('label'); speedRow.style.cssText = 'display:flex;gap:8px;align-items:center;margin:4px 0'; speedRow.append('Speed', sel);
  const btn = (label: string, on: () => void) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.onclick = on; row.append(b); return b; };
  const copy = (t: string, what: string) => { navigator.clipboard?.writeText(t).then(() => { status.textContent = `${what} copied (${t.length.toLocaleString('en-US')} characters).`; }, () => { out.hidden = false; out.textContent = t; status.textContent = 'The browser would not copy: select the text below.'; }); };
  const go = async (depth: 'quick' | 'full') => {
    const saveSoFar = (d: AuditData) => { last = bundle([d], depth); if (mode === 'run') post({ audit: 'partial', data: d }); };
    if (running) return; running = true; sel.disabled = true; stop = false; out.hidden = true; status.textContent = 'Starting…'; startedAt = clock.now(); bar.value = 0; bar.hidden = false; pctLine.hidden = false; pctLine.textContent = 'counting the steps…';
    try {
      const data = await runHere(depth, { partial: saveSoFar, status: (s) => { status.textContent = s; }, stop: () => stop, step: (n, label, total) => { const pc = pace(n, total, startedAt, clock.now()); bar.value = pc.pct; pctLine.textContent = pc.text; if (mode === 'run') post({ audit: 'progress', n, label, total: pc.total }); } }, mode === 'here' ? speed : undefined);
      bar.value = 100; pctLine.textContent = pace(data.rows.length, data.rows.length, startedAt, clock.now(), true).text;
      last = bundle([data], depth);
      out.textContent = renderText(last, { short: true }); out.hidden = false;
      status.textContent = `Done: ${data.rows.length} steps in ${Math.round(data.ms / 1000)} s${data.stopped ? ' (stopped early)' : ''}. Copy the report.`;
      if (mode === 'run') post({ audit: 'done', data });
    } catch (e) { const why = String((e as Error)?.message ?? e); status.textContent = `The audit failed: ${why}`; if (mode === 'run') post({ audit: 'failed', why }); } finally { running = false; sel.disabled = false; }
  };
  if (mode === 'here') { btn('Run full', () => { void go('full'); }); btn('Run quick', () => { void go('quick'); }); btn('Stop', () => { stop = true; status.textContent = 'Stopping after this step…'; }); }
  btn('Copy report', () => { if (last) copy(renderText(last), 'The report'); }); btn('Copy short', () => { if (last) copy(renderText(last, { short: true }), 'The short report'); }); btn('Copy JSON', () => { if (last) copy(renderJson(last), 'The JSON'); });
  root.append(head, status, bar, pctLine, ...(mode === 'here' ? [speedRow, why] : []), row, out);
  document.body.append(root);
  attach('audit', { run: (d: 'quick' | 'full' = 'full') => go(d), text: () => (last ? renderText(last) : ''), json: () => (last ? renderJson(last) : ''), stop: () => { stop = true; } });
  if (mode === 'run') {
    post({ audit: 'hello' });
    // (the app inside a frame: wait for the page to be still after boot, then walk it)
    clock.after(() => { void settle().then(() => go(depthOf())); }, 1500);
  }
}
function post(m: Msg): void { try { parent.postMessage(m, location.origin); } catch { /* no parent: standing alone */ } }
