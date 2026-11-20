// The junction skin's shaders (src/scene/vessels/skin/shaders.ts, rebuild-3d/junction-skin-spec.md WP3): what can be held without a GPU. The glslang compile of both programs is in tests/glsl-compile.test.ts
// (the skin is registered in src/debug/gl-registry.ts); the position, colour and ink agreement with the tubes at a seam is WP6 (tests/skin-agreement.test.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SKIN_ARMS, SKIN_FIGURE_UNITS, SKIN_FS, SKIN_VS } from '../src/scene/vessels/skin/shaders.ts';
import { VESSEL_VS } from '../src/scene/vessels/shaders.ts';
import { SWELL_OF_GLSL, LENS_OF_AT_GLSL } from '../src/scene/vessels/glsl-shared.ts';
import { ES3_FLOOR, budget, declarations, lateMaterialProgram } from '../src/debug/gl-programs.ts';
import { rawPrograms } from '../src/debug/gl-registry.ts';

const program = lateMaterialProgram('skin', SKIN_VS, SKIN_FS);
const FIBRO = '';

test('the skin takes its swell and its lens colour from the tube\'s own GLSL (the shared chunks), never a copy', () => {
  assert.ok(SKIN_VS.includes(SWELL_OF_GLSL), 'SKIN_VS has swellOf from glsl-shared.ts');
  assert.ok(SKIN_FS.includes(LENS_OF_AT_GLSL), 'SKIN_FS has lensOfAt from glsl-shared.ts');
});

test('the figure\'s units in a scene unit are the vessel\'s own (vU on the body)', () => {
  assert.ok(VESSEL_VS.includes(`mix(${SKIN_FIGURE_UNITS}.0, 1.0 / CIRC_MAPK, circShare)`), 'vessels/shaders.ts sets vU = mix(300, ...): the skin\'s ink and width rules are in the same units');
});

test('the varyings stay within 12 vec4s (an iPhone must have room: the floor is 15 and three adds none; vPos places each arm\'s arc)', () => {
  const b = budget(program);
  assert.ok(b.varyings <= 12, `${b.varyings} varying vectors`);
  const names = declarations(SKIN_VS).filter((d) => d.storage === 'varying').map((d) => d.name).sort();
  assert.deepEqual(names, ['vCenW', 'vN', 'vPos', 'vRest', 'vSwell', 'vSwell2', 'vV', 'vW', 'vWeight', 'vWeight2'], 'the vertex stage hands the fragment stage exactly these');
  const fs = declarations(SKIN_FS).filter((d) => d.storage === 'varying').map((d) => d.name).sort();
  assert.deepEqual(fs, names, 'the fragment stage declares the same varyings');
});

test('the skin asks no more of the GPU than the floor, and the fragment stage leaves room for the tubes\' shared lens uniforms', () => {
  const b = budget(program);
  for (const k of Object.keys(ES3_FLOOR) as Array<keyof typeof ES3_FLOOR>) assert.ok(b[k] <= ES3_FLOOR[k], `${k}: ${b[k]} of ${ES3_FLOOR[k]}`);
  assert.ok(b.fragmentUniformVectors <= 120, `${b.fragmentUniformVectors} fragment uniform vectors: a junction is a small area of the screen and must stay a light program`);
});

test('the per-arm uniforms are the spec\'s section 3 names, with its sizes', () => {
  const u = new Map(declarations(SKIN_FS).filter((d) => d.storage === 'uniform').map((d) => [d.name, d]));
  const want: Array<[string, string, number]> = [
    ['armData', 'vec4', SKIN_ARMS], ['armAF', 'vec4', SKIN_ARMS], ['armAxisP', 'vec4', SKIN_ARMS * 4], ['skinK', 'float', 1],
  ];
  for (const [name, type, n] of want) {
    const d = u.get(name);
    assert.ok(d, `${name} is declared in SKIN_FS`);
    assert.equal(d!.type, type, name);
    assert.equal(d!.array, n, name);
  }
  const v = new Map(declarations(SKIN_VS).filter((d) => d.storage === 'uniform').map((d) => [d.name, d]));
  assert.equal(v.get('armData')?.array, SKIN_ARMS, 'the vertex stage reads the arms\' data texels');
  assert.equal(v.get('armAF')?.array, SKIN_ARMS, 'and their highlight');
});

test('the vertex attributes are the spec\'s (cen, weight, restR, sagK) on top of three\'s position and normal, and a growing arm\'s second shape (spec 10.2: 4 per arm, 2 arms: 14 with position and normal, inside the 16 every WebGL2 device has)', () => {
  const a = declarations(SKIN_VS).filter((d) => d.storage === 'attribute').map((d) => `${d.type} ${d.name}`).sort();
  const grow = ['A0', 'A1'].flatMap((k) => [`vec4 gPos${k}`, `vec3 gNor${k}`, `vec4 gWt${k}`, `vec2 gWt2${k}`]);
  assert.deepEqual(a, ['float restR', 'float sagK', 'vec2 weight2', 'vec3 cen', 'vec4 weight', ...grow].sort());
    assert.ok(a.length + 2 <= 16, `${a.length} attributes + position + normal`);
});

test('the skin draws the tubes\' flow marks, once per arm, with the tubes\' own code (tests/skin-marks.test.ts holds the rest)', () => {
  for (const word of ['chevOne', 'dustSkin(FD0, FD1, w1, ', 'dustTube(FD0, ', 'streamTex', 'chainTex', 'streakAmt', 'armArc']) assert.ok(SKIN_FS.includes(word), `${word} is in the skin`);
});

test('the skin is back-face culled in the fragment stage like the tube, and fades out on the Circuit', () => {
  assert.match(SKIN_FS, /if \(!gl_FrontFacing\) discard;/);
  assert.match(SKIN_FS, /smoothstep\(0\.0, 0\.35, circT\)/);
});

test('the skin\'s program is registered for the compile check and the ?gl page', () => {
  assert.ok(rawPrograms(FIBRO).some((p) => p.name === 'skin'), 'rawPrograms lists the skin');
});

// The seam down a fork's skin (Mohammad, 20 Nov: "i still see a seam at the blood vessels junction", PV into RPV and LPV): the dust is drawn in the two heaviest arms' frames, and on the line where the
// second and third arms weigh the same the pair changes. The second's share is taken less the third's weight, so it is 0 on both sides of that line and the change is continuous.
test('the skin dust\'s second-arm share is 0 where the second and third arms tie (no seam between a fork\'s branches)', () => {
  assert.match(SKIN_FS, /else wD2 = max\(wD2, wI\);/);
  assert.match(SKIN_FS, /float w1 = max\(wD1 - wD2, 0\.0\) \/ max\(wD0 \+ wD1 - 2\.0 \* wD2, 1e-4\);/);
  const share = (w: number[]) => { const s = [...w].sort((a, b) => b - a); return Math.max(s[1]! - (s[2] ?? 0), 0) / Math.max(s[0]! + s[1]! - 2 * (s[2] ?? 0), 1e-4); };
  for (const e of [1e-3, 1e-5]) {
    const a = share([0.5, 0.25 + e, 0.25 - e]), b = share([0.5, 0.25 - e, 0.25 + e]);
    assert.ok(a < 0.01 && b < 0.01, `continuous across the tie: ${a}, ${b}`);
  }
  assert.ok(Math.abs(share([0.5, 0.5, 0]) - 0.5) < 1e-9, 'a plain two-arm seam keeps its even blend');
});

test('?joins=debug paints each pixel the skin would drop, in the colour of its reason (red back face, cyan presence dither, yellow no alpha, magenta past the ink band), and the plain program is the same without it', async () => {
  const { joinsMode, skinDebugOn } = await import('../src/scene/vessels/skin/joins-mode.ts');
  assert.equal(skinDebugOn('?joins=debug'), true); assert.equal(skinDebugOn('?joins=old'), false); assert.equal(skinDebugOn(''), false);
  assert.equal(joinsMode('?joins=debug'), 'mesh2', 'debug builds every skin');
  for (const [why, col] of [['!gl_FrontFacing', '1.0, 0.0, 0.0'], ['alpha < 0.004', '1.0, 1.0, 0.0'], ['sdPx > inkDev + 0.5 + seamPad', '1.0, 0.0, 1.0']] as const) {
    assert.ok(SKIN_FS.includes(`#ifdef SKIN_DEBUG\n  if (${why}) { gl_FragColor = vec4(${col}, 1.0); gl_FragDepth = min(gl_FragCoord.z + 0.002, 1.0); return; }\n#endif\n`), why);
  }
  assert.ok(SKIN_FS.includes('vec4(0.0, 1.0, 1.0, 1.0); gl_FragDepth'), 'the presence dither is cyan; a painted pixel is pushed a little behind, so a real surface in front of it hides it and only a true hole shows its colour');
});

// Specks of any colour on the junction skins, gone with ?joins=nomarks (Mohammad, 20 Nov): the flow marks read a NaN. A welded skin's interpolated normal (or eye vector) can come to nothing at a crease and normalize() of
// nothing is NaN; a fetch past the route table's width is undefined. Every one is checked before use, and the marks' sums are held inside 0 .. 1.
test('the skin\'s flow marks can read no NaN: normal and eye vector length-checked, across clamped, route edges in range, mark sums clamped', () => {
  const fs = SKIN_FS.slice(SKIN_FS.indexOf('void main()'));
  assert.doesNotMatch(fs, /normalize\(vN\)|normalize\(vV\)/, 'no unguarded normalize of an interpolated vector');
  assert.match(fs, /vec3 n = nLen > 1e-5 \? vN \/ nLen : vec3\(0\.0, 0\.0, 1\.0\);/);
  assert.match(fs, /acA\[i\] = clamp\(dot\(n, /);
  assert.match(fs, /headAcc = clamp\(headAcc, 0\.0, 1\.0\);/);
  assert.match(fs, /dustAcc = clamp\(vec4\(dust\.rgb \* dOn, dust\.a \* dOn\), 0\.0, 1\.0\);/);
  for (const f of ['vec4 dustTube(DFrame F', 'vec3 dFind(float edge', 'vec4 dustSkin(DFrame F0']) {
    const body = SKIN_FS.slice(SKIN_FS.indexOf(f), SKIN_FS.indexOf(f) + 260);
    assert.match(body, /dEdgeOk\(/, `${f} checks its route edge`);
  }
});

// THE SPECKS ALONG THE WALLS (Mohammad, 20 Nov: black on the black background, brown on the liver, in rows at every junction): holes, not marks. The outline's band trimmed a pixel or two of the seam's silhouette, which
// the cut tube past the seam no longer covers. Root cause: the band decided at the seam where the tube's exact polygon should. Invariant: on a seam (one arm's weight near 1) the band is padded.
test('the outline band is padded on a seam so it never trims the silhouette of the cut tube', () => {
  assert.match(SKIN_FS, /float seamPad = 1\.5\d* \* dpr \* smoothstep\(0\.75, 0\.97, wMax\);/);
  assert.match(SKIN_FS, /if \(sdPx > inkDev \+ 0\.5 \+ seamPad\) discard;/);
  assert.match(SKIN_FS, /float wMax = 0\.0;\n\s+for \(int i = 0; i < 6; i\+\+\) wMax = max\(wMax, wAt\(i\)\);/);
});

test('?joins=nodust and ?joins=noheads split the marks for the A/B that finds a speck\'s layer (diagnostics: each leaves out one half of the skin\'s marks)', async () => {
  const { skinLeaveOut } = await import('../src/scene/vessels/skin/joins-mode.ts');
  assert.equal(skinLeaveOut('?joins=nodust'), 'dust');
  assert.equal(skinLeaveOut('?joins=noheads'), 'heads');
  assert.equal(skinLeaveOut('?joins=nomarks'), 'marks');
  assert.match(SKIN_FS, /#ifndef SKIN_NOHEADS\s+headAcc \+= wI \* flowHeads\([^\n]*\n#endif/);
  assert.match(SKIN_FS, /#ifndef SKIN_NODUST\s+if \(dOn > 0\.002\) \{/);
});
