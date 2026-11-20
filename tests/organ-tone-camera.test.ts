// Mohammad 20 Nov: "when I move the camera the organs become really dark in color" (and earlier, "when I tilt, the organs lose shading or become darker").
// Root cause of this one: the organ's wash eased toward the page by QUIET_WASH (a quarter) as soon as the figure turned past 8 degrees, so on a dark page every organ lost a quarter of its colour. An organ's colour
// is the look's, never the camera's: the same state at any turn gives the same colour.
import test from 'node:test';
import assert from 'node:assert/strict';
import { QUIET_WASH, quietOf } from '../src/scene/camera/quiet.ts';
import { organColour, PLAIN, rgbOf } from '../src/scene/organs/organ-look.ts';

test('no organ colour depends on how far the figure is turned', () => {
  assert.equal(QUIET_WASH, 0);
  const base = rgbOf('#B07868'), k = { plate: rgbOf('#101114'), dark: true, bleed: rgbOf('#8E1A20'), bg: rgbOf('#101114') };
  const rest = organColour(base, { ...PLAIN, quiet: quietOf(0) }, k);
  for (const deg of [4, 8, 12, 18, 25]) {
    const turned = organColour(base, { ...PLAIN, quiet: quietOf((deg * Math.PI) / 180) }, k);
    assert.deepEqual(turned, rest, `the colour at a ${deg} degree turn is the colour face on`);
  }
});

test('the camera only changes the organ look through the lens and the dive, never the wash', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../src/scene/organs/organ-look.ts', import.meta.url), 'utf8');
  assert.match(src, /const a = s\.dim \* s\.ghost \* \(1 - QUIET_WASH \* s\.quiet\);/);
});
