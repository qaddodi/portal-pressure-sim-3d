// Under the loading cover nothing is seen easing, so the labels finish at once there: the cover lifted about 1.1 s late on a warm Mac start while the labels faded in behind it (26 Nov).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { COVERED_DT } from '../src/scene/labels/controller.ts';
import { FADE } from '../src/scene/labels/alpha.ts';

test('while the cover is up the labels take no settle hold and step their fades to the end', () => {
  const c = readFileSync('src/scene/labels/controller.ts', 'utf8');
  assert.match(c, /const covered = splashHeld\(\);/);
  assert.match(c, /const hold = !covered && /, 'no settle hold under the cover');
  assert.match(c, /const fadeDt = covered \? COVERED_DT : dt;/);
  assert.match(c, /this\.fader\.step\(fadeDt,/);
  assert.ok(COVERED_DT > 10 * Math.max(FADE.settleMs, FADE.inMs ?? 0, 1000), 'one covered step outlasts any fade');
});
