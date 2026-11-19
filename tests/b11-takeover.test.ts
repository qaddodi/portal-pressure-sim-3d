// The monitor takeover (Tests > Endoscopy EUS-PPG, Tests > IR PPG by IR): the 2D app's own clock (monitor-takeover.js, copied) and the EUS-PPG's monitor on the 2D script.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createTakeover, HOLD_MS } from '../src/ui/tests/copied/monitor-takeover.copied.js';
import { eusMonitor, eusAt, eusSource, eusWords, resetMonitor, M } from '../src/ui/tests/endo/eus-source.ts';
import { READS } from '../src/scene/procedures/copied/proc-anim.js';
import { scriptOf } from '../src/ui/tests/ir/copied/reading-scripts.copied.js';
import { EUS_AR, monitorHeight, captionOf } from '../src/ui/tests/endo/eus-words.ts';
import type { TextShape } from '../src/ui/charts/scene.ts';

const words = (f: { shapes: readonly { k: string }[] }) => (f.shapes.filter((s) => s.k === 'text') as TextShape[]).map((s) => s.s);
function timer() {
  const q: { f: () => void; ms: number; id: number }[] = []; let n = 0;
  return { set: (f: () => void, ms: number) => { q.push({ f, ms, id: ++n }); return n; }, clear: (id: number) => { const i = q.findIndex((x) => x.id === id); if (i >= 0) q.splice(i, 1); }, q };
}

test('the takeover holds a finished result for the 2D six seconds, a tap takes it away sooner, a stopped run gives the place back', () => {
  assert.equal(HOLD_MS, 6000);
  const t = timer(), seen: string[] = [];
  const tk = createTakeover({ onChange: (p: string) => seen.push(p), timer: t });
  tk.start(); assert.equal(tk.phase(), 'run'); assert.ok(tk.shown());
  tk.close(); assert.equal(tk.phase(), 'run', 'a run in play is left to finish its own way');
  tk.finish(true); assert.equal(tk.phase(), 'hold'); assert.equal(t.q[0]!.ms, 6000);
  const fire = t.q.shift()!; fire.f(); assert.equal(tk.phase(), 'idle');
  tk.start(); tk.finish(true); tk.close(); assert.equal(tk.phase(), 'idle'); assert.equal(t.q.length, 0, 'the hold timer is cleared');
  tk.start(); tk.finish(false); assert.equal(tk.phase(), 'idle', 'a stopped measurement is not held');
  assert.deepEqual(seen, ['run', 'hold', 'idle', 'run', 'hold', 'idle', 'run', 'idle']);
});

test('the EUS-PPG and the PPG by IR use the 2D takeover, not a clock of their own', () => {
  const eus = readFileSync(new URL('../src/ui/tests/endo/eus-run.ts', import.meta.url), 'utf8'), ir = readFileSync(new URL('../src/ui/tests/ir/run.ts', import.meta.url), 'utf8');
  for (const src of [eus, ir]) { assert.match(src, /createTakeover/); assert.doesNotMatch(src, /\bHOLD_MS\s*=|setTimeout/); }
  const pane = readFileSync(new URL('../src/ui/tests/endo/EndoPane.tsx', import.meta.url), 'utf8');
  assert.match(pane, /<EusPanel/); assert.match(pane, /data-eus=\{eus\}/);
  assert.match(readFileSync(new URL('../src/ui/tests/ir/IrPane.tsx', import.meta.url), 'utf8'), /<HandOver/);
});

test('the copy of monitor-takeover.js is the 2D file (when the 2D checkout is there)', () => {
  const from = process.env.PPS_2D_REPO ?? '/home/claude/portal-pressure-simulator';
  if (!existsSync(`${from}/src/ui/monitor-takeover.js`)) return;
  execFileSync('node', ['scripts/copy-b11-takeover.mjs', '--from', from, '--check'], { stdio: 'pipe' });
});

test('the EUS monitor waits for the needle, then follows its clock: PV, the hepatic vein, the EUS-PPG', () => {
  const S = scriptOf('eus') as { clock: { total: number; now(tk: Record<string, number>): number }; marks: number[]; keys: string[] };
  assert.deepEqual(S.keys, ['PV', 'HV', 'EUS-PPG']);
  Object.assign((READS as unknown as { eus: Record<string, number> }).eus, { pv: 14.2, hv: 4.1, ppg: 10.1 });
  resetMonitor();
  assert.equal(eusMonitor().ph, 'idle');
  const key = M.key;
  assert.ok(words(eusSource.frame(460, 177, false)).length > 0);
  M.run = true;
  let f = eusSource.frame(460, 177, true);
  for (let t = 0; t <= 25000; t += 100) { eusAt(t); f = eusSource.frame(460, 177, true); if (!Number.isFinite(S.clock.now(M.tk)) || S.clock.now(M.tk) >= S.clock.total) break; }
  const w = words(f);
  assert.equal(eusMonitor().ph, 'run');
  assert.ok(S.clock.now(M.tk) >= S.marks[2]!, `the script reached the gradient (${S.clock.now(M.tk)} of ${S.clock.total})`);
  assert.ok(w.some((s) => /EUS-PPG/.test(s)), w.join('|'));
  assert.equal(M.key, key);
  assert.match(eusWords(), /PV .*HV .*EUS-PPG/);
});

test('the panel keeps the 2D ratio and the words follow the phase', () => {
  assert.equal(EUS_AR, 2.6);
  assert.equal(monitorHeight(300), Math.round(276 / 2.6));
  assert.ok(monitorHeight(10) >= 96);
  const rd = { pv: 14.2, hv: 4.1, ppg: 10.1 };
  assert.match(captionOf('hold', -1, rd), /EUS-PPG = LPV − LHV = 14\.2 − 4\.1 = 10\.1 mmHg\./);
  assert.match(captionOf('idle', -1, rd), /EUS-guided portal pressure gradient/);
  assert.ok(captionOf('run', 1, rd).length > 0);
});
