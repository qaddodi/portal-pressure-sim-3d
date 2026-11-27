// The colour keys run low to high LEFT TO RIGHT in the capture too. Root cause (27 Nov): the figure key's bar is `linear-gradient(in oklab to right, ...)` (scene/labels/key.ts) and the capture's
// parseGradient did not read the `in oklab` word, so it fell through to its 180deg default and drew every key bar top to bottom. This pins the line's angle for every key producer, in every lens and look.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseGradient, gradientLine } from '../src/ui/shell/figure-image.ts';
import { gradientOf } from '../src/scene/labels/key.ts';
import { swatchOfLegend } from '../src/ui/shell/lens-art.ts';
import { legendFor } from '../src/scene/lenses/legend.ts';
import { LOOK_IDS } from '../src/looks/looks.ts';
import { LENS_IDS } from '../src/scene/lenses/model.ts';

test('the line of a gradient is read in every spelling a browser may give', () => {
  assert.equal(gradientLine('in oklab to right'), 90);
  assert.equal(gradientLine('to right in oklab'), 90);
  assert.equal(gradientLine('in oklch longer hue to right'), 90);
  assert.equal(gradientLine('in oklab 90deg'), 90);
  assert.equal(gradientLine('to right'), 90);
  assert.equal(gradientLine('to left'), 270);
  assert.equal(gradientLine('0.25turn'), 90);
  assert.ok(Math.abs(gradientLine('1.5708rad')! - 90) < 0.01);
  assert.equal(gradientLine('100grad'), 90);
  assert.equal(gradientLine('in oklab'), 180);
  assert.equal(gradientLine('rgb(1, 2, 3)'), null);
  assert.equal(gradientLine('red'), null);
});

test('a key bar parsed as the capture reads it runs to the right, with its stops and no stop eaten', () => {
  const p = parseGradient('linear-gradient(in oklab to right, rgb(152, 185, 209) 0%, rgb(79, 2, 59) 100%)');
  assert.deepEqual(p, { angle: 90, stops: [[0, 'rgb(152, 185, 209)'], [1, 'rgb(79, 2, 59)']] });
});

test('every lens key and menu swatch in every look runs to the right (angle 90), low end first', () => {
  let seen = 0;
  for (const look of LOOK_IDS) for (const lens of [...LENS_IDS, 'delta', 'since'] as string[]) {
    let g: string | null = null;
    try { g = gradientOf(lens, look); } catch { /* a lens with no ramp has no bar key */ }
    if (g) {
      const p = parseGradient(g);
      assert.ok(p && typeof p !== 'string', `${lens}/${look} parses`);
      assert.equal(p.angle, 90, `${lens}/${look} key bar angle`);
      assert.equal(p.stops[0]![0], 0);
      assert.equal(p.stops.at(-1)![0], 1);
      seen++;
    }
    const sw = swatchOfLegend(legendFor(lens as Parameters<typeof legendFor>[0], look));
    if (sw !== 'none') assert.equal((parseGradient(sw) as { angle: number }).angle, 90, `${lens}/${look} swatch angle`);
  }
  assert.ok(seen >= 5 * 3, 'the pressure key at least was checked in every look');
});
