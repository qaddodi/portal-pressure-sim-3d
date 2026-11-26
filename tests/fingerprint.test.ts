// The baked files' fingerprints (src/scene/fingerprint.ts): another engine's last bits never cost a page its baked file, and a different figure is never laid in.
// Root cause pinned here (Mac Safari, 26 Nov): the skins' and the weld plan's digests rounded computed numbers and hashed them in order, so Safari's sin and cos threw both files away
// and every Mac and iPhone meshed the joins live (10 s on the Mac) and planned the Lobule's welds in a worker.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Printer, printString, samePrint, TOL } from '../src/scene/fingerprint.ts';

const print = (groups: unknown[][]): string => { const p = new Printer(); for (const g of groups) { for (const v of g) p.walk(v); p.group(); } return printString(p.finish()); };

test('order within a group does not matter; strings, counts and groups do', () => {
  assert.ok(samePrint(print([[{ a: 1, b: 'x' }, { a: 2, b: 'y' }]]), print([[{ b: 'y', a: 2 }, { b: 'x', a: 1 }]])), 'two arms sorted the other way by a near tie');
  assert.ok(!samePrint(print([[{ id: 'A', x: 1 }]]), print([[{ id: 'B', x: 1 }]])), 'another name');
  assert.ok(!samePrint(print([[1, 2, 3]]), print([[1, 2, 3, 0]])), 'another count');
  assert.ok(!samePrint(print([[1], [2]]), print([[1, 2]])), 'another grouping');
});

test('numbers are judged against their group\'s size: last bits and a smoothing step a thousandth apart are the same figure, a visible move is not', () => {
  const pts = Array.from({ length: 300 }, (_, i) => Math.sin(i) * 3 + i * 0.01);
  const size = pts.reduce((a, x) => a + Math.abs(x), 0);
  const moved = (d: number) => pts.map((x, i) => (i === 40 ? x + d : x));
  assert.ok(samePrint(print([pts]), print([pts.map((x) => x * (1 + 1e-15))])), 'one ulp on every number');
  assert.ok(samePrint(print([pts]), print([moved(1e-3)])), 'one point a thousandth of a unit apart');
  assert.ok(!samePrint(print([pts]), print([moved(4 * TOL * size)])), 'one point moved by more than the tolerance of its group');
  assert.ok(!samePrint(print([pts]), print([pts.map((x) => x + 0.05)])), 'the whole course moved by 0.05 of a unit');
});

const root = fileURLToPath(new URL('..', import.meta.url));
const welds = `${root}public/lobule/welds.bin`;
test('with another engine\'s sin and cos (one ulp on every result) the baked weld plan is still the plan for this network', { skip: !existsSync(welds) && 'no baked weld plan (npm test bakes it)' }, () => {
  const out = execFileSync(process.execPath, ['--import', fileURLToPath(new URL('./other-engine-math.mjs', import.meta.url)), `${root}scripts/bake-welds.mjs`, '--check'], { cwd: root, encoding: 'utf8' });
  assert.match(out, /baked welds: current/);
});
