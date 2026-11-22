// The keyed start of a wide junction in the vertex stage (WP3, 22 Nov): the keys' storage (keyTex), the weights, and the shader's text. The oracle on the real figure (20 preset states, t 0 to 1) took the body fillets' folds at the wide arms' low end to 0 with this blend.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KEY_COLS, KEY_MAX, KEY_NONE, KEY_RIDX, KEY_TEX, KEY_W, keyPlan, keyWeights, regionTexture, type Region } from '../src/scene/vessels/net/regions.ts';
import { NET_VS } from '../src/scene/vessels/net/shaders.ts';

const skel = { bones: [{ edge: 0, r: [1] }, { edge: 1, r: [0.5] }] };
const caps = [{ bones: [0, 0, 0, 0, 0, 0, 0, 0], mate: -1 }, { bones: [1, 1, 1, 1, 1, 1, 1, 1], mate: -1 }];
const rg: Region = { node: 'N', vertStart: 0, vertCount: 2, arms: 2, caps, variant: 0, window: [2, 2] };
const off = (a: number): Float32Array => Float32Array.from({ length: 24 }, (_, i) => a + i / 100);
const keys = [{ node: 'N', variant: 0 as const, vertStart: 0, vertCount: 2, arms: [0, 1], keys: [{ swell: [1, 1], offset: off(1), offsetMap: off(10) }, { swell: [2, 0.5], offset: off(2), offsetMap: off(20) }] }];
const mesh = { bone: Uint16Array.from([0, 1, 0, 0, 1, 0, 0, 0]), weight: Float32Array.from([0.5, 0.5, 0, 0, 1, 0, 0, 0]) };
const at = (d: Float32Array, slot: number, texel: number, c: number): number => d[4 * (Math.floor(slot / KEY_COLS) * KEY_W + (slot % KEY_COLS) * KEY_MAX * KEY_TEX + texel) + c]!;

test('keyPlan: a header slot with each key\'s ln lumens and a slot per vertex with the keys\' offsets times each bone\'s key swell over the bake scale', () => {
  const p = keyPlan(skel, [rg], keys, mesh, [1, 1]);
  assert.deepEqual(p.region[0], { nk: 2, header: 1, first: 2 });
  assert.equal(p.width, KEY_W);
  const ln = (k: number, a: number): number => at(p.data, 1, (k * 8 + a) >> 2, (k * 8 + a) & 3);
  assert.ok(Math.abs(ln(0, 0) - 0) < 1e-6 && Math.abs(ln(0, 1) - Math.log(0.5)) < 1e-6 && Math.abs(ln(1, 0) - Math.log(2)) < 1e-6 && Math.abs(ln(1, 1) - Math.log(0.25)) < 1e-6);
  assert.equal(ln(0, 2), KEY_NONE, 'a capsule the region does not have');
  // vertex 0 (slot 2), key 1 body: bone 0 (edge 0, swell 2) carries floats 0..2, bone 1 (edge 1, swell 0.5) floats 3..5
  const o = off(2);
  assert.ok(Math.abs(at(p.data, 2, KEY_TEX + 0, 0) - 2 * o[0]!) < 1e-5 && Math.abs(at(p.data, 2, KEY_TEX + 0, 3) - 0.5 * o[3]!) < 1e-5, 'bone 0 x 2, bone 1 x 0.5');
  // the map set follows the body's three texels
  assert.ok(Math.abs(at(p.data, 2, 3, 0) - 1 * off(10)[0]!) < 1e-4);
  // vertex 1 (slot 3) has one bone: its second bone's weight is 0 so its offsets stay as they are
  assert.ok(Math.abs(at(p.data, 3, 0, 0) - off(1)[12]!) < 1e-5);
});

test('the vertex attribute carries the key slot above the region row, and a region without keys is as it was', () => {
  const p = keyPlan(skel, [rg], keys, mesh, [1, 1]);
  const t = regionTexture([rg], 3, p);
  assert.deepEqual([t.vertexRegion[0], t.vertexRegion[1], t.vertexRegion[2]], [0 + KEY_RIDX * 2, 0 + KEY_RIDX * 3, -1]);
  assert.deepEqual([t.data[4 * 4], t.data[4 * 4 + 1]], [2, 1], 'texel 4: key count, header slot');
  const plain = regionTexture([rg], 3);
  assert.deepEqual([plain.vertexRegion[0], plain.vertexRegion[1]], [0, 0]);
});

test('the weights are the shader\'s: at a key\'s own lumens that key has the whole weight, between two they share it, and an absent arm is skipped', () => {
  const lnKey = new Float32Array(KEY_MAX * 8).fill(KEY_NONE);
  lnKey.set([0, Math.log(0.5)], 0); lnKey.set([Math.log(2), Math.log(0.25)], 8);
  const own = keyWeights([0, Math.log(0.5)], lnKey, 2, 2);
  assert.ok(own[0]! > 0.99999 && own[1]! < 1e-5);
  const mid = keyWeights([Math.log(2) / 2, (Math.log(0.5) + Math.log(0.25)) / 2], lnKey, 2, 2);
  assert.ok(Math.abs(mid[0]! - 0.5) < 1e-5 && Math.abs(mid.reduce((a, b) => a + b, 0) - 1) < 1e-12);
  lnKey[1] = KEY_NONE; lnKey[9] = KEY_NONE;
  assert.ok(keyWeights([0, 99], lnKey, 2, 2)[0]! > 0.9, 'the second arm is not one of the keys\': only the first counts');
});

test('the vertex stage blends the keys by those weights into the offsets the bone blend reads, before the projection', () => {
  assert.match(NET_VS, /int regionAttr = region > -0\.5 \? int\(region \+ 0\.5\) : 0;/);
  assert.ok(NET_VS.includes(`kslot = regionAttr / ${KEY_RIDX}`));
  assert.match(NET_VS, /if \(kslot > 0\) \{[\s\S]*kw\[k\] = 1\.0 \/ \(dk \* dk\);/, 'weights 1 / (distance + 0.001)^2');
  assert.match(NET_VS, /float dk = sqrt\(d2\) \+ 0\.001;/);
  assert.match(NET_VS, /vec3 o = k == 0 \? o0\.xyz/, 'the bone blend reads the blended offsets, not the attributes');
  assert.match(NET_VS, /vec3 om = k == 0 \? m0\.xyz/);
  assert.ok(!/k == 0 \? off0\.xyz/.test(NET_VS) && !/k == 0 \? offM0\.xyz/.test(NET_VS));
  assert.match(NET_VS, /texelFetch\(capTex, ivec2\(c \* \d+, rrow\), 0\)\.w/, 'the arms\' live lumens are the capsule pass\'s');
});
