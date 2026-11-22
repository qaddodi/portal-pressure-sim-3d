// Mohammad, 22 Nov: "the shadows and outlines are jagged". Root causes (Opus read, code only): (1) the light/shade step was 0.4 device px wide, under a pixel, so it could not be anti-aliased and stepped as bare whole pixels;
// (2) the vessel's outline outer edge was the raw raster edge of the hull's 14-sided ring (corners up to TUBE_SAG of the radius outside the true edge); (3) a thick tube's axis between rings is a chord, a visible corner on a tight bend.
// This holds the fixes: every cel step is exactly CEL_STYLE.EDGE_PX (one) device px across wherever it is cut, the outline's outer edge is cut to the true circle, and tight bends of thick tubes get rings.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CEL_STYLE } from '../src/scene/cel-style.ts';
import { CEL_TUBE_GLSL } from '../src/scene/cel-glsl.ts';
import { CEL_QUANT_GLSL } from '../src/scene/materials/cel-quant.ts';
import { TOON_FS } from '../src/scene/materials/shaders.ts';
import { celTones } from '../src/scene/vessels/cel-ink.ts';
import { VESSEL_FS, VESSEL_VS, TUBE_SAG } from '../src/scene/vessels/shaders.ts';
import { TUBE_RADIAL, MAX_RING_GROWTH, MAX_RING_TURN_DEG, MIN_BEND_RADIUS, ringsForBends, worstRingTurn } from '../src/scene/vessels/tubes.ts';

const read = (p: string): string => readFileSync(new URL(p, import.meta.url), 'utf8');

test('a cel edge is exactly one device pixel across (EDGE_PX), the narrowest that can anti-alias', () => {
  assert.equal(CEL_STYLE.EDGE_PX, 1, 'one pixel: under it (it was 0.4) the step cannot be anti-aliased');
  // the tubes' two tones: the whole ramp of the shade, measured in the lit-side measure s, is sw (its change per device pixel) x EDGE_PX
  const sw = 0.02, N = 20000;
  let first = Infinity, last = -Infinity;
  for (let i = 0; i <= N; i++) {
    const s = CEL_STYLE.VESSEL_STEP_AT - 0.1 + (0.2 * i) / N, m = celTones(s, sw, 10).mul;
    if (m > 1 - CEL_STYLE.SHADE + 1e-9 && m < 1 - 1e-9) { first = Math.min(first, s); last = Math.max(last, s); }
  }
  assert.ok(Math.abs((last - first) / sw - CEL_STYLE.EDGE_PX) < 0.01, `the ramp is ${((last - first) / sw).toFixed(3)} px`);
});

test('every program that cuts a cel step reads its width from EDGE_PX, as half the ramp each side, never a typed 0.75 or 1.5', () => {
  assert.match(CEL_TUBE_GLSL, /float et = max\(0\.5 \* 1\.0 \* sw, 1e-4\)/, 'the tubes\' tone step');
  assert.match(CEL_QUANT_GLSL, /const float CEL_EDGE_HALF = 0\.500;/);
  assert.match(CEL_QUANT_GLSL, /float w = max\(fwidth\(q\) \* CEL_EDGE_HALF, 1e-3\);/, 'the shared band step');
  assert.match(TOON_FS, /float w = fwidth\(q\) \* 0\.500;/, 'the toon material\'s band step');
  assert.doesNotMatch(TOON_FS, /fwidth\(q\) \* 0\.75/);
  for (const f of ['../src/scene/lobule/field.ts', '../src/scene/lobule/plate.ts']) {
    const t = read(f);
    assert.match(t, /CEL_EDGE_HALF/, f);
    assert.doesNotMatch(t, /CEL_EDGE_PX \* 1\.5/, `${f}: the old 1.5 x 0.4 = 0.6 half width`);
  }
});

test('the outline\'s outer edge is cut to the true circle of the lumen and the line the hull was built from', () => {
  // the hull's flats stand exactly on that circle (the corners TUBE_SAG outside it): cutting there removes the corners and nothing inside the flats
  assert.ok(Math.abs(TUBE_SAG - (1 / Math.cos(Math.PI / TUBE_RADIAL) - 1)) < 1e-12);
  assert.ok(Math.abs((1 + TUBE_SAG) * Math.cos(Math.PI / TUBE_RADIAL) - 1) < 1e-12, 'the inscribed circle of the flats is the true radius');
  assert.match(VESSEL_VS, /float inkW = \(inkPx \* endK \+ hiPx \* vHi\) \* inkOn \* wpcV \/ vU;/, 'the hull\'s line');
  assert.match(VESSEL_FS, /\* mix\(1\.0, [\d.]+, circT\) \* endKo \+ hiPx \* vHi\) \* inkOn;/, 'the cut is built from the same rule as the hull (a Circuit line, the buried ends, a pick\'s ring)');
  const at = VESSEL_FS.indexOf('if (dLat > rDevAx + inkO * dpr) discard;');
  assert.ok(at > 0, 'the cut is there');
  const shadow = VESSEL_FS.indexOf('#ifdef SHADOW'), glow = VESSEL_FS.indexOf('#ifdef GLOW');
  assert.ok(at > VESSEL_FS.indexOf('#endif', shadow) && at > VESSEL_FS.indexOf('#endif', glow), 'after the glow\'s mask and the crossing shadow\'s hull, which return before it and have their own widths');
  assert.ok(VESSEL_FS.indexOf('float rDevAx') < at, 'after rDevAx is known');
});

test('ringsForBends (built, NOT wired into tubularOf: see tubes.ts): tight bends of thick tubes get rings, and only they', () => {
  // an L with a tight turn in the middle: in few rings the bend is a visible corner; in enough, it is not
  const L = [[0, 0, 0], [0.1, 0, 0], [0.2, 0, 0], [0.28, 0.0, 0], [0.3, 0.02, 0], [0.3, 0.1, 0], [0.3, 0.2, 0], [0.3, 0.3, 0]] as Array<[number, number, number]>;
  assert.ok(worstRingTurn(L, 20) > MAX_RING_TURN_DEG, 'twenty rings on a tight bend corner it');
  const thick = ringsForBends(L, 0.02, 20);
  assert.ok(thick > 20 && thick <= Math.ceil(20 * MAX_RING_GROWTH), `${thick} rings`);
  assert.ok(worstRingTurn(L, thick) < worstRingTurn(L, 20), 'and the corner is rounder');
  assert.equal(ringsForBends(L, MIN_BEND_RADIUS / 2, 20), 20, 'a hairline\'s corner is under a pixel: no rings added');
  const line = Array.from({ length: 6 }, (_, i) => [i * 0.1, 0, 0] as [number, number, number]);
  assert.equal(ringsForBends(line, 0.03, 20), 20, 'a straight course is untouched');
});
