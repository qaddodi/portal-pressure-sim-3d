// Quiet depth on a turn: face on the picture is 2D's; turned, the organs' wash eases toward the page by up to a quarter (visual review, better than 2D 3).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { quietOf, QUIET_WASH, QUIET_STEPS } from '../src/scene/camera/quiet.ts';
import { organColour, PLAIN, type OrganInks } from '../src/scene/organs/organ-look.ts';

const rad = (d: number) => (d * Math.PI) / 180;
const K: OrganInks = { plate: [1, 1, 1], dark: false, bleed: [0.5, 0, 0], bg: [1, 1, 1] };

test('nothing up to 8 degrees, full at 25, smooth between, the same either way', () => {
  assert.equal(quietOf(0), 0); assert.equal(quietOf(rad(8)), 0); assert.equal(quietOf(rad(-5)), 0);
  assert.equal(quietOf(rad(25)), 1); assert.equal(quietOf(rad(-25)), 1);
  const mid = quietOf(rad(16.5));
  assert.ok(mid > 0.4 && mid < 0.6, String(mid));
  let was = 0;
  for (let d = 0; d <= 25; d += 0.5) { const q = quietOf(rad(d)); assert.ok(q >= was); was = q; }
  assert.ok(Number.isInteger(quietOf(rad(13)) * QUIET_STEPS), 'in steps, so a drag does not repaint every frame');
});

test('the wash goes toward the plate by a quarter at most; the face-on colour is unchanged', () => {
  const base: [number, number, number] = [0.2, 0.2, 0.2];
  assert.deepEqual(organColour(base, { ...PLAIN, quiet: 0 }, K), base);
  const full = organColour(base, { ...PLAIN, quiet: 1 }, K);
  assert.ok(Math.abs(full[0] - (0.2 + 0.8 * QUIET_WASH)) < 1e-9, String(full[0]));
  const half = organColour(base, { ...PLAIN, quiet: 0.5 }, K);
  assert.ok(half[0] > base[0] && half[0] < full[0]);
});

test('the scene feeds the organ layer from the orbit', () => {
  const sc = readFileSync(new URL('../src/scene/scene.ts', import.meta.url), 'utf8');
  assert.match(sc, /organs\.setQuiet\(quietOf\(this\.rig\.orbitAngle\)\)/);
});
