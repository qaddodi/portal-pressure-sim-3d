// The black dive (Mohammad, 24 Nov: slide 7 to 8 in the Black look, the screen goes dark on the zoom out of the lobule): the lobule's detail was gone (field breadth) while the body was only half back,
// so what was drawn covered less than the whole and the near-black field showed. The lobule now stays as much as the body has yet to cover, on every dive, both ways.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bodyFade, DIVE_IN, DIVE_OUT } from '../src/scene/scene.ts';
import { fieldWide } from '../src/scene/lobule/field.ts';
import { lobuleStays } from '../src/scene/micro3d/lobule3d.ts';

test('along the whole dive the lobule and the body together cover the picture (never less than 1)', () => {
  for (const rest of [DIVE_IN * 3, DIVE_IN * 6, 0.2]) {
    const inner = Math.max(DIVE_IN, 2 * rest);
    for (let k = 0; k <= 200; k++) {
      const d = rest * Math.pow((DIVE_OUT * 1.3) / rest, k / 200);
      const body = bodyFade(d, inner), lobule = lobuleStays(fieldWide(d, rest), body);
      assert.ok(lobule + body >= 1 - 1e-9, `d ${d.toFixed(4)} rest ${rest.toFixed(3)}: lobule ${lobule.toFixed(3)} + body ${body.toFixed(3)}`);
    }
  }
});

test('the old rule dipped, so this test would have failed on it', () => {
  const rest = DIVE_IN * 3, inner = Math.max(DIVE_IN, 2 * rest);
  let worst = 1;
  for (let k = 0; k <= 200; k++) { const d = rest * Math.pow((DIVE_OUT * 1.3) / rest, k / 200); worst = Math.min(worst, (1 - fieldWide(d, rest)) + bodyFade(d, inner)); }
  assert.ok(worst < 0.7, `the old coverage fell to ${worst.toFixed(2)}`);
});

test('at the lobule and in the body nothing changes, and the scene hands the body share to the lobule', () => {
  assert.equal(lobuleStays(0, 0.2), 1);
  assert.equal(lobuleStays(1, 1), 0);
  assert.equal(lobuleStays(0.4, 0), 1);
  const sc = readFileSync(new URL('../src/scene/scene.ts', import.meta.url), 'utf8');
  assert.match(sc, /this\.lobule3d\.update\(this\.micro3d, under, now, this\.flowRate\.value, false, this\.fadeNow\)/);
});
