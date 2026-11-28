// The global error net (what a boundary cannot see): handlers, timers, promises and a clock system that throws are kept for the reports, and a storm of them shows the quiet recovery.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BROKEN_COUNT, BROKEN_WINDOW_MS, QUIET_MS, KEEP, createNet, crashDetails, ignorable, toFault } from '../src/boot/crash-net.ts';
import { createClock } from '../src/clock/frame.ts';
import { setClockFaultSink } from '../src/clock/frame.ts';
import { caughtCount, resetCaught } from '../src/ui/debug/caught.ts';

function net(online = true) {
  let t = 1000, broken = 0, quiet = 0;
  const n = createNet({ now: () => t, online: () => online, onBroken: () => { broken++; }, onQuiet: () => { quiet++; } });
  return { n, tick: (ms: number) => { t += ms; }, broken: () => broken, quiet: () => quiet };
}

test('a stray error is kept for the reports and does not show the note', () => {
  const x = net();
  x.n.report('window', new Error('one off'));
  assert.equal(x.n.recent().length, 1); assert.equal(x.broken(), 0);
});
test('a storm (5 inside 10 s) shows the note once; spread out it never does', () => {
  const x = net();
  for (let i = 0; i < BROKEN_COUNT; i++) { x.n.report('clock:render', new Error('every frame')); x.tick(100); }
  assert.equal(x.broken(), 1);
  for (let i = 0; i < 20; i++) x.n.report('clock:render', new Error('more'));
  assert.equal(x.broken(), 1, 'said once');
  const y = net();
  for (let i = 0; i < 30; i++) { y.n.report('window', new Error('slow drip')); y.tick(BROKEN_WINDOW_MS / 2 + 1); }
  assert.equal(y.broken(), 0);
});
test('Keep going puts the note away and the count restarts only after the quiet time', () => {
  const x = net();
  for (let i = 0; i < BROKEN_COUNT; i++) x.n.report('promise', new Error('boom'));
  x.n.dismiss(); assert.equal(x.quiet(), 1);
  for (let i = 0; i < 10; i++) x.n.report('promise', new Error('still'));
  assert.equal(x.broken(), 1, 'silent while quiet');
  x.tick(QUIET_MS + 1);
  for (let i = 0; i < BROKEN_COUNT; i++) x.n.report('promise', new Error('again'));
  assert.equal(x.broken(), 2);
});
test('a boundary\'s catch is kept but not counted toward broken (its card already showed)', () => {
  const x = net();
  for (let i = 0; i < 10; i++) x.n.report('react:figure', new Error('render'), { count: false });
  assert.equal(x.broken(), 0); assert.equal(x.n.recent().length, 10);
});
test('noise and handled failures are neither kept nor counted', () => {
  const x = net(false);
  for (let i = 0; i < 10; i++) {
    x.n.report('window', 'ResizeObserver loop completed with undelivered notifications.');
    x.n.report('promise', Object.assign(new Error('The user aborted a request.'), { name: 'AbortError' }));
    x.n.report('window', 'Script error.');
    x.n.report('promise', Object.assign(new Error('x'), { name: 'ChunkError' }));
    x.n.report('promise', new TypeError('Failed to fetch'));
    x.n.report('window', 'boom', { file: 'chrome-extension://abc/content.js' });
  }
  assert.equal(x.n.recent().length, 0); assert.equal(x.broken(), 0);
  assert.equal(ignorable('Failed to fetch', 'TypeError', '', true), false, 'online, a failed fetch is a fault');
});
test('what is kept is short: the first line of the message and three stack lines; the list is capped', () => {
  const e = new Error('first line\nsecond line'); e.stack = 'Error: first line\n    at a (x.js:1:1)\n    at b (x.js:2:2)\n    at c (x.js:3:3)\n    at d (x.js:4:4)';
  const f = toFault('window', e, 12.6);
  assert.equal(f.message, 'first line'); assert.equal(f.stack.split(' | ').length, 3); assert.equal(f.at, 13);
  assert.equal(toFault('promise', 'plain string', 0).message, 'plain string');
  assert.equal(toFault('promise', undefined, 0).message, 'undefined');
  const x = net(); for (let i = 0; i < KEEP + 10; i++) x.n.report('window', new Error(`e${i}`), { count: false });
  assert.equal(x.n.recent().length, KEEP); assert.equal(x.n.recent().at(-1)!.message, `e${KEEP + 9}`);
});
test('Copy details carries the recent errors', () => {
  assert.equal(crashDetails('boom', 'b', 'ua', '[window 1 ms] x'), 'boom\nBuild: b\nBrowser: ua\nRecent errors:\n[window 1 ms] x');
  assert.equal(crashDetails('boom', 'b', 'ua'), 'boom\nBuild: b\nBrowser: ua');
});
test('a clock system that throws is reported to the net, the other systems still run, and the loop goes on', () => {
  const faults: string[] = []; setClockFaultSink((p, e) => faults.push(`${p}:${(e as Error).message}`));
  let cb: ((t: number) => void) | null = null, t = 0;
  const c = createClock({ raf: (f) => { cb = f; return 1; }, cancel: () => undefined, now: () => t });
  let ran = 0;
  c.on('tween', () => { throw new Error('bad tween'); }); c.on('tween', () => { ran++; }, 1);
  c.invalidate('x'); cb!(0);
  assert.deepEqual(faults, ['tween:bad tween']); assert.equal(ran, 1);
  setClockFaultSink(null);
});
test('wiring: the net is installed before the app, feeds caught() once, and the note and Send feedback carry it', () => {
  const m = readFileSync('src/main.tsx', 'utf8');
  assert.ok(m.indexOf('installCrashNet();') > 0 && m.indexOf('installCrashNet();') < m.indexOf('async function start'));
  const net = readFileSync('src/boot/crash-net.ts', 'utf8');
  assert.match(net, /addEventListener\('error'/); assert.match(net, /addEventListener\('unhandledrejection'/); assert.match(net, /setClockFaultSink\(/);
  assert.ok(!/addEventListener/.test(readFileSync('src/ui/debug/caught.ts', 'utf8')), 'one listener per event, not two counts');
  assert.match(readFileSync('src/App.tsx', 'utf8'), /<ErrorNote \/>/);
  assert.match(readFileSync('src/ui/debug/packet/sources.ts', 'utf8'), /rule: 'uncaught-error'/);
  for (const f of ['src/ui/shell/AppBoundary.tsx', 'src/ui/cards/CardBoundary.tsx', 'src/ui/shell/LazyBoundary.tsx']) assert.match(readFileSync(f, 'utf8'), /noteFault\(/, f);
  assert.match(readFileSync('src/ui/shell/ErrorNote.tsx', 'utf8'), /opacity: broken \? 1 : 0/);
  resetCaught(); assert.equal(caughtCount(), 0);
});

test('?gl Throw a fault: enough uncaught errors to trip the net, the last a rejected promise; the button is preview-only', async () => {
  const { throwFaults, TEST_FAULT } = await import('../src/debug/gl-fault.ts');
  const jobs: { fn: () => void; ms: number }[] = [];
  assert.equal(throwFaults((fn, ms) => { jobs.push({ fn, ms }); }), BROKEN_COUNT);
  assert.equal(jobs.length, BROKEN_COUNT);
  assert.ok(jobs.at(-1)!.ms < BROKEN_WINDOW_MS, 'all inside the window');
  for (const j of jobs.slice(0, -1)) assert.throws(j.fn, new RegExp(TEST_FAULT.replace('?', '\\?')));
  const orig = process.listeners('unhandledRejection'); process.removeAllListeners('unhandledRejection');
  let rej: unknown = null; process.once('unhandledRejection', (r) => { rej = r; });
  jobs.at(-1)!.fn(); await new Promise((r) => setTimeout(r, 20));
  for (const l of orig) process.on('unhandledRejection', l as never);
  assert.match(String((rej as Error)?.message), new RegExp(TEST_FAULT.replace('?', '\\?')));
  assert.match(readFileSync('src/debug/gl-check.tsx', 'utf8'), /isPreview\(\) && <button[\s\S]{0,400}Throw a fault/);
});

import { FAULT_KEY, sessionFaultStore, viewOf, faultsText } from '../src/boot/crash-net.ts';
import { feedbackBase } from '../src/ui/shell/feedback.ts';
function mem() { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, m }; }

test('the ring carries build, view and time, is kept in sessionStorage, and survives a reload', () => {
  const s = mem(), store = sessionFaultStore(s);
  const mk = () => createNet({ now: () => 5, online: () => true, onBroken: () => undefined, store, ctx: () => ({ build: 'b1', view: '#/talk', when: '2026-11-28T00:00:00.000Z' }) });
  const a = mk(); a.report('window', new Error('boom'));
  assert.equal(a.recent()[0]!.build, 'b1'); assert.equal(a.recent()[0]!.view, '#/talk');
  assert.ok(s.m.has(FAULT_KEY));
  assert.equal(mk().recent()[0]!.message, 'boom', 'a reload still has it');
  for (let i = 0; i < KEEP + 5; i++) a.report('window', new Error(`e${i}`));
  assert.equal(JSON.parse(s.m.get(FAULT_KEY)!).length, KEEP);
});
test('a blocked or broken sessionStorage never throws; a link’s script never rides in the view', () => {
  assert.deepEqual(sessionFaultStore({ getItem: () => { throw new Error('no'); }, setItem: () => { throw new Error('no'); } }).load(), []);
  sessionFaultStore({ getItem: () => 'not json', setItem: () => { throw new Error('full'); } }).save([]);
  assert.deepEqual(sessionFaultStore({ getItem: () => '{"a":1}', setItem: () => undefined }).load(), []);
  assert.equal(viewOf('#script=SECRETPAYLOAD'), '#script');
  assert.equal(viewOf(''), '/');
});
test('the feedback draft lists recent errors only when there are some; the note offers Send report only with an address in the build', () => {
  const c = { build: 'b', device: 'd', screen: 's', view: 'v' };
  assert.ok(!feedbackBase(c).includes('Recent errors'));
  assert.match(feedbackBase({ ...c, errors: '[x] boom' }), /Recent errors:\n\[x\] boom$/);
  assert.equal(typeof faultsText, 'function');
  const note = readFileSync('src/ui/shell/ErrorNote.tsx', 'utf8');
  assert.match(note, /email \? <button[^]*?>\{ERROR_NOTE\.send\}/);
  assert.match(readFileSync('src/ui/shell/send-feedback.ts', 'utf8'), /errors: faultsText\(DRAFT_ERRORS\)/);
});
