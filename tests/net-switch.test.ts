// A junction region has two meshes (plan owner, 22 Nov): a body-built and a map-built one, both projected onto the same live union, handing over by the screen dither over a window [b, a] of t. Held here, node only: the region row's layout, the
// share function the vertex stage evaluates, and that the two meshes' dither patterns are complementary (every pixel is drawn by exactly one of them, so the hand-over shows nothing); the vertex stage's early-out and the fragment stage's discard by the text.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BODY_ONLY, MAP_ONLY, REGION_CAPS, REGION_HEAD, REGION_PTS, REGION_TEXELS, bodyShare, regionTexture, type Region } from '../src/scene/vessels/net/regions.ts';
import { NET_FS, NET_VS } from '../src/scene/vessels/net/shaders.ts';
import { SCREEN_DITHER_GLSL } from '../src/scene/materials/shaders.ts';

const caps = [{ bones: Array.from({ length: REGION_PTS }, (_, i) => i), mate: -1 }];
const body: Region = { node: 'N', vertStart: 10, vertCount: 5, arms: 1, caps, variant: 0, window: [0.3, 0.5] };
const map: Region = { node: 'N', vertStart: 15, vertCount: 5, arms: 1, caps, variant: 1, window: [0.3, 0.5] };

test('the region row: variant in texel 0, the window in texel 3, the bones from REGION_HEAD', () => {
  const t = regionTexture([body, map], 20), W = 4 * REGION_TEXELS;
  assert.equal(t.width, REGION_TEXELS); assert.equal(REGION_HEAD, 4);
  assert.deepEqual([t.data[2], t.data[W + 2]], [0, 1]);
  assert.ok(Math.abs(t.data[12]! - 0.3) < 1e-6 && Math.abs(t.data[13]! - 0.5) < 1e-6);
  assert.equal(t.data[4 * REGION_HEAD + 1], 1, 'the bone indices start at REGION_HEAD');
  assert.deepEqual([t.vertexRegion[9], t.vertexRegion[10], t.vertexRegion[15], t.vertexRegion[19]], [-1, 0, 1, 1]);
  assert.ok(REGION_CAPS >= 8);
});

test('the body mesh\'s share: 1 up to b, 0 from a, smooth between; a mesh alone is always drawn', () => {
  const win: [number, number] = [0.3, 0.5];
  assert.equal(bodyShare(win, 0), 1); assert.equal(bodyShare(win, 0.3), 1); assert.equal(bodyShare(win, 0.5), 0); assert.equal(bodyShare(win, 1), 0);
  let prev = 1; for (let t = 0.3; t <= 0.5; t += 0.01) { const s = bodyShare(win, t); assert.ok(s <= prev + 1e-12 && s >= 0, 'monotone'); prev = s; }
  for (const t of [0, 0.25, 0.5, 0.75, 1]) { assert.equal(bodyShare(BODY_ONLY, t), 1); assert.equal(bodyShare(MAP_ONLY, t), 0); }
  assert.equal(bodyShare([0.5, 0.5], 0.49), 1); assert.equal(bodyShare([0.5, 0.5], 0.5), 0, 'a window with a <= b is a hard switch');
});

test('complementary patterns: at every t and every pattern value exactly one of the two meshes draws the pixel', () => {
  // the shader: the body mesh discards when the pattern value >= its share, the map mesh when the value < the share
  for (let t = 0; t <= 1.0001; t += 0.05) {
    const wb = bodyShare(body.window, t);
    for (let k = 0; k < 1000; k++) {
      const nz = k / 1000, bodyDraws = !(nz >= wb), mapDraws = !(nz < wb);
      assert.equal(Number(bodyDraws) + Number(mapDraws), 1, `t ${t.toFixed(2)} value ${nz}`);
    }
  }
});

test('the vertex stage collapses the mesh that is not drawn before it reads a bone, and the fragment stage uses the shared screen pattern', () => {
  const main = NET_VS.slice(NET_VS.indexOf('vDraw = 1.0;'), NET_VS.indexOf('vec3 pAcc = vec3(0.0)'));
  assert.match(main, /float wb = win\.y > win\.x \? 1\.0 - smoothstep\(win\.x, win\.y, circT\) : \(circT < win\.y \? 1\.0 : 0\.0\);/);
  assert.match(main, /if \(variantM < 0\.5 \? wb <= 0\.0 : wb >= 1\.0\) \{ gl_Position = vec4\(2\.0, 2\.0, 2\.0, 1\.0\); return; \}/);
  assert.ok(!/netBone\(/.test(main), 'the early out reads only the region row');
  assert.ok(NET_FS.includes('if (mapMesh ? nzS < wbS : nzS >= wbS) discard;') && NET_FS.includes(`float nzS = ${SCREEN_DITHER_GLSL};`));
  assert.ok(NET_FS.indexOf('nzS') < NET_FS.indexOf('vec3 n = normalize(vN);'), 'before any derivative');
});
