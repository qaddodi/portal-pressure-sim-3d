// Capture 84496815 (iPad 834x1108): the table on Shunts 15 and Ten years 21 was cut off at the card's foot (clipped 49 and 64 px, six rows each, the heads upright). ROOT CAUSE, in the order of the commit:
// TableCard's layout effect judged the heads (over) and told the page only through `setUp`, which renders after every layout effect of the commit; CardFrame's own layout effect, the next one up, measured the card's
// height in between, with the heads still lying, so the card's box was 49 to 64 px short; the heads then turned and the box, locked once the card had landed, clipped the rows. The judgement is now written on the page
// by the pass itself (table-heads.ts), before the card measures.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { turnHeads, type ClassHost } from '../src/ui/cards/table-heads.ts';

const host = (...c: string[]): ClassHost & { set: Set<string> } => { const set = new Set(c); return { set, classList: { add: (x) => void set.add(x), remove: (x) => void set.delete(x), contains: (x) => set.has(x) } }; };

test('turning the heads up writes th-up on the row and dk-up on the table at once, and says it changed', () => {
  const row = host(), box = host('pz-table');
  assert.equal(turnHeads(row, box, true), true);
  assert.ok(row.set.has('th-up') && box.set.has('dk-up'));
  assert.equal(turnHeads(row, box, true), false, 'a second judgement that agrees changes nothing');
});

test('turning them back lays them down on the page at once', () => {
  const row = host('th-up'), box = host('pz-table', 'dk-up');
  assert.equal(turnHeads(row, box, false), true);
  assert.ok(!row.set.has('th-up') && !box.set.has('dk-up') && box.set.has('pz-table'), 'only the two classes go');
  assert.equal(turnHeads(row, box, false), false);
});

test('the table\'s fit pass writes its judgement through turnHeads, not only through state, and the card measures after it', () => {
  const t = readFileSync('src/ui/cards/TableCard.tsx', 'utf8');
  const fit = /const fit = \(\) => \{([\s\S]*?)\n    \};/.exec(t)![1];
  assert.match(fit, /setHeads\(tr, box, next\)/);
  assert.doesNotMatch(fit, /if \(was\) \{ tr\.classList\.add/, 'the old form restored only the heads that were already up; a new turn waited for the render');
  // every table slide goes through this one card (the table is a `visual` panel; the card frame measures in a layout effect of its own, after its child's)
  assert.match(readFileSync('src/ui/cards/CardFrame.tsx', 'utf8'), /useLayoutEffect\(\(\) => \{\n    const el = innerRef\.current;/);
});
