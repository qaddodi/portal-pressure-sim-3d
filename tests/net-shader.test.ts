// WP3 of the network geometry: the network shader (src/scene/vessels/net/shaders.ts) held to the rest of the code, node only (the GLSL compile and link is src/debug/gl-auto.ts's, through GL_PROGRAMS).
// What it pins: the plain uniforms the shaders declare are exactly NET_GLOBALS (WP4 builds the material from that list, so a uniform added to a shader and not to it is a test failure, not a black vessel); every per-edge value the shaders read is a column
// of the edge-state texture (no per-vessel uniform is left); the rules the old vessel program and the network program must share are the same SOURCE text (spliced, never copied); and the varying budget holds.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GL_PROGRAMS, NET_FS, NET_FS_COLUMNS, NET_GLOBALS, NET_VS, NET_VS_COLUMNS } from '../src/scene/vessels/net/shaders.ts';
import { EDGE_LAYOUT } from '../src/scene/vessels/net/edge-state.ts';
import { VESSEL_FS, VESSEL_VS } from '../src/scene/vessels/shaders.ts';
import { CAP_CARVED_GLSL, CIRC_WIDTH_OF_GLSL, FADE_ALPHA_GLSL, HIGHLIGHT_ALONG_GLSL, PROCEDURE_MARKS_GLSL, STUMP_K_GLSL } from '../src/scene/vessels/glsl-shared.ts';
import { CIRC_PEEL_GLSL } from '../src/scene/circuit/shader.ts';

const uniforms = (src: string): Map<string, string> => {
  const out = new Map<string, string>();
  for (const m of src.matchAll(/^\s*uniform\s+(?:highp\s+|mediump\s+|lowp\s+)?(\w+)\s+(\w+)(\[[^\]]*\])?\s*;/gm)) out.set(m[2]!, m[1]! + (m[3] ?? ''));
  return out;
};
const stripped = (s: string): string => s.replace(/\/\/[^\n]*/g, '').replace(/\s+/g, ' ');

test('every plain uniform the network shaders declare is in NET_GLOBALS with the same type, and nothing in it is unused', () => {
  const seen = new Map<string, string>();
  for (const src of [NET_VS, NET_FS]) for (const [n, t] of uniforms(src)) seen.set(n, t);
  for (const [n, t] of seen) {
    assert.ok(n in NET_GLOBALS, `the shaders declare uniform ${t} ${n}, which NET_GLOBALS does not list`);
    const want = NET_GLOBALS[n]!;
    assert.ok(t === want || want.replace(/\[\]/, '') === t.replace(/\[.*\]/, ''), `${n}: shader ${t}, NET_GLOBALS ${want}`);
  }
  for (const n of Object.keys(NET_GLOBALS)) assert.ok(seen.has(n), `NET_GLOBALS lists ${n} and no shader declares it`);
});

test('no per-vessel uniform is left: every column the shaders read is in the edge-state layout, and each stage declares the globals it loads', () => {
  for (const [stage, cols, src] of [['vertex', NET_VS_COLUMNS, NET_VS], ['fragment', NET_FS_COLUMNS, NET_FS]] as const) {
    for (const c of cols) {
      assert.ok(EDGE_LAYOUT.has(c), `${stage}: column ${c} is not in EDGE_LAYOUT`);
      assert.match(src, new RegExp(`\\b${c}\\b`), `${stage}: column ${c} is loaded and never read`);
    }
  }
});

test('the old and the network vessel programs share the rules as the same source text', () => {
  for (const [name, chunk] of [['CIRC_WIDTH_OF', CIRC_WIDTH_OF_GLSL], ['STUMP_K', STUMP_K_GLSL], ['CAP_CARVED', CAP_CARVED_GLSL], ['PROCEDURE_MARKS', PROCEDURE_MARKS_GLSL], ['FADE_ALPHA', FADE_ALPHA_GLSL], ['HIGHLIGHT_ALONG', HIGHLIGHT_ALONG_GLSL], ['CIRC_PEEL', CIRC_PEEL_GLSL]] as const) {
    const c = stripped(chunk);
    assert.ok(c.length > 40, `${name} is empty`);
    const old = stripped(VESSEL_VS + VESSEL_FS), net = stripped(NET_VS + NET_FS);
    assert.ok(old.includes(c) || net.includes(c), `${name} is in neither program`);
    assert.ok(net.includes(c), `${name} is not in the network program verbatim: a copy, or a rule left out`);
  }
  // the old program carries every rule the shared chunks hold, so the byte-identity of its output (tests/glsl-shared.test.ts) covers them
  for (const chunk of [CIRC_WIDTH_OF_GLSL, STUMP_K_GLSL, CAP_CARVED_GLSL, FADE_ALPHA_GLSL, HIGHLIGHT_ALONG_GLSL, PROCEDURE_MARKS_GLSL]) assert.ok(stripped(VESSEL_VS + VESSEL_FS).includes(stripped(chunk)), 'the old program lost a shared rule');
});

test('the live radius is one function: the network vertex shader has no second copy of the swell and the Circuit width rules', () => {
  assert.equal((NET_VS.match(/float circWidthOf\(/g) ?? []).length, 1);
  assert.equal((NET_VS.match(/float stumpK\(/g) ?? []).length, 1);
  assert.equal((NET_VS.match(/vec2 circPeel\(|float circPeel\(/g) ?? []).length, 1);
});

test('four programs, and the network pair stays within the 15-varying floor', () => {
  assert.equal(GL_PROGRAMS.length, 4);
  const varyings = (src: string): number => {
    let n = 0;
    for (const m of src.matchAll(/^\s*(?:flat\s+)?out\s+(\w+)\s+\w+(\[(\d+)\])?\s*;/gm)) n += Number(m[3] ?? 1) * (m[1] === 'mat3' ? 3 : m[1] === 'mat4' ? 4 : 1);
    return n;
  };
  const used = varyings(NET_VS);
  assert.ok(used <= 15, `${used} varyings, the floor is 15`);
});

test('the junction projection in the vertex stage: the oracle\'s constants (k scale, shade width, ease), three Newton steps, the region row layout, and the push along the union\'s own gradient', async () => {
  const { SKIN_K } = await import('../src/scene/vessels/skin/sdf.ts');
  const { SKIN_RING_W_FROM, SKIN_SHADE_K } = await import('../src/scene/vessels/skin/exact-normal.ts');
  const { REGION_CAPS, REGION_PTS, REGION_TEXELS } = await import('../src/scene/vessels/net/regions.ts');
  const f = (n: number): string => (Number.isInteger(n) ? n.toFixed(1) : String(n));
  assert.match(NET_VS, /for \(int s = 0; s < 3; s\+\+\) \{\s*float f = netUnion\(pAcc, kU, nc, gU\);/, 'three Newton steps on the union');
  assert.ok(NET_VS.includes(`float kU = ${f(SKIN_K)} * kMin;`), 'k is SKIN_K x the narrowest arm\'s live lumen');
  assert.ok(NET_VS.includes(`${f(SKIN_SHADE_K)} * kU`) && NET_VS.includes(`smoothstep(0.6, ${f(SKIN_RING_W_FROM)}, wmax)`), 'the shade width and the ease to the tube\'s own normal');
  assert.ok(NET_VS.includes(`vec4 capP[${REGION_CAPS * REGION_PTS}];`));
  assert.equal(REGION_TEXELS, 3 + (REGION_CAPS * REGION_PTS) / 4);
  assert.match(NET_VS, /pAcc \+= nPush \* padAcc;/, 'the ink, the sag and the lift push along the sharp gradient for a junction vertex');
  assert.match(NET_VS, /float sc = region > -0\.5 \? b\.lumenRest : b\.lumen;/, 'a junction vertex starts at the rest radii');
});

test('the free-end fade is each bone\'s own, at its REST position: a hidden returning tail does not take the pixel\'s y', () => {
  assert.match(NET_VS, /vec3 position = A\.xyz;/, 'the fade code reads the bone\'s body-pose centre');
  assert.ok(!/fadeMode/.test(NET_FS) && !/gl_FragCoord\.y[^;]*fade/i.test(NET_FS), 'the fragment stage fades by the bone-weighted vFade only');
});
