// ?audit, the page: the panel (Run, Stop, Copy, Copy JSON) on the app itself, for `?audit=here` (this screen) and for `?audit=run` (the app inside a frame, which starts at once and posts
// its progress and its result to the outer page, outer.ts). Loaded only when the address asks (debug/mount.ts); nothing runs until a button, or the frame's start.
import { bootDigest } from '../../../boot/digest.ts';
import { runAudit } from './run.ts';
import { startBlockWatch } from '../../../boot/longtasks.ts';
import { plan, planTotal, startTaps, settle, QUIET_MS } from './app.ts';
import { pace } from './progress.ts';
import { loadAllDecks } from '../page/live.ts';
import { builtinDecks } from '../../../decks/registry.ts';
import { renderText, renderJson, type Bundle, type AuditData, type Coverage } from './report.ts';
import { flagValue } from '../flags.ts';
import { deviceOf } from '../devices.ts';
import { buildInfo } from '../packet/sources.ts';
import { attach } from '../pps.ts';
import type { SequenceProof } from './sequence.ts';
import { speedOf } from './speed.ts';
import { SPEEDS } from './outer.ts';
import { pickerUi } from './capture-pick.ts';
import { saveFiles } from '../../capture/save-files.ts';

import { clock } from '../../../clock/frame.ts';
export type Msg = { audit: 'hello' } | { audit: 'progress'; n: number; label: string; total?: number } | { audit: 'partial'; data: AuditData } | { audit: 'done'; data: AuditData } | { audit: 'failed'; why: string };

const CSS = `.au{position:fixed;left:0;right:0;bottom:0;margin:0 auto;box-sizing:border-box;z-index:var(--z-perf,300);max-width:560px;max-height:92vh;overflow:auto;font:500 15px/1.35 system-ui,-apple-system,sans-serif;color:#efefef;background:#1a1a1e;border-radius:22px 22px 0 0;padding:10px 20px calc(16px + env(safe-area-inset-bottom))}
.au [hidden]{display:none!important}
.au button{font:inherit;font-weight:600;color:inherit;min-height:44px;padding:0 12px;margin:0 6px 6px 0;border-radius:12px;border:1px solid rgba(255,255,255,.2);background:transparent}
.au button.au-primary{width:100%;min-height:50px;margin:10px 0 0;background:#408cff;border-color:#408cff;color:#fff}
.au button.au-link{min-height:32px;padding:0;margin:0 16px 0 0;border:0;border-radius:0;font-size:13px;font-weight:500;color:#408cff}
.au progress{accent-color:#408cff}
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
  startBlockWatch();   // (Safari has no long-task observer: a 4 ms timer that is late says a block held the thread, and the marks say what ran; the digest at the end lists them)
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
  const root = document.createElement('div'); root.className = 'au'; root.id = 'au-root'; root.setAttribute('data-debug', ''); root.setAttribute('data-capture-skip', '');   // (the panel is not in a capture)
  const status = document.createElement('div'); status.setAttribute('role', 'status'); status.textContent = mode === 'run' ? 'Audit starting…' : 'Self-test ready. Keep this tab in front while it runs.';
  const hash = buildInfo().badge || buildInfo().commit || 'dev';
  const head = document.createElement('div'); head.style.cssText = 'display:flex;justify-content:space-between;align-items:baseline;margin:8px 0 10px'; { const t = document.createElement('span'), v = document.createElement('span'); t.textContent = mode === 'here' ? 'Capture' : 'Self-test'; t.style.cssText = 'font-size:20px;font-weight:600'; v.textContent = `build ${hash}`; v.style.cssText = 'font-size:12px;opacity:.6'; head.append(t, v); }
  const bar = document.createElement('progress'); bar.max = 100; bar.value = 0; bar.hidden = true; bar.style.cssText = 'width:100%;height:6px;margin:8px 0 4px';
  const pctLine = document.createElement('div'); pctLine.hidden = true; pctLine.style.cssText = 'font-size:12px;opacity:.6';
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
  sel.title = hintOf(speed); sel.style.cssText = 'font:inherit;color:inherit;opacity:.6;background:transparent;border:0;text-align:right;text-align-last:right;max-width:60%';
  sel.onchange = () => { speed = Number(sel.value); sel.title = hintOf(speed); };
  const speedRow = document.createElement('label'); speedRow.style.cssText = 'display:flex;justify-content:space-between;align-items:center;min-height:40px;border-bottom:1px solid rgba(255,255,255,.18)'; speedRow.append('Speed', sel);
  // Animations: Skip lands every slide on its settled end state at once (the page clock runs SKIP_SPEED times faster, so a glide or a fade is one frame); Play keeps the speed above.
  const SKIP_SPEED = 300; let skip = true;
  const animSel = document.createElement('select'); animSel.setAttribute('aria-label', 'Animations during a capture'); animSel.title = 'Skip: every slide lands on its finished state at once, no animating into it. Play: the speed above.';
  for (const [v, t] of [['skip', 'Skipped'], ['play', 'Played']] as const) { const o = document.createElement('option'); o.value = v; o.textContent = t; animSel.append(o); }
  animSel.style.cssText = sel.style.cssText; animSel.onchange = () => { skip = animSel.value === 'skip'; };
  const animRow = document.createElement('label'); animRow.style.cssText = speedRow.style.cssText; animRow.append('Animations', animSel);
  const btn = (label: string, on: () => void) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.onclick = on; row.append(b); return b; };
  const copy = (t: string, what: string) => { navigator.clipboard?.writeText(t).then(() => { status.textContent = `${what} copied (${t.length.toLocaleString('en-US')} characters).`; }, () => { out.hidden = false; out.textContent = t; status.textContent = 'The browser would not copy: select the text below.'; }); };
  // While a run is going the sheet steps aside: the form and the title fade out (eased), leaving the status, the bar, the percent and Stop.
  const body = document.createElement('div'), fadeBits = [head, body]; let fadeT: ReturnType<typeof clock.after> | null = null;
  for (const e of fadeBits) e.style.transition = 'opacity var(--d-small) var(--ease)';
  const setRunning = (on: boolean) => {
    if (mode !== 'here') return;
    if (fadeT !== null) { clock.cancel(fadeT); fadeT = null; }
    if (on) { for (const e of fadeBits) { e.style.opacity = '0'; e.style.pointerEvents = 'none'; } fadeT = clock.after(() => { for (const e of fadeBits) e.hidden = true; fadeT = null; }, 220); }
    else { for (const e of fadeBits) { e.hidden = false; e.style.pointerEvents = ''; } fadeT = clock.after(() => { for (const e of fadeBits) e.style.opacity = '1'; fadeT = null; }, 30); }
  };
  const go = async (depth: 'quick' | 'full') => {
    const saveSoFar = (d: AuditData) => { last = bundle([d], depth); if (mode === 'run') post({ audit: 'partial', data: d }); };
    if (running) return; running = true; sel.disabled = true; setRunning(true); stop = false; capStop.hidden = false; capStop.disabled = false; out.hidden = true; status.textContent = 'Starting…'; startedAt = clock.now(); bar.value = 0; bar.hidden = false; pctLine.hidden = false; pctLine.textContent = 'counting the steps…';
    try {
      const data = await runHere(depth, { partial: saveSoFar, status: (s) => { status.textContent = s; }, stop: () => stop, step: (n, label, total) => { const pc = pace(n, total, startedAt, clock.now()); bar.value = pc.pct; pctLine.textContent = pc.text; if (mode === 'run') post({ audit: 'progress', n, label, total: pc.total }); } }, mode === 'here' ? speed : undefined);
      bar.value = 100; pctLine.textContent = pace(data.rows.length, data.rows.length, startedAt, clock.now(), true).text;
      last = bundle([data], depth);
      out.textContent = renderText(last, { short: true }); out.hidden = false;
      status.textContent = `Done: ${data.rows.length} steps in ${Math.round(data.ms / 1000)} s${data.stopped ? ' (stopped early)' : ''}. Copy the report.`;
      if (mode === 'run') post({ audit: 'done', data });
    } catch (e) { const why = String((e as Error)?.message ?? e); status.textContent = `The audit failed: ${why}`; if (mode === 'run') post({ audit: 'failed', why }); } finally { running = false; sel.disabled = false; capStop.hidden = true; setRunning(false); }
  };
  // Capture all decks: every slide of every talk through the Capture pipeline, then one zip and a contact sheet per talk. The save buttons come when it ends (the share sheet needs a fresh tap).
  let cap: import('./capture-all.ts').AllResult | null = null;
  const saveRow = document.createElement('div'); saveRow.hidden = true;
  // which talk and which slides: all, ticked, or a random 5, 10 or 25 (the list is read in once the talks are loaded)
  const picker = pickerUi(document, () => builtinDecks());
  void loadAllDecks().then(() => picker.refresh());
  // Stop: big and red, there from the first slide to the last (what is captured so far is kept and saved)
  const capStop = document.createElement('button'); capStop.type = 'button'; capStop.hidden = true; capStop.textContent = 'Stop and keep what’s done'; capStop.style.cssText = 'display:block;width:100%;min-height:50px;font-size:15px;background:#c62828;border-color:#c62828;color:#fff;margin:10px 0 0';
  capStop.onclick = () => { stop = true; capStop.disabled = true; status.textContent = 'Stopping after this slide…'; };
  const goCapture = async () => {
    if (running) return;
    const sel = picker.read();
    if (sel.none) { status.textContent = 'Tick at least one talk first.'; return; }
    running = true; setRunning(true); stop = false; cap = null; saveRow.hidden = true; capStop.hidden = false; capStop.disabled = false; out.hidden = true; bar.value = 0; bar.hidden = false; pctLine.hidden = false; startedAt = clock.now(); status.textContent = 'Capturing every slide… keep this tab in front.'; pctLine.textContent = 'counting the slides…';
    try {
      const m = await import('./capture-all.ts');
      cap = await m.captureAllDecks({ decks: sel.decks ? new Set(sel.decks) : null, pick: sel.pick ? new Set(sel.pick) : null, speed: skip ? SKIP_SPEED : speed > 1 ? speed : undefined, skip, status: (s) => { status.textContent = s; }, stop: () => stop, progress: (n, total) => { const pc = pace(n, total, startedAt, clock.now()); bar.value = pc.pct; pctLine.textContent = pc.text; } });
      bar.value = 100;
      status.textContent = `${cap.stopped ? 'Stopped. ' : 'Done in ' + cap.secs + ' s. '}${cap.shots} slides from ${cap.decks} talks (${cap.perSlide.waitMs + cap.perSlide.drawMs} ms a slide at ${cap.speed}x), one contact sheet per talk. Tap Save zip.${cap.notes.length ? ` Notes: ${cap.notes.join('; ')}` : ''}`;
      saveRow.hidden = false;
    } catch (e) { status.textContent = `Capture failed: ${String((e as Error)?.message ?? e)}`; } finally { running = false; capStop.hidden = true; setRunning(false); }
  };
  const saveBtn = (label: string, files: () => File[] | null) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; if (label === 'Save zip') b.className = 'au-primary'; b.onclick = () => { const f = files(); if (f) void saveFiles(f); }; saveRow.append(b); };
  saveBtn('Save zip', () => (cap ? [new File([cap.zip], cap.zipName, { type: 'application/zip' })] : null));
  saveBtn('Share contact sheets', () => (cap && cap.collages.length ? cap.collages.map((c) => new File([c.blob], c.name, { type: 'image/png' })) : null));
  const cmds = document.createElement('div'); cmds.style.cssText = 'display:flex;align-items:center;margin:14px 0 0';
  const link = (label: string, on: () => void, into: HTMLElement) => { const l = document.createElement('button'); l.type = 'button'; l.className = 'au-link'; l.textContent = label; l.onclick = on; into.append(l); return l; };
  const copies = document.createElement('div'); copies.hidden = true; copies.style.cssText = 'margin:6px 0 0';
  const copyRow = () => { link('Report', () => { if (last) copy(renderText(last), 'The report'); }, copies); link('Short', () => { if (last) copy(renderText(last, { short: true }), 'The short report'); }, copies); link('JSON', () => { if (last) copy(renderJson(last), 'The JSON'); }, copies); };
  if (mode === 'here') {
    const capBtn = document.createElement('button'); capBtn.type = 'button'; capBtn.className = 'au-primary'; capBtn.textContent = 'Capture'; capBtn.onclick = () => { void goCapture(); };
    const lab = document.createElement('span'); lab.textContent = 'Self-test'; lab.style.cssText = 'font-size:13px;font-weight:600;opacity:.6;margin-right:16px';
    cmds.append(lab); link('Run full', () => { void go('full'); }, cmds); link('Run quick', () => { void go('quick'); }, cmds);
    const more = link('Copy report  ›', () => { copies.hidden = !copies.hidden; }, cmds); more.style.cssText = 'margin:0 0 0 auto';
    copyRow();
    body.append(picker.el, speedRow, animRow, capBtn, cmds, copies);
    root.append(head, status, bar, pctLine, capStop, body, saveRow, out);
  } else {
    btn('Copy report', () => { if (last) copy(renderText(last), 'The report'); }); btn('Copy short', () => { if (last) copy(renderText(last, { short: true }), 'The short report'); }); btn('Copy JSON', () => { if (last) copy(renderJson(last), 'The JSON'); });
    root.append(head, status, bar, pctLine, row, saveRow, out);
  }
  document.body.append(root);
  attach('audit', { run: (d: 'quick' | 'full' = 'full') => go(d), text: () => (last ? renderText(last) : ''), json: () => (last ? renderJson(last) : ''), stop: () => { stop = true; } });
  if (mode === 'run') {
    post({ audit: 'hello' });
    // (the app inside a frame: wait for the page to be still after boot, then walk it)
    clock.after(() => { void settle().then(() => go(depthOf())); }, 1500);
  }
}
function post(m: Msg): void { try { parent.postMessage(m, location.origin); } catch { /* no parent: standing alone */ } }
