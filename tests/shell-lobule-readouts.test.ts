// The dock's strip in the Lobule and Sinusoid views (2D dock.js LOBULE_TILES / LOBULE_PRIMARY): the two key flows as a percentage of healthy, with 2D's scales, ticks, words and cut-offs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LOBULE_TILES } from '../src/ui/shell/lobule-strip.ts';
import { pinned2D } from './two-d-pin.ts';

const by = (id: string) => LOBULE_TILES.find((t) => t.id === id)!;

test('Sinusoids: 2D\'s cut-offs 75 and 55 and its words', () => {
  const t = by('lz-sin');
  assert.deepEqual([t.sev(100), t.sev(75), t.sev(60), t.sev(55), t.sev(10)], ['ok', 'caution', 'caution', 'danger', 'danger']);
  assert.deepEqual([t.word(100), t.word(60), t.word(20)], ['Normal', 'Low', 'Severe']);
  assert.deepEqual([t.scale.lo, t.scale.hi, ...t.ticks], [0, 150, 55, 75]);
});

test('Portal in: reversed below -2, severe under 50, low under 75; scale -60 to 150', () => {
  const t = by('lz-pv');
  assert.deepEqual([t.sev(-10), t.sev(0), t.sev(60), t.sev(90)], ['critical', 'danger', 'caution', 'ok']);
  assert.deepEqual([t.word(-10), t.word(30), t.word(60), t.word(90)], ['Reversed', 'Severe', 'Low', 'Normal']);
  assert.deepEqual([t.scale.lo, t.scale.hi, ...t.ticks], [-60, 150, 0, 50]);
});

test('the numbers are 2D\'s: read from dock.js at the pin', (t) => {
  const p = pinned2D('src/ui/dock.js');
  if (p.skip) return t.skip(p.skip);
  const src = readFileSync(`${p.repo}/src/ui/dock.js`, 'utf8');
  assert.match(src, /ks: 'Sinusoids'/); assert.match(src, /ks: 'Portal in'/);
  assert.match(src, /scale: \[0, 150\], ticks: \[55, 75\]/); assert.match(src, /scale: \[-60, 150\], ticks: \[0, 50\]/);
  assert.match(src, /v > 75 \? 'ok' : v > 55 \? 'caution' : 'danger'/);
  assert.match(src, /v < -2 \? 'critical' : v < 50 \? 'danger' : v < 75 \? 'caution' : 'ok'/);
  assert.match(src, /LOBULE_PRIMARY = new Set\(\['lz-sin', 'lz-pv'\]\)/);
});
