// The corner credit keeps clear of bars and cards as 2D's credit.js does (copied: scripts/copy-credit-spots.mjs): a bar over its corner lifts it above the bar, and it never sits on one.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import { pinned2D } from './two-d-pin.ts';
// @ts-expect-error (a copied plain module)
import { CORNERS, freeSpots, hit } from '../src/ui/shell/credit-spots.copied.js';
import { readFileSync } from 'node:fs';

const TWO_D = pinned2D('src/ui/credit.js');
test('the copy is current against the 2D checkout at the pin (skipped without one)', { skip: TWO_D.skip }, () => {
  assert.doesNotThrow(() => execFileSync('node', ['scripts/copy-credit-spots.mjs', '--from', TWO_D.repo, '--check'], { stdio: 'pipe' }));
});

const fig = { l: 0, t: 0, r: 1440, b: 900 };
const w = 220, h = 17;
test('a translucent bottom bar over the corner lifts the credit above it, never behind it', () => {
  const dock = { l: 0, t: 800, r: 1440, b: 900 };   // (spans the width: the thumb dock)
  const s = freeSpots(fig, [dock], w, h, { gap: 10, inset: 12 });
  assert.ok(s.bl, 'a bottom-left spot is found');
  assert.ok(s.bl.y + h + 10 <= dock.t, 'above the bar by the gap');
  for (const c of CORNERS) if (s[c]) assert.ok(!hit({ l: s[c].x, t: s[c].y, r: s[c].x + w, b: s[c].y + h }, dock), c);
});
test('a bar that does not reach the corner leaves the credit in it', () => {
  const dock = { l: 300, t: 820, r: 1100, b: 890 };
  const s = freeSpots(fig, [dock], w, h, { gap: 10, inset: 12 });
  assert.deepEqual(s.bl, { x: 12, y: 900 - 12 - h });
});
test('Credit.tsx places by the copied rule and hides (covered) when no corner is free', () => {
  const src = readFileSync(new URL('../src/ui/shell/Credit.tsx', import.meta.url), 'utf8');
  assert.match(src, /freeSpots\(/);
  assert.match(src, /classList\.toggle\('covered'/);
});
