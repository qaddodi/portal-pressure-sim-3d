// Plan 45: a cancelled height glide can never leave a card stuck at its old height with its words pushed down. Node only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const cf = readFileSync('src/ui/cards/CardFrame.tsx', 'utf8');

test('settle() cancels the glides, clears animH and takes the words\' inner offset off, in one call', () => {
  const at = cf.indexOf('const settle = () => {');
  assert.ok(at > 0);
  const body = cf.slice(at, cf.indexOf('const sink =', at));
  assert.match(body, /anims\.current\.forEach\(\(x\) => x\.cancel\(\)\)/);
  assert.match(body, /anims\.current = \[\]/);
  assert.match(body, /setAnimH\(null\)/);
  assert.match(body, /innerRef\.current\?\.style\.removeProperty\('transform'\)/);
});

test('every other cancel of an animation in CardFrame goes through settle()', () => {
  const lines = cf.split('\n').filter((l) => /\.cancel\(\)/.test(l) && !/clock\.cancel/.test(l));
  assert.equal(lines.length, 1, `only settle() cancels: ${lines.join(' / ')}`);
  assert.match(cf, /if \(out\) \{ settle\(\); return; \}/, 'the card on its way out');
  assert.match(cf, /anims\.current\[0\]\.onfinish = \(\) => settle\(\);/, 'a reveal that ends');
  assert.match(cf, /if \(anims\.current\.length\) settle\(\)/);
  const reveal = cf.slice(cf.indexOf('const reveal ='), cf.indexOf('// measure the words'));
  assert.match(reveal, /^\s*const reveal[\s\S]*?settle\(\);/, 'reveal starts by settling');
  const sink = cf.slice(cf.indexOf('const sink ='), cf.indexOf('const reveal ='));
  assert.match(sink, /settle\(\);\s*setAnimH\(prev\)/, 'sink settles, then takes the old height for its glide');
});
