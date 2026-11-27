// C15 (owner, 27 Nov 2026): the abdomen card prints no balance while the pool is under 0.5 L (the model's instant rate right after a tap, 2,700 mL/day an hour on, is a transient no patient has);
// above it, the plain "N mL/day". Node only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { rateText, abView, REFILL_HIDE_L } from '../src/ui/tests/abdomen/model.ts';

const m = (ml: number, rate: number) => ({ ascites: { volume: ml, ratePerDay: rate, grade: ml > 500 ? 1 : 0, iap: 8, albumin: 1.8, totalProtein: 3 } });

test('no rate under 0.5 L, however steep the instant balance', () => {
  assert.equal(REFILL_HIDE_L, 0.5);
  for (const ml of [0, 50, 200, 499]) {
    const v = abView(m(ml, 2700) as never, { albumin: 3.5 } as never, 2700)!;
    assert.equal(v.rate, '', `${ml} mL`);
    assert.equal(v.rateDir, 'steady', 'and no arrow');
  }
});

test('from 0.5 L the balance is a plain number, with its arrow', () => {
  const v = abView(m(1500, 350) as never, { albumin: 3.5 } as never, 400)!;
  assert.equal(v.rate, '400 mL/day');
  assert.equal(v.rateDir, 'up');
  assert.equal(rateText(-300, 0.5), '300 mL/day');
  assert.equal(rateText(0, 3), 'Steady');
});

test('the word "Refilling" is nowhere in the pane or its model', () => {
  for (const f of ['model.ts', 'AbdomenPane.tsx']) assert.doesNotMatch(readFileSync(new URL(`../src/ui/tests/abdomen/${f}`, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ''), /Refilling/);
});
