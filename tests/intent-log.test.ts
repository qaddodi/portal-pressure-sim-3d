import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { setLayer, clearLayer, useIntent } from '../src/scene/intent.ts';
import { intentLog, clearIntentLog, logInput, plain, LOG_MAX, LOG_MS } from '../src/scene/intent-log.ts';
import { replayIntents, replayText, cleanLog } from '../src/scene/intent-replay.ts';
import { clock } from '../src/clock/frame.ts';

const fresh = () => { useIntent.setState({ layers: {} }); clearIntentLog(); };

test('every setLayer and clearLayer is noted in order, with the inputs; clearing a layer that is not there notes nothing', () => {
  fresh();
  setLayer('talk', { named: ['SV'], marked: ['PV'] }); logInput('stop 3'); clearLayer('talk'); clearLayer('talk');
  const l = intentLog();
  assert.deepEqual(l.map((e) => e.op), ['set', 'input', 'clear']);
  assert.deepEqual((l[0] as { patch: unknown }).patch, { named: ['SV'], marked: ['PV'] });
  fresh();
});

test('the ring keeps at most LOG_MAX entries and nothing older than a minute; the since reference is its length, long lists are cut', () => {
  fresh();
  for (let i = 0; i < LOG_MAX + 50; i++) logInput(`n ${i}`);
  assert.equal(intentLog().length, LOG_MAX);
  assert.equal((intentLog().at(-1) as { what: string }).what, `n ${LOG_MAX + 49}`);
  assert.deepEqual(plain({ sinceRef: new Float64Array(7), named: Array.from({ length: 40 }, (_, i) => `e${i}`), picked: null }), { sinceRef: { n: 7 }, named: Array.from({ length: 24 }, (_, i) => `e${i}`), picked: null });
  assert.equal(LOG_MS, 60000);
  fresh();
});

test('a log replays to the calls the reconciler made, step by step, and ends where the layers end', () => {
  fresh();
  setLayer('base', { picked: 'SV' });
  setLayer('talk', { named: ['PV_TRUNK'], marked: ['SMV'], resistors: ['rLiver'] });
  setLayer('tool', { marked: ['A', 'B'] });
  clearLayer('tool'); clearLayer('talk');
  const r = replayIntents(intentLog());
  assert.deepEqual(r.steps[0]!.calls, ['pick("SV")']);
  assert.ok(r.steps[1]!.calls.some((c) => c.startsWith('markVessels(["SMV"]')) && !r.steps[1]!.calls.some((c) => c.startsWith('pick')), 'lit vessels hide the pick');
  assert.deepEqual(r.steps.at(-1)!.calls.filter((c) => c.startsWith('pick')), ['pick("SV")'], 'leaving the talk puts the pick back');
  assert.equal(r.final.picked, 'SV'); assert.deepEqual(r.layersOn, ['base']);
  assert.match(replayText(r), /at the end: layers on: base/);
  fresh();
});

test('a log read from a paste keeps only what replay can use', () => {
  const l = cleanLog([{ t: 1, op: 'set', layer: 'talk', patch: { named: ['x'] } }, { t: 2, op: 'set', layer: 'evil' }, { op: 'clear', layer: 'talk' }, 'x', { t: 3, op: 'input', what: 'view lobule' }, { t: 4, op: 'clear', layer: 'talk' }]);
  assert.deepEqual(l.map((e) => e.op), ['set', 'input', 'clear']);
  assert.deepEqual(cleanLog('no'), []);
});

test('the debug CLI replays a packet\'s log without a browser, and says so when a packet has none', () => {
  fresh(); setLayer('talk', { named: ['SV'] }); const log = intentLog(); fresh();
  const dir = mkdtempSync(join(tmpdir(), 'ilog-'));
  const packet = (state: unknown) => { const p = { kind: 'pps-bug-packet', v: 1, id: 'abc', at: '2026-11-22T00:00:00.000Z', note: '', build: {}, device: {}, health: {}, link: '', state, findings: [], screen: null, history: null, missing: [] }; const f = join(dir, `p${Math.random()}.json`); writeFileSync(f, JSON.stringify(p)); return f; };
  const run = (f: string) => spawnSync(process.execPath, ['--experimental-strip-types', 'scripts/debug.mjs', 'packet', 'replay', f], { encoding: 'utf8' });
  const ok = run(packet({ v: 1, preset: 'csph', x: {}, log }));
  assert.equal(ok.status, 0, ok.stderr); assert.match(ok.stdout, /set talk/); assert.match(ok.stdout, /setNamedVessels\(\["SV"\]\)/);
  const none = run(packet({ v: 1, preset: 'csph', x: {} }));
  assert.equal(none.status, 1); assert.match(none.stderr, /no intent log/);
  void clock; void readFileSync;
});

test('the log is wired: the packet carries it in `state.log` (not in the link), and the inputs are noted at boot', () => {
  assert.match(readFileSync('src/ui/debug/packet/sources.ts', 'utf8'), /state\.log = log/);
  assert.match(readFileSync('src/ui/action/boot.ts', 'utf8'), /logInput\(`view /);
});
