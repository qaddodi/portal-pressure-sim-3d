// The one background slot (src/clock/idle.ts, loading plan L1): a job never runs while anything moves or a finger is down, resumes after quiet, stops a slice at its budget, and
// defers its next step when input is waiting. A fake environment drives it: no real time, no browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createQuiet, QUIET_INPUT_MS, REST_MS, type QuietEnv, type SlotStat } from '../src/clock/idle.ts';

function fake(opts: { idle?: boolean } = {}) {
  let t = 1000, nextId = 1, held = 0, down = false, lastInput = -1e9, pending = false;
  const timers = new Map<number, { at: number; fn: () => void }>();
  const posts: (() => void)[] = [];
  const calm = new Set<() => void>();
  const sliced: { tag: string; ms: number }[] = [];
  const finished: SlotStat[] = [];
  let idleCalls = 0, postCalls = 0;
  const env: QuietEnv = {
    now: () => t,
    held: () => held,
    onCalm: (fn) => { calm.add(fn); return () => { calm.delete(fn); }; },
    after: (fn, ms) => { const id = nextId++; timers.set(id, { at: t + ms, fn }); return id; },
    cancel: (id) => { if (id !== null) timers.delete(id); },
    idle: opts.idle ? (fn) => { idleCalls++; posts.push(fn); } : undefined,
    post: (fn) => { postCalls++; posts.push(fn); },
    input: { last: () => lastInput, down: () => down, pending: () => pending },
    sliced: (tag, a, b) => sliced.push({ tag, ms: b - a }),
    finished: (s) => finished.push({ ...s }),
  };
  /** Run everything that is due, in order, until nothing is left to run at or before `until`. */
  const run = (until: number) => {
    for (let guard = 0; guard < 10000; guard++) {
      if (posts.length) { posts.shift()!(); continue; }
      const due = [...timers.entries()].filter(([, x]) => x.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) { t = Math.max(t, until); return; }
      timers.delete(due[0]); t = Math.max(t, due[1].at); due[1].fn();
    }
    throw new Error('the slot never settled');
  };
  return {
    env, run, finished, sliced,
    get t() { return t; }, advance: (ms: number) => { t += ms; },
    hold: (n: number) => { held = n; if (n === 0) for (const f of [...calm]) f(); },
    finger: (d: boolean) => { down = d; lastInput = t; },
    input: () => { lastInput = t; },
    setPending: (p: boolean) => { pending = p; },
    counts: () => ({ idleCalls, postCalls }),
  };
}
/** A job of `total` steps, each costing `cost` ms of fake time; records when each step ran. */
const job = (f: ReturnType<typeof fake>, total: number, cost = 1) => { const ran: number[] = []; let n = 0; return { ran, step: () => { ran.push(f.t); f.advance(cost); return ++n >= total; } }; };

test('a job does not run while a hold is live (a tween, camera move, gesture or deck entry) and resumes after quiet', () => {
  const f = fake(), q = createQuiet(f.env), j = job(f, 3);
  f.hold(1);
  q.whenQuiet(j.step, { tag: 'a' });
  f.run(f.t + 5000);
  assert.equal(j.ran.length, 0, 'nothing ran under motion');
  f.hold(0);
  f.run(f.t + 1000);
  assert.equal(j.ran.length, 3);
  assert.equal(q.stats()[0]!.done, true);
});

test('a job does not run while a finger is down, nor within 250 ms of the last input', () => {
  const f = fake(), q = createQuiet(f.env), j = job(f, 2);
  f.finger(true);
  q.whenQuiet(j.step, { tag: 'a' });
  f.run(f.t + 3000);
  assert.equal(j.ran.length, 0, 'a finger is down');
  f.finger(false);
  const up = f.t;
  f.run(up + QUIET_INPUT_MS - 20);
  assert.equal(j.ran.length, 0, 'inside the input gap');
  f.run(up + QUIET_INPUT_MS + 100);
  assert.equal(j.ran.length, 2);
  assert.ok(j.ran[0]! >= up + QUIET_INPUT_MS, 'the first step came after the gap');
});

test('a slice stops at its budget and the next one waits for the rest', () => {
  const f = fake(), q = createQuiet(f.env), j = job(f, 20, 1);
  q.whenQuiet(j.step, { tag: 'a', budgetMs: 4 });
  f.run(f.t + 0);
  const s1 = j.ran.length;
  assert.ok(s1 >= 1 && s1 <= 5, `one slice took ${s1} steps of 1 ms for a 4 ms budget`);
  f.run(f.t + REST_MS + 1);
  assert.ok(j.ran.length > s1 && j.ran.length <= 2 * 5, 'the next slice ran only after the rest');
  f.run(f.t + 1000);
  assert.equal(j.ran.length, 20);
  const st = q.stats()[0]!;
  assert.ok(st.slices >= 4 && st.steps === 20 && st.worstStepMs === 1);
});

test('input arriving mid-slice defers the next step; the slice always takes at least one step', () => {
  const f = fake(), q = createQuiet(f.env);
  let n = 0;
  q.whenQuiet(() => { n++; f.advance(1); if (n === 2) f.setPending(true); return n >= 6; }, { tag: 'a', budgetMs: 100 });
  f.run(f.t + 0);
  assert.equal(n, 2, 'stopped after the step that saw the input arrive');
  f.setPending(false);
  f.run(f.t + 1000);
  assert.equal(n, 6);
  // (and with input pending from the start, a slice still makes one step of progress, so a job cannot starve)
  const g = fake(), q2 = createQuiet(g.env); g.setPending(true);
  let m = 0; q2.whenQuiet(() => { m++; g.advance(1); return m >= 3; }, { tag: 'b', budgetMs: 100 });
  g.run(g.t + 1000);
  assert.equal(m, 3);
});

test('the Safari path is a post-frame task, never a fixed timer; requestIdleCallback is used where it exists', () => {
  const s = fake(), q = createQuiet(s.env); q.whenQuiet(job(s, 1).step, { tag: 'a' });
  s.run(s.t + 100);
  assert.ok(s.counts().postCalls >= 1 && s.counts().idleCalls === 0, 'no idle callback: a posted task');
  const r = fake({ idle: true }), q2 = createQuiet(r.env); q2.whenQuiet(job(r, 1).step, { tag: 'a' });
  r.run(r.t + 100);
  assert.ok(r.counts().idleCalls >= 1 && r.counts().postCalls === 0, 'idle callback present: used');
});

test('jobs share the slot round robin, delayMs holds a job back, and cancel stops one', () => {
  const f = fake(), q = createQuiet(f.env), order: string[] = [];
  let a = 0, b = 0, c = 0;
  q.whenQuiet(() => { order.push('a'); f.advance(5); return ++a >= 2; }, { tag: 'a', budgetMs: 4 });
  q.whenQuiet(() => { order.push('b'); f.advance(5); return ++b >= 2; }, { tag: 'b', budgetMs: 4 });
  const late = q.whenQuiet(() => { order.push('c'); return ++c >= 1; }, { tag: 'c', delayMs: 500 });
  const gone = q.whenQuiet(() => { order.push('x'); return true; }, { tag: 'x' }); gone.cancel();
  f.run(f.t + 300);
  assert.deepEqual(order, ['a', 'b', 'a', 'b'], 'a slice each, round robin; c waits its delay; the cancelled one never runs');
  f.run(f.t + 400);
  assert.deepEqual(order.slice(4), ['c']);
  assert.equal(late.done, true);
});

test('rush lets the job the user waits for run through motion; maxWaitMs lets a network job go after its wait', () => {
  const f = fake(), q = createQuiet(f.env), j = job(f, 2), w = job(f, 1);
  f.hold(2);
  const h = q.whenQuiet(j.step, { tag: 'dive' });
  q.whenQuiet(w.step, { tag: 'net', maxWaitMs: 2000 });
  f.run(f.t + 1500);
  assert.equal(j.ran.length + w.ran.length, 0, 'both wait under motion');
  h.rush();
  f.run(f.t + 100);
  assert.equal(j.ran.length, 2, 'rushed: it ran while a hold was live');
  assert.equal(w.ran.length, 0);
  f.run(f.t + 1000);
  assert.equal(w.ran.length, 1, 'the max wait passed');
});

test('a step that throws finishes its job and the others carry on; a finished job reports its totals', () => {
  const f = fake(), q = createQuiet(f.env), j = job(f, 2);
  const err = console.error; console.error = () => undefined;
  try {
    q.whenQuiet(() => { throw new Error('boom'); }, { tag: 'bad' });
    q.whenQuiet(j.step, { tag: 'ok' });
    f.run(f.t + 1000);
  } finally { console.error = err; }
  assert.equal(j.ran.length, 2);
  assert.deepEqual(f.finished.map((s) => s.tag).sort(), ['bad', 'ok']);
  assert.equal(q.pending(), 0);
  assert.deepEqual(q.stats().map((s) => s.tag), ['bad', 'ok'], 'every tag is counted for ?perf');
});

test('a job started while moving waits for the calm signal, not a poll', () => {
  const f = fake(), q = createQuiet(f.env), j = job(f, 1);
  f.hold(1); q.whenQuiet(j.step, { tag: 'a' });
  f.run(f.t + 60000);
  assert.equal(j.ran.length, 0);
  f.hold(0); f.advance(QUIET_INPUT_MS + 1);
  f.run(f.t + 50);
  assert.equal(j.ran.length, 1);
});

test('the clock reports holds and tells the slot when the last one lets go; frameAround names the phase of a recent frame', async () => {
  const { createClock } = await import('../src/clock/frame.ts');
  let t = 0; const q: ((x: number) => void)[] = [];
  const c = createClock({ raf: (cb) => q.push(cb), cancel: () => undefined, now: () => t });
  let calm = 0; c.onCalm(() => calm++);
  const a = c.hold('a'), b = c.hold('b');
  assert.equal(c.held, 2); a.release(); assert.equal(calm, 0, 'one hold is still live'); b.release(); assert.equal(calm, 1); assert.equal(c.held, 0);
  b.release(); assert.equal(calm, 1, 'a second release of the same hold says nothing');
  c.on('render', () => { t += 30; });
  c.invalidate('x'); q.shift()!(t);
  assert.equal(c.frameAround(0, 40)?.phase, 'render');
  assert.equal(c.frameAround(500, 600), null);
});

test('no file outside src/clock/idle.ts asks the browser for idle time (the raw-idle lint rule, allowance 0), and the old helpers are gone (the Tests card modules are read in by the ladder, boot/warm.ts)', async () => {
  const { readFileSync, readdirSync } = await import('node:fs');
  const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(`${d}/${e.name}`) : /\.tsx?$/.test(e.name) ? [`${d}/${e.name}`] : []);
  const bad = walk('src').filter((f) => f !== 'src/clock/idle.ts' && /requestIdleCallback|cancelIdleCallback/.test(readFileSync(f, 'utf8').replace(/\/\/.*$/gm, '')));
  assert.deepEqual(bad, []);
  for (const f of ['src/scene/scene.ts', 'src/scene/Stage.tsx', 'src/scene/organs/layer.ts', 'src/pwa/register.ts', 'src/boot/warm.ts']) assert.match(readFileSync(f, 'utf8'), /whenQuiet(Once)?\(/, `${f} uses the slot`);
});

test('the preload ladder runs its rungs on the shared slot (quietSlot), one per slot', async () => {
  const { readFileSync } = await import('node:fs');
  const w = readFileSync('src/boot/warm.ts', 'utf8');
  assert.match(w, /slot: Slot = quietSlot/);
  assert.match(w, /quietSlot: Slot = [^\n]*whenQuietOnce\(go, \{ tag: 'ladder'/, 'the slot is the shared one (after the cover has lifted: boot-splash.test.ts)');
});

test('the slot never keeps a Node process alive on its own (its MessageChannel is unref\'d): node tests that touch it exit', async () => {
  const { spawnSync } = await import('node:child_process');
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', "const m = await import('./src/clock/idle.ts'); m.whenQuietOnce(() => {}, { tag: 'exit-check' });"], { timeout: 60000, encoding: 'utf8' });
  assert.notEqual(r.signal, 'SIGTERM', 'the process hung on the slot');
  assert.equal(r.status, 0, r.stderr);
});

test('the stat names the job\'s slowest step (QuietOpts.label), and the boot digest prints it (audit 1161e159: a 2 819 ms step in the micro slot had no name)', async () => {
  const f = fake(), q = createQuiet(f.env);
  let what = '', n = 0;
  const costs = [1, 1, 40, 1, 2];
  q.whenQuiet(() => { what = `step ${n}`; f.advance(costs[n]!); return ++n >= costs.length; }, { tag: 'a', label: () => what, budgetMs: 1000 });
  f.run(f.t + 1000);
  const st = q.stats()[0]!;
  assert.equal(st.worstStepMs, 40);
  assert.equal(st.worstLabel, 'step 2');
  const { bootLines } = await import('../src/boot/boot-lines.ts');
  const lines = bootLines({ stamps: {}, firstByte: 0, late: { total: 0, rows: [] }, longTasks: { measured: true, by: 'timer', total: 0, rows: [] }, slots: [st], parallelCompile: true } as never);
  assert.ok(lines.some((l) => l.includes('worst step 40.0 ms (step 2)')), lines.join('\n'));
});

test('a rushed job takes a task of its own, never the browser\'s idle callback (a page that draws every frame is never idle: F10, the Lobule that never opened)', () => {
  const f = fake({ idle: true }), q = createQuiet(f.env), a = job(f, 3), b = job(f, 3);
  q.whenQuiet(a.step, { tag: 'calm' });
  f.run(f.t + 200);
  assert.ok(f.counts().idleCalls > 0, 'an unrushed job waits for idle time');
  assert.equal(a.ran.length, 3);
  const before = f.counts().idleCalls;
  f.hold(1);
  const h = q.whenQuiet(b.step, { tag: 'dive' });
  h.rush();
  f.run(f.t + 200);
  assert.equal(b.ran.length, 3, 'rushed: it ran under the hold');
  assert.equal(f.counts().idleCalls, before, 'and asked the browser for no idle time');
});

test('a rushed job rests half as long between slices as an unrushed one', () => {
  const rest = (rush: boolean) => {
    const f = fake(), q = createQuiet(f.env), j = job(f, 40, 3);   // (40 steps of 3 ms: several 4 ms slices)
    const h = q.whenQuiet(j.step, { tag: 'x', budgetMs: 4 });
    if (rush) h.rush();
    f.run(f.t + 5000);
    const gaps = j.ran.slice(1).map((t, i) => t - j.ran[i]! - 3).filter((g) => g > 0);
    return Math.min(...gaps);
  };
  assert.ok(rest(true) < rest(false), `rush ${rest(true)} ms, calm ${rest(false)} ms`);
});
