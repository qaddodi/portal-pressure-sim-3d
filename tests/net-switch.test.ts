// A junction region's FILLET dissolves in and out (plan owner, 22 Nov): the arms' tubes run through their seams to the node (WP2), so with no fillet the junction is whole; each fillet mesh (body-built, map-built, or a mid mesh) is drawn by the screen dither
// with a share of its pixels: the body fillet dissolves over [a - 0.1, a], the map fillet comes in over [b, b + 0.05], a and b from the bake's table (`NodeReport.switchT`). Held here, node only: the region row's layout, the share function (the vertex stage's), and
// the vertex stage's early-out and the fragment stage's discard by the text. The acceptance on the real regions (no folded drawn triangle, no gap where a fillet dissolves, crotch ink drawn but not doubled, at every 0.05 of t) needs WP2's bake table.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BODY_ONLY, FADE_IN_T, FADE_OUT_T, MAP_ONLY, REGION_CAPS, REGION_HEAD, REGION_PTS, REGION_TEXELS, regionFades, regionShare, regionTexture, type Region } from '../src/scene/vessels/net/regions.ts';
import { NET_FS, NET_VS } from '../src/scene/vessels/net/shaders.ts';
import { SCREEN_DITHER_GLSL } from '../src/scene/materials/shaders.ts';

const caps = [{ bones: Array.from({ length: REGION_PTS }, (_, i) => i), mate: -1 }];
const body: Region = { node: 'N', vertStart: 10, vertCount: 5, arms: 1, caps, variant: 0, window: [0.3, 0.5] };
const map: Region = { node: 'N', vertStart: 15, vertCount: 5, arms: 1, caps, variant: 1, window: [0.3, 0.5] };
const mid: Region = { node: 'N', vertStart: 20, vertCount: 5, arms: 1, caps, variant: 2, window: [0.2, 0.3], window2: [0.6, 0.7] };

test('the region row: variant in texel 0, the fade ramps in texel 3, the bones from REGION_HEAD', () => {
  const t = regionTexture([body, map], 20), W = 4 * REGION_TEXELS;
  assert.equal(t.width, REGION_TEXELS); assert.equal(REGION_HEAD, 5);
  assert.deepEqual([t.data[2], t.data[W + 2]], [0, 1]);
  assert.deepEqual(Array.from(t.data.slice(12, 16)).map((x) => Math.round(x * 1e6) / 1e6), [-2, -1, 0.4, 0.5], 'body: always in, out over [a - 0.1, a]');
  assert.deepEqual(Array.from(t.data.slice(W + 12, W + 16)).map((x) => Math.round(x * 1e6) / 1e6), [0.3, 0.35, 2, 3], 'map: in over [b, b + 0.05], never out');
  assert.equal(t.data[4 * REGION_HEAD + 1], 1, 'the bone indices start at REGION_HEAD');
  assert.deepEqual([t.vertexRegion[9], t.vertexRegion[10], t.vertexRegion[15], t.vertexRegion[19]], [-1, 0, 1, 1]);
  assert.ok(REGION_CAPS >= 8);
});

test('the shares: the body fillet is there until a - 0.1 and gone at a, the map fillet comes in over [b, b + 0.05], a mid one does both, and a mesh alone is always there', () => {
  const [b, a] = body.window;
  assert.equal(regionShare(body, 0), 1); assert.equal(regionShare(body, a - FADE_OUT_T), 1); assert.equal(regionShare(body, a), 0); assert.equal(regionShare(body, 1), 0);
  assert.equal(regionShare(map, 0), 0); assert.equal(regionShare(map, b), 0); assert.equal(regionShare(map, b + FADE_IN_T), 1); assert.equal(regionShare(map, 1), 1);
  assert.equal(regionShare(mid, 0), 0); assert.equal(regionShare(mid, 0.25 + 0.001) > 0, true); assert.equal(regionShare(mid, 0.45), 1); assert.equal(regionShare(mid, 0.7), 0);
  for (const t of [0, 0.25, 0.5, 0.75, 1]) { assert.equal(regionShare({ ...body, window: BODY_ONLY }, t), 1); assert.equal(regionShare({ ...map, window: MAP_ONLY }, t), 1); }
  let prev = 1; for (let t = 0.4; t <= 0.5; t += 0.005) { const s = regionShare(body, t); assert.ok(s <= prev + 1e-12 && s >= 0, 'monotone out'); prev = s; }
  assert.deepEqual(regionFades(map).slice(2), [2, 3]);
});

test('in between, the plain tubes show: where both fillets are dissolved the shares are 0 (the gap is the tubes, not a hole)', () => {
  // body out by a = 0.5, map in from b = 0.3 means the map fillet is in while the body one still dissolves: an overlap (b < a), both partly there; with b >= a there is a stretch of none
  const gap: Region = { ...map, window: [0.6, 0.4] };   // a = 0.4 (body out at 0.4), b = 0.6
  const bodyG: Region = { ...body, window: [0.6, 0.4] };
  let none = 0; for (let t = 0; t <= 1.0001; t += 0.05) if (regionShare(bodyG, t) === 0 && regionShare(gap, t) === 0) none++;
  assert.ok(none > 0, 'a stretch of t with no fillet');
});

test('a fillet with no share is never moved away (its triangles at a seam ring share vertices with the plain tube: a lone vertex sent off screen stretches them across it): the projection is skipped and the fragment stage discards it, dissolving in the shared screen pattern', () => {
  const main = NET_VS.slice(NET_VS.indexOf('vDraw = 1.0;'), NET_VS.indexOf('vec3 pAcc = vec3(0.0)'));
  assert.match(main, /float share = smoothstep\(fd\.x, fd\.y, circT\) \* \(1\.0 - smoothstep\(fd\.z, fd\.w, circT\)\);/);
  assert.match(main, /if \(share <= 0\.0\) fillOff = true;/);
  assert.ok(!/gl_Position = vec4\(2\.0, 2\.0, 2\.0, 1\.0\); return;/.test(NET_VS), 'no early return that moves a vertex off the screen');
  assert.ok(!/netBone\(/.test(main), 'the share reads only the region row');
  assert.match(NET_VS, /if \(region > -0\.5 && !fillOff\) \{\s*\/\/ THE PROJECTION/, 'no projection (the expensive part) for a fillet with no share');
  assert.match(NET_VS, /if \(region > -0\.5 && !fillOff\) \{\s*\/\/ \(every region has keys: one path\)/, 'no key reads either');
  assert.ok(NET_FS.includes(`if (vDraw < 0.999 && ${SCREEN_DITHER_GLSL} >= vDraw) discard;`));
  assert.ok(NET_FS.indexOf('vDraw < 0.999') < NET_FS.indexOf('vec3 n = normalize(vN);'), 'before any derivative');
});
