// The preload ladder (loading plan L7): rungs in order, one per slot, none under Save-Data, a failed rung does not stop the next; every instrument module and every instrument GL program is on it
// (or named as not needing it), so a new instrument fails here until it is added; the program warm-up keeps a linked program for the instrument's own build, on the same context only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RUNGS, MODULE_ORDER, runLadder, type Rung, type Slot } from '../src/boot/warm.ts';
import { LOADERS } from '../src/ui/tests/dock/lazy.ts';
import { PROGRAM_SETS, NOT_WARMED, warmProgram, takeWarm, clearWarm, warmHeld, SPECTRUM_PROGRAM, type Prog } from '../src/boot/warm-programs.ts';
import { rawPrograms } from '../src/debug/gl-registry.ts';

const FIBRO = readFileSync('src/ui/tests/fibro/copied/fibro-gl.copied.js', 'utf8');
/** A slot the test opens by hand: nothing runs until go() is called (a person is moving something until then). */
function handSlot() { const waiting: (() => void)[] = []; const slot: Slot = (go) => { waiting.push(go); }; return { slot, open: async () => { waiting.shift()?.(); await new Promise((r) => setImmediate(r)); }, count: () => waiting.length }; }

test('rungs run in order, one per slot, and none while the slot is closed', async () => {
  const log: string[] = []; const h = handSlot();
  const rungs: Rung[] = ['a', 'b', 'c'].map((id) => ({ id, run: () => { log.push(id); } }));
  const done = runLadder(rungs, h.slot, { lowData: () => false, time: (_id, fn) => fn() });
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(log, [], 'nothing runs before a quiet slot');
  await h.open(); assert.deepEqual(log, ['a']);
  await h.open(); assert.deepEqual(log, ['a', 'b']);
  assert.equal(h.count(), 1, 'one slot is asked at a time');
  await h.open();
  assert.deepEqual(await done, ['a', 'b', 'c']);
});

test('Save-Data stops the ladder at the next rung\'s turn, even when it came on in the middle', async () => {
  let saving = false; const log: string[] = [];
  const rungs: Rung[] = ['a', 'b', 'c'].map((id) => ({ id, run: () => { log.push(id); if (id === 'a') saving = true; } }));
  const ran = await runLadder(rungs, (go) => go(), { lowData: () => saving, time: (_id, fn) => fn() });
  assert.deepEqual(ran, ['a']); assert.deepEqual(log, ['a']);
  assert.deepEqual(await runLadder(rungs, (go) => go(), { lowData: () => true, time: (_id, fn) => fn() }), [], 'under Save-Data from the start nothing is read');
});

test('a rung that throws or rejects does not stop the next', async () => {
  const log: string[] = [];
  const rungs: Rung[] = [{ id: 'x', run: () => { throw new Error('no'); } }, { id: 'y', run: () => Promise.reject(new Error('no')) }, { id: 'z', run: () => { log.push('z'); } }];
  assert.deepEqual(await runLadder(rungs, (go) => go(), { lowData: () => false, time: (_id, fn) => fn() }), ['x', 'y', 'z']);
  assert.deepEqual(log, ['z']);
});

test('every instrument module and the talk\'s charts are on the ladder, in the likely order, before the programs', () => {
  assert.deepEqual([...MODULE_ORDER].sort(), Object.keys(LOADERS).sort(), 'a new LOADERS entry fails here until it is on the ladder');
  const ids = RUNGS.map((r) => r.id);
  assert.deepEqual(ids.slice(0, 7), ['module:doppler', 'module:endoscopy', 'module:hvpg', 'module:fibroscan', 'module:profile', 'module:trials', 'module:talk']);
  assert.ok(ids.indexOf('programs:charts') > ids.indexOf('module:talk'));
  for (const s of PROGRAM_SETS) assert.ok(ids.includes(`programs:${s.name}`));
  assert.equal(new Set(ids).size, ids.length);
  assert.match(readFileSync('src/boot/warm.ts', 'utf8'), /loadToolCard\(\)/);
});

test('every instrument program in the ?gl list is compiled by the ladder, or named as not needing it; the sources are the ?gl list\'s', async () => {
  const raw = rawPrograms(FIBRO);
  const scene = /^(circuit|dye|skin|vessel|clot|organ|blood|post|lobule|bleed)/;
  const instruments = raw.filter((p) => !scene.test(p.name));
  assert.ok(instruments.length >= 5);
  const warmed = new Map<string, Prog>();
  for (const s of PROGRAM_SETS) for (const p of await s.load()) warmed.set(p.name, p);
  for (const p of instruments) {
    if (p.name === 'charts') continue;   // (made with the shared context: sharedContext() on its rung)
    assert.ok(warmed.has(p.name) || p.name in NOT_WARMED, `${p.name}: add it to PROGRAM_SETS in boot/warm-programs.ts, or say why it needs no warm-up in NOT_WARMED`);
  }
  for (const [name, w] of warmed) {
    const r = raw.find((p) => p.name === name)!;
    assert.ok(r, `${name} is in the ?gl list`);
    assert.equal(w.vs, r.vertexGlsl, `${name}: the same vertex source`); assert.equal(w.fs, r.fragmentGlsl, `${name}: the same fragment source`);
  }
  for (const n of Object.keys(NOT_WARMED)) assert.ok(raw.some((p) => p.name === n), `${n} named in NOT_WARMED is a real program`);
  assert.ok(RUNGS.some((r) => r.id === 'programs:charts'));
});

// a stand-in driver: a program is "done" after `polls` completion checks
function fakeGL(o: { parallel: boolean; polls?: number; link?: boolean; lost?: boolean } = { parallel: true }) {
  let checks = 0; const calls: string[] = [];
  const gl: any = {
    VERTEX_SHADER: 1, FRAGMENT_SHADER: 2, LINK_STATUS: 3, calls,
    getExtension: () => (o.parallel ? { COMPLETION_STATUS_KHR: 9 } : null),
    createProgram: () => ({}), createShader: () => ({}), shaderSource() {}, compileShader() {}, attachShader() {}, bindAttribLocation: (_p: unknown, l: number, n: string) => { calls.push(`bind ${n}=${l}`); }, linkProgram() { calls.push('link'); },
    getProgramParameter: (_p: unknown, k: number) => (k === 9 ? ++checks > (o.polls ?? 0) : o.link !== false),
    deleteShader() {}, deleteProgram() { calls.push('deleteProgram'); }, isContextLost: () => !!o.lost,
  };
  return gl;
}
const prog: Prog = { name: SPECTRUM_PROGRAM, vs: 'v', fs: 'f', bind: [['q', 0]] };

test('the warm-up starts the program, binds its attributes, waits for the driver on a timer, then keeps it for the instrument\'s own build (same context and generation only, once)', async () => {
  clearWarm();
  const gl = fakeGL({ parallel: true, polls: 3 }); const timers: number[] = []; const defer: (() => void)[] = [];
  const done = warmProgram(prog, { gl, gen: 2 }, (fn, ms) => { timers.push(ms); defer.push(fn); });
  assert.deepEqual(gl.calls, ['bind q=0', 'link']);
  assert.equal(warmHeld(SPECTRUM_PROGRAM), false, 'not done yet');
  while (defer.length) defer.shift()!();
  assert.equal(await done, true); assert.ok(timers.length >= 2 && timers.every((t) => t === 8), 'polled, never a frame');
  assert.equal(takeWarm(SPECTRUM_PROGRAM, fakeGL(), 2), null, 'another context has no use for it');
  assert.equal(warmHeld(SPECTRUM_PROGRAM), false, 'and taking it (even wrongly) uses it up');
  clearWarm();
  await warmProgram(prog, { gl, gen: 2 }, (fn) => fn());
  assert.equal(takeWarm(SPECTRUM_PROGRAM, gl, 3), null, 'a context made again has none of its programs');
  await warmProgram(prog, { gl, gen: 2 }, (fn) => fn());
  assert.ok(takeWarm(SPECTRUM_PROGRAM, gl, 2)); assert.equal(takeWarm(SPECTRUM_PROGRAM, gl, 2), null, 'once');
});

test('without the parallel-compile extension the status is read at once; a failed link, a lost context or no context keep nothing', async () => {
  clearWarm();
  assert.equal(await warmProgram(prog, { gl: fakeGL({ parallel: false }), gen: 1 }, () => { throw new Error('no timer needed'); }), true);
  clearWarm();
  const bad = fakeGL({ parallel: true, link: false });
  assert.equal(await warmProgram(prog, { gl: bad, gen: 1 }, (fn) => fn()), false); assert.ok(bad.calls.includes('deleteProgram')); assert.equal(warmHeld(SPECTRUM_PROGRAM), false);
  assert.equal(await warmProgram(prog, { gl: fakeGL({ parallel: true, lost: true }), gen: 1 }), false);
  assert.equal(await warmProgram(prog, null), false);
});

test('the Doppler spectrum and the scope\'s field take the warm program when there is one, and still build their own when there is not', () => {
  for (const [f, name] of [['src/ui/tests/doppler/spectrum-gl.ts', 'SPECTRUM_PROGRAM'], ['src/ui/tests/endo/endo-under.ts', 'ENDO_PROGRAM']] as const) {
    const t = readFileSync(f, 'utf8');
    assert.match(t, new RegExp(`takeWarm\\(${name}, gl, gen\\)`));
    assert.match(t, /if \(!prog\) \{[\s\S]*?createProgram\(\)/, `${f} keeps its own build as the fallback`);
  }
  assert.doesNotMatch(readFileSync('src/ui/tests/TestsLayer.tsx', 'utf8'), /requestIdleCallback/, 'one ladder reads the instruments in, not a second idle burst');
});

// 22 Nov splash review, item 9: a program rung reads its sources in BEFORE its slot, and starts every program inside it, so the compile (and a driver's synchronous status read) is the slot's work, never the tail of a fetch.
test('a rung with a load reads it before its slot and runs inside the slot with what it read; Save-Data stops before the load', async () => {
  const log: string[] = [];
  const rungs: Rung[] = [{ id: 'p', load: async () => { log.push('load'); return [1, 2]; }, run: (l) => { log.push(`run:${JSON.stringify(l)}`); } }];
  await runLadder(rungs, (go) => { log.push('slot'); go(); }, { lowData: () => false, time: (_id, fn) => fn() });
  assert.deepEqual(log, ['load', 'slot', 'run:[1,2]']);
  log.length = 0;
  await runLadder(rungs, (go) => go(), { lowData: () => true, time: (_id, fn) => fn() });
  assert.equal(log.length, 0, 'under Save-Data nothing is fetched');
  // a load that fails leaves the rung for its first use and the next one runs
  const ran = await runLadder([{ id: 'bad', load: () => Promise.reject(new Error('no')), run: () => { log.push('never'); } }, { id: 'ok', run: () => { log.push('ok'); } }], (go) => go(), { lowData: () => false, time: (_id, fn) => fn() });
  assert.deepEqual(ran, ['ok']); assert.deepEqual(log, ['ok']);
});

test('every program rung of the ladder has a load (its sources are read in before the slot)', () => {
  for (const r of RUNGS) if (r.id.startsWith('programs:') && r.id !== 'programs:charts') assert.equal(typeof r.load, 'function', r.id);
});
