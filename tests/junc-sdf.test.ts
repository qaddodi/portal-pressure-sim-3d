// The junction SDF trial (net/junc-sdf.ts, ?geom=net&junc=sdf): node only. The programs compile in tests/glsl-compile.test.ts; here, that the trial is built FROM the network's own stages
// (so a change there reaches it or fails loudly), that silencing a region's fillet keeps its share at 0 over the whole Circuit move, and that the flag is the trial's alone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JUNC_FS, JUNC_INFO_A_VS, JUNC_INFO_B_VS, NO_FILLET, juncSdf, netShadeOf, rowsOf, silenceFillets } from '../src/scene/vessels/net/junc-sdf.ts';
import { NET_FS } from '../src/scene/vessels/net/shaders.ts';
import { REGION_TEXELS, type Region } from '../src/scene/vessels/net/regions.ts';

test('netShade is NET_FS as a function: no varyings, no main of its own, the lateral distance and the facing replaced', () => {
  const s = netShadeOf(NET_FS);
  assert.doesNotMatch(s, /^\s*(flat )?varying /m);
  assert.doesNotMatch(s, /void main\(\)/);
  assert.match(s, /void netShade\(\) \{/);
  assert.match(s, /float dLat = rmLat;/);
  assert.doesNotMatch(s, /gl_FrontFacing/);
  // every line of the fragment stage's colour is kept (same length but for the edits)
  assert.ok(s.length > NET_FS.length * 0.95);
  assert.throws(() => netShadeOf('void main() {}'));
});

test('the trial program calls netShade once, after it writes the depth', () => {
  const main = JUNC_FS.slice(JUNC_FS.lastIndexOf('void main() {'));
  assert.equal(main.match(/netShade\(\);/g)?.length, 1);
  assert.ok(main.indexOf('gl_FragDepth') < main.indexOf('netShade();'));
});

test('the info passes are the capsule pass with the full netBone', () => {
  for (const vs of [JUNC_INFO_A_VS, JUNC_INFO_B_VS]) { assert.match(vs, /netBone\([^;]*, false\);/); assert.doesNotMatch(vs, /vCapOut = vec4\(nb\.cen, nb\.lumen\)/); }
  assert.match(JUNC_INFO_A_VS, /nb\.row\) \+ 0\.5 \* nb\.u/);
  assert.match(JUNC_INFO_B_VS, /nb\.stay, nb\.hi, nb\.unit, nb\.arc/);
});

test('a silenced fillet has share 0 at every t, the other rows are untouched, and the old ramps come back', () => {
  const rows = 3, data = new Float32Array(4 * REGION_TEXELS * rows);
  for (let r = 0; r < rows; r++) data.set([-2, -1, 0.4, 0.5], 4 * (REGION_TEXELS * r + 3));
  const before = data.slice();
  const old = silenceFillets(data, REGION_TEXELS, [0, 2]);
  assert.deepEqual([...data.subarray(4 * 3, 4 * 3 + 4)], [...NO_FILLET]);
  assert.deepEqual([...data.subarray(4 * (REGION_TEXELS + 3), 4 * (REGION_TEXELS + 3) + 4)], [-2, -1, 0.4, 0.5].map(Math.fround));
  // (NO_FILLET read the shader's way: smoothstep(in) * (1 - smoothstep(out)))
  const ss = (a: number, b: number, x: number) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
  for (let t = 0; t <= 1.0001; t += 0.05) assert.equal(ss(NO_FILLET[0], NO_FILLET[1], t) * (1 - ss(NO_FILLET[2], NO_FILLET[3], t)), 0);
  const ramp = (r: number) => [...before.subarray(4 * (REGION_TEXELS * r + 3), 4 * (REGION_TEXELS * r + 3) + 4)];
  assert.deepEqual([...old.subarray(0, 4)], ramp(0));
  assert.deepEqual([...old.subarray(4, 8)], ramp(2));
});

test('the rows of a node: every mesh of it (body and map built)', () => {
  const rg = (node: string): Region => ({ node } as Region);
  assert.deepEqual(rowsOf({ regions: [rg('CONF'), rg('SV'), rg('CONF')] }, 'CONF'), [0, 2]);
});

test('the flag is ?junc=sdf only', () => {
  assert.equal(juncSdf('?geom=net&junc=sdf'), true);
  assert.equal(juncSdf('?geom=net'), false);
  assert.equal(juncSdf('?junc=mesh'), false);
});
