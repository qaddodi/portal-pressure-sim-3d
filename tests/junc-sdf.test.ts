// The junction SDF trial (net/junc-sdf.ts, ?geom=net&junc=sdf): node only. The programs compile in tests/glsl-compile.test.ts; here, that the trial is built FROM the network's own stages
// (so a change there reaches it or fails loudly), that silencing a region's fillet keeps its share at 0 over the whole Circuit move, and that the flag is the trial's alone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JUNC_FS, JUNC_INFO_A_VS, JUNC_INFO_B_VS, NO_FILLET, juncSdf, netShadeOf, marchRows, edgeRegions, silenceFillets, JUNC_GEOM_VS, JUNC_VS } from '../src/scene/vessels/net/junc-sdf.ts';
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

test('every junction node is marched once (its body-built row when it has one), and each edge knows the marched regions it is an arm of', () => {
  const rg = (node: string, variant: number): Region => ({ node, variant } as Region);
  assert.deepEqual(marchRows([rg('CONF', 1), rg('SV', 0), rg('CONF', 0), rg('CONF', 2), rg('IVC', 2)]), [1, 2, 4]);
  // bones 0,1 on edge 0; bone 2 on edge 1; bone 3 on edge 2; edge 3 is no region's arm
  const skel = { bones: [{ edge: 0 }, { edge: 0 }, { edge: 1 }, { edge: 2 }], edges: [{}, {}, {}, {}] } as unknown as Parameters<typeof edgeRegions>[0];
  const regions = [{ caps: [{ bones: [0, 1] }, { bones: [2] }] }, { caps: [{ bones: [2] }, { bones: [3] }] }] as unknown as Parameters<typeof edgeRegions>[1];
  assert.deepEqual([...edgeRegions(skel, regions, [0, 1])], [0, -1, -1, -1, 0, 1, -1, -1, 1, -1, -1, -1, -1, -1, -1, -1]);
});

test('the cut and the proxy are per region row: no single-region uniform is left', () => {
  assert.doesNotMatch(JUNC_FS + JUNC_GEOM_VS + JUNC_VS, /juncRow/);
  assert.match(JUNC_VS, /texelFetch\(juncGeom, ivec2\(0, int\(juncRegion \+ 0\.5\)\), 0\)/);
  assert.match(JUNC_FS, /int rr = int\(vJuncRow \+ 0\.5\);/);
  assert.match(NET_FS, /texelFetch\(juncEdge, ivec2\(int\(row \+ 0\.5\), 0\), 0\)/);
});

test('the flag is ?junc=sdf only', () => {
  assert.equal(juncSdf('?geom=net&junc=sdf'), true);
  assert.equal(juncSdf('?geom=net'), false);
  assert.equal(juncSdf('?junc=mesh'), false);
});

test('the cut: a tube inside the junction is not drawn, the march draws nothing beyond an arm\'s plane and draws its outline only inside the cut', () => {
  assert.match(NET_FS, /if \(juncCut\(vMp, vEdge\.x\)\) discard;/);
  assert.doesNotMatch(netShadeOf(NET_FS), /juncCut\(vMp/);
  const main = JUNC_FS.slice(JUNC_FS.lastIndexOf('void main() {'));
  assert.match(main, /if \(!beyond && px < minPx\)/);
  assert.match(main, /if \(beyond\) discard; hit = true;/);
  assert.doesNotMatch(main, /JUNC_DEPTH_BIAS|toEye/);
});

test('the marks run on through the junction: each arm\'s dust and heads, in its own frame, gated by its own capsule, with no derivative in the second arm\'s branch', () => {
  const shade = netShadeOf(NET_FS);
  // the same calls as the tube's, once for the first arm and once for the second
  const n = (src: string, re: RegExp): number => src.match(re)?.length ?? 0;
  assert.equal(n(shade, /= flowHeads\(/g), n(NET_FS, /= flowHeads\(/g) + 1);
  assert.equal(n(shade, /= flowDust\(/g), n(NET_FS, /= flowDust\(/g) + 1);
  assert.match(shade, /hdB = flowHeads\(acrossB, acrossW, arcSB \* jUnitB, lenHB \* jUnitB, jRB,/);
  assert.match(shade, /fd \+= clamp\(fdB, 0\.0, 1\.0\) \* dHold\(fadeHere\) \* jGateB \* \(1\.0 - fd\.a\);/);
  assert.match(shade, /hd \+= clamp\(hdB, 0\.0, 1\.0\) \* jGateB \* \(1\.0 - hd\.a\);/);
  // the second arm's state is loaded for its marks and the first's put back
  assert.equal(shade.match(/loadEdgeFS\(int\(jRowB \+ 0\.5\)\);/g)?.length, 2);
  assert.equal(n(shade, /loadEdgeFS\(int\(vEdge\.x \+ 0\.5\)\);/g), n(NET_FS, /loadEdgeFS\(int\(vEdge\.x \+ 0\.5\)\);/g) + 2);
  // the gates and the second arm are set by the march before netShade runs
  const main = JUNC_FS.slice(JUNC_FS.lastIndexOf('void main() {'));
  assert.ok(main.indexOf('vMarkE = vec2(1.0 - smoothstep(0.0, gate, dA), rowA);') < main.indexOf('netShade();'));
  assert.ok(main.indexOf('jGateB = 1.0 - smoothstep(0.0, gate, dB);') < main.indexOf('netShade();'));
  // the second arm is never the first's mate
  assert.match(main, /if \(c == cA \|\| c == mateA \|\| int\(floor\(jMate\[c\] \+ 0\.5\)\) == cA\) continue;/);
  const b = shade.slice(shade.indexOf('if (jHasB) {'), shade.lastIndexOf('loadEdgeFS(int(vEdge.x + 0.5));'));
  assert.doesNotMatch(b, /fwidth|dFdx|dFdy/);
});
