// Every look's text reaches 4.5:1 on its card and its ground, and its signal colours 3:1 as marks (WCAG 1.4.3 and 1.4.11). A look that changes a token fails here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contrast, contrastTable, over } from '../src/ui/debug/contrast.ts';
import { LOOK_IDS } from '../src/looks/looks.ts';

test('the ratio is the WCAG one', () => {
  assert.equal(contrast('#000000', '#FFFFFF'), 21);
  assert.equal(contrast('#777777', '#FFFFFF'), 4.48);
  assert.deepEqual(over('rgba(0,0,0,.5)', '#FFFFFF').map(Math.round), [128, 128, 128]);
});

test('all five looks: text 4.5:1, signals 3:1', () => {
  const t = contrastTable();
  assert.equal(new Set(t.map((r) => r.look)).size, LOOK_IDS.length);
  const bad = t.filter((r) => !r.ok).map((r) => `${r.look}: ${r.fg} on ${r.on} is ${r.ratio}, needs ${r.need}`);
  assert.deepEqual(bad, []);
});
