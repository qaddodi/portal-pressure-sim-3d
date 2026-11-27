// ?promotion's case and menu pictures (src/ui/debug/audit/capture-promo-extra.ts): which stop a key asks for, and the wiring that must stay (the same settle, the same picture, the case's own start
// and jump, the menu opened as the app opens it, the address read by the frame and the run). The page part needs a browser; here it is pinned by what it must reuse.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { HISTORIES } from '../src/ui/histories/index.generated.ts';
import { PROMO_EXTRAS, targetOf, stopIndex } from '../src/ui/debug/promo/slides.ts';

const src = (p: string): string => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('a key with no stop is the last stop; a stop is counted from 1; one past the end or 0 is nothing', () => {
  assert.equal(stopIndex(null, 4), 3);
  assert.equal(stopIndex(1, 4), 0);
  assert.equal(stopIndex(4, 4), 3);
  assert.equal(stopIndex(5, 4), null);
  assert.equal(stopIndex(0, 4), null);
  assert.equal(stopIndex(null, 0), null);
});

test('every proposed case picture lands on a stop that exists, in every model patient the page names', () => {
  for (const x of PROMO_EXTRAS) {
    const t = targetOf(x.key);
    if (t?.kind !== 'history') continue;
    const n = HISTORIES.find((h) => h.id === t.id)!.play!.stops!.length;
    assert.notEqual(stopIndex(t.stop, n), null, x.key);
  }
});

test('the pass reuses the capture\'s own parts and opens things the way the app does', () => {
  const x = src('src/ui/debug/audit/capture-promo-extra.ts');
  assert.match(x, /from '\.\/capture-settle\.ts'/); assert.match(x, /from '\.\/capture-shot\.ts'/); assert.match(x, /from '\.\/capture-cases\.ts'/);
  assert.match(x, /run\.startCase\(id\)/); assert.match(x, /run\.goStop\(i\)/);
  assert.match(x, /setState\(\{ menuTab: t\.tab/); assert.match(x, /open\('menu'\)/);
  assert.match(x, /png: true/); assert.match(x, /openHistory\(t\.id\)/); assert.match(x, /'timeline' : 'history'/);
  const base = src('src/ui/debug/audit/capture-run.ts');
  assert.match(base, /ui\.promo && ui\.extras\?\.length/);
  assert.match(base, /ui\.pick && ui\.pick\.size/, 'with no slide picked a run of extras takes no slide');
  assert.match(src('src/ui/debug/audit/capture-child.ts'), /flagValue\('extras'\)/);
});
