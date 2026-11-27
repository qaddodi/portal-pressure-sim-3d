// The liver carries its lobules (Mohammad, 27 Nov 2026: the zoom from Anatomy to Lobule should feel like one continuous zoom). The mosaic on the liver's surface is the
// field's own lattice (one source, lobule/tiling.ts),
// it arrives by the lobule's size on the screen and by the body's dissolve (whole before the body is half gone, nothing at any body shot), and the liver's colour ends at the field's tone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LIVER_LOBULES, LIVER_LOBULES_PAINT, LIVER_LOBULES_VS, LIVER_LOBULES_DECL, mosaicShare, setLobuleTones, LOBULE_SPAN } from '../src/scene/organs/liver-lobules.ts';
import { FIELD_TILE_H, FIELD_TILE_W, hexEdgeDistance, lobuleCentre } from '../src/scene/lobule/tiling.ts';
import { LOBULE_FIELD_FS, HOME_CORNERS } from '../src/scene/lobule/field.ts';
import { ORGAN_FS, ORGAN_VS } from '../src/scene/organs/organ-shader.ts';
import { LOBULE_PALETTES } from '../src/scene/lobule/tones.ts';
import { LOOKS, type LookId } from '../src/looks/looks.ts';
import { rgbOf } from '../src/scene/organs/organ-look.ts';
import { DIVE_IN, DIVE_OUT, bodyFade } from '../src/scene/parts/shared.ts';
import { LOBULE_SCALE } from '../src/scene/lobule/frames.ts';

const FOV = 35, pxPer = (h: number, fov = FOV): number => h / (2 * Math.tan((fov * Math.PI) / 360));
const S3 = Math.sqrt(3);
/** The 2D tile's centres, as lobule/from2d/field-tile.generated.js lays them (1.5 i, sqrt3 (j + half when i is odd)), repeated over the plane. */
function tileCentres(): [number, number][] {
  const out: [number, number][] = [];
  for (let i = -8; i <= 8; i++) for (let j = -8; j <= 8; j++) out.push([1.5 * i, S3 * (j + (i & 1 ? 0.5 : 0))]);
  return out;
}

test('the mosaic is nothing at every body shot and whole by the time the body is half gone, on any screen and any diveIn', () => {
  for (const h of [600, 667, 800, 1000, 1400]) for (const inner of [DIVE_IN, 0.47, 1, 1.57]) {
    // (every body shot is at or beyond DIVE_OUT from the place: the body is whole, the share 0)
    for (const d of [DIVE_OUT, 2.5, 4, 8, 20]) assert.equal(mosaicShare(d, pxPer(h), bodyFade(d, inner)), 0, `body shot d=${d} h=${h}`);
    let was = 0;
    for (let d = DIVE_OUT * 1.2; d > inner * 0.1; d *= 0.97) {
      const s = mosaicShare(d, pxPer(h), bodyFade(d, inner));
      assert.ok(s >= was - 1e-12 && s >= 0 && s <= 1, `rises monotonically as d falls (h=${h}, inner=${inner}, d=${d.toFixed(3)}: ${s} after ${was})`);
      if (bodyFade(d, inner) <= 0.5) assert.equal(s, 1, `whole once the body is half gone (h=${h}, inner=${inner}, d=${d.toFixed(3)})`);
      was = s;
    }
  }
});

test('in and out are one function of the distance, and the size part follows the lobule on the screen', () => {
  const a = mosaicShare(0.6, pxPer(800), bodyFade(0.6, 0.47)), b = mosaicShare(0.6, pxPer(800), bodyFade(0.6, 0.47));
  assert.equal(a, b);
  // (a bigger screen sees the same lobule bigger, so it arrives sooner: never later)
  assert.ok(mosaicShare(0.9, pxPer(1400), 0.8) >= mosaicShare(0.9, pxPer(600), 0.8));
  assert.equal(mosaicShare(Infinity, pxPer(800), 1), 0);
  assert.ok(LOBULE_SPAN > 0 && Math.abs(LOBULE_SPAN - 6 * LOBULE_SCALE) < 1e-12);
});

test('the mosaic\'s hexagon centres are the field\'s lobule centres (one shared lattice)', () => {
  const centres = tileCentres();
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let n = 0; n < 4000; n++) {
    const x = (rnd() - 0.5) * 80, y = (rnd() - 0.5) * 80, c = lobuleCentre(x, y);
    // (the nearest of the tile's own centres, found by brute force)
    let best = Infinity, bx = 0, by = 0;
    for (const [cx, cy] of centres) { const d = Math.hypot(x - cx, y - cy); if (d < best) { best = d; bx = cx; by = cy; } }
    if (Math.hypot(x, y) > 8) continue;
    assert.ok(Math.hypot(c.cx - bx, c.cy - by) < 1e-9, `(${x.toFixed(3)}, ${y.toFixed(3)}) centre ${c.cx},${c.cy} vs ${bx},${by}`);
  }
  // the lobule in focus is the one at the origin, its corners the home corners, each exactly on an edge's end: no distance to the edge there
  assert.ok(Math.hypot(lobuleCentre(0.1, -0.1).cx, lobuleCentre(0.1, -0.1).cy) < 1e-9);
  for (const [x, y] of HOME_CORNERS) assert.ok(Math.abs(hexEdgeDistance(x, y)) < 1e-9, 'a corner of the lobule in focus is on its edge');
  assert.ok(Math.abs(hexEdgeDistance(0, 0) - S3 / 2) < 1e-12);
  // the field's own shader reads the tile's size from the same constants
  assert.equal(FIELD_TILE_W, 6); assert.ok(Math.abs(FIELD_TILE_H - 2 * S3) < 1e-12);
  assert.ok(LOBULE_FIELD_FS.includes(`vLob.x / ${FIELD_TILE_W.toFixed(1)}`));
});

test('the colour grade ends at the field\'s tone, and the liver\'s shader carries the mosaic (and no other organ pays for it)', () => {
  for (const look of Object.keys(LOOKS) as LookId[]) {
    setLobuleTones(look);
    const want = rgbOf((LOBULE_PALETTES[look].tones as Record<string, string>).field!), got = LIVER_LOBULES.tone.value;
    assert.ok(Math.abs(got.x - want[0]) + Math.abs(got.y - want[1]) + Math.abs(got.z - want[2]) < 1e-9, look);
  }
  // (the shader's grade is mix(fill, lobTone, lobMos): at a share of 1 the base colour IS the tone; every part of it sits under the uniform's gate)
  assert.ok(LIVER_LOBULES_PAINT.includes('fill = mix(fill, lobTone, lobMos);'));
  assert.ok(/if \(lobMos > 0\.0\) \{[\s\S]*lobuleHex/.test(LIVER_LOBULES_PAINT));
  assert.ok(ORGAN_FS.includes(LIVER_LOBULES_PAINT) && ORGAN_FS.includes(LIVER_LOBULES_DECL) && ORGAN_VS.includes(LIVER_LOBULES_VS));
  // the derivative is taken before the window's discard, under the gate
  assert.ok(ORGAN_FS.indexOf('fwidth(vLobPos)') < ORGAN_FS.indexOf('discard;'));
  assert.ok(ORGAN_FS.indexOf('lobuleHex(vLobPos)') > ORGAN_FS.indexOf('discard;'));
  // the scene writes the share only through the one shared object, 0 at rest
  assert.equal(LIVER_LOBULES.mos.value, 0);
});
