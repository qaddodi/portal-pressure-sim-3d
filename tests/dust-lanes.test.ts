// THE LANE STREAKS (Mohammad, 23 Nov: "rebuild the dust/streak and keep options for me to edit under ?dust"): look B of blood/dust-glsl.ts, the new default. These pin what makes it cheap and smooth (a handful of
// candidates a segment instead of the scan's K x (2N + 1)), what keeps it inside its cell, and that the ?dust panel can switch it with the look easing like every other setting.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DUST_GLSL, DUST_MACROS } from '../src/scene/blood/dust-glsl.ts';
import { DUST_KMAX, DUST_LANES_MAX, DUST_LANE_LOOK, DUST_NMAX, DUST_NUMERIC, DUST_PRESETS, DUST_SELECTS, DUST_UNIFORMS, dustDefaults, dustDerive, dustText, parseDust } from '../src/scene/blood/dust-spec.ts';
import { DUST_EASE_MS, DustTuner } from '../src/scene/blood/dust.ts';
import { SEG_MAX, SEG_MIN } from '../src/scene/blood/routes.ts';

const W = { random: 1, speed: 0, depth: 0, radius: 0, source: 0, custom: 0, local: 1 };

test('A is the default (24 Nov: specks with B on iPhone and Mac) and B stays one choice away: the look select, the eased weight, the uniforms and the rows the panel shows', () => {
  const d = dustDefaults();
  assert.equal(d.dustLook, 'a');
  const sel = DUST_SELECTS.find((r) => r[0] === 'dustLook')!;
  assert.deepEqual(sel[2].map((o) => o[0]), ['a', 'b']);
  assert.ok(DUST_PRESETS.some(([n, o]) => /lane streaks/i.test(n) && o.dustLook === 'b'), 'a preset puts the lane streaks back');
  for (const k of ['lanes', 'cellLen', 'fill', 'laneJit', 'trains']) assert.ok(DUST_NUMERIC.some((r) => r[0] === k && r[6] === 'Lane streaks'), `${k} is a slider under Lane streaks`);
  for (const k of ['wLookB', 'lanes', 'laneJit', 'cellLen', 'fill', 'trains']) { assert.ok(DUST_UNIFORMS.includes(k as never), k); assert.ok(DUST_MACROS.includes(`#define D_${k} `), k); }
  // the lab's own `look` (its background) is not the app's: a lab paste still applies and leaves the look alone
  assert.equal(parseDust('{"look":"dark","density":1400}').dustLook, 'a');
  assert.equal(parseDust(dustText({ ...d, dustLook: 'b' })).dustLook, 'b', 'Copy settings carries the look and Apply restores it');
  const v = dustDerive({ ...d, lanes: 30, cellLen: 4 } as Record<string, number>, { ...W, lookB: 1 }, [0.6, 0.7, 1], { phone: false, devicePixels: 4.5e6 });
  assert.equal(v.wLookB, 1); assert.equal(v.lanes, 30); assert.equal(v.cellLen, 4);
  assert.equal(dustDerive(d as Record<string, number>, { ...W, lookB: 0 }, [0.6, 0.7, 1], { phone: true, devicePixels: 2e6 }).wLookB, 0);
});

test('switching the look eases: the weight glides, never snaps, and reports motion until it lands', () => {
  const t = new DustTuner(); t.snap();
  const ix = DUST_UNIFORMS.indexOf('wLookB');
  assert.equal(t.uniform.value[ix], 0, 'A is where it starts');
  t.set({ dustLook: 'b' });
  const moving = t.step(DUST_EASE_MS / 2);
  assert.equal(moving, true); const mid = t.uniform.value[ix]!; assert.ok(mid > 0 && mid < 1, `mid-way: ${mid}`);
  let n = 0; while (t.step(100) && n++ < 200);
  assert.equal(t.uniform.value[ix], 1, 'settled on B');
  t.set({ dustLook: 'a' }); n = 0; while (t.step(100) && n++ < 200);
  assert.equal(t.uniform.value[ix], 0, 'and back on A');
});

test('the shader: B finds a streak by its lane and its cell, a handful of candidates, never the scan; the look is a weight, and only the looks that show are drawn', () => {
  const src = DUST_GLSL;
  assert.match(src, /vec4 dustTubeB\(DFrame F, vec3 lit, vec3 ink, float rev\)/); assert.match(src, /vec4 dustSkinB\(DFrame F0, DFrame F1, float w1, vec3 lit, vec3 ink, float rev\)/);
  assert.match(src, /vec4 dustTubeA\(DFrame F/); assert.match(src, /vec4 dustSkinA\(DFrame F0/);
  const b = src.slice(src.indexOf('vec4 dustTubeB('), src.indexOf('vec4 dustTube(DFrame F, vec3 lit'));
  assert.doesNotMatch(b, /for \(int kk|for \(int n = -N|dCell\(|dPart\(/, 'B has no ring loop, no cell scan and none of the lattice\'s particle');
  assert.equal((b.match(/for \(int q = 0; q < nQ; q\+\+\)/g) ?? []).length, 2, 'one lane loop in the tube and one in the skin, each bounded by the pixel\'s own count (never more than DUST_LANE_LOOK: dLaneSpan)');
  assert.equal((b.match(/for \(int tr = 0; tr < nTr; tr\+\+\)/g) ?? []).length, 2, 'and one train loop in each');
  assert.doesNotMatch(b, /for \(int (q|tr) = 0; \1 < (\d|\$\{)/, 'no lane or train loop has a constant bound: a driver unrolls it into copies of the whole particle path (look A\'s own comment)');
  assert.match(src, new RegExp(`min\\(floor\\(\\(i1 - i0\\) / stride\\) \\+ 1\\.0, ${DUST_LANE_LOOK}\\.0\\)`), 'the count is capped at DUST_LANE_LOOK');
  assert.ok(DUST_LANE_LOOK <= 12 && DUST_LANE_LOOK * 2 < DUST_KMAX * (2 * DUST_NMAX + 1) * 2, 'the most lanes a pixel looks at a segment is a third of the scan\'s cells');
  assert.match(src, /float cy = \(li \+ 0\.5 \+ \(lj - 0\.5\) \* D_laneJit\) \/ nL \* 2\.0 - 1\.0;/, 'a lane\'s centre across the root\'s section, jittered by hash');
  assert.match(src, /float jj = floor\(\(se - flowFig \* prof \* D_flowK\) \/ Pf \+ ph\);/, 'the cell: the lane\'s own speed (the lab\'s flat profile) carries it along the root\'s stream');
  assert.match(src, /P\.alive = clamp\(\(D_densK \* D_fill - dHash\(sd\)\) \* 12\.0, 0\.0, 1\.0\);/, 'density thins by a threshold: single streaks fade, nothing pops');
  assert.match(src, /P\.cf = 0\.5 \+ \(P\.h1 - 0\.5\) \* 0\.4;/); assert.match(src, /P\.se = \(jj - ph \+ P\.cf\) \* Pf \+ flowFig \* prof \* D_flowK;/, 'the streak is centred in its cell');
  assert.equal((src.match(/M\.len = min\(M\.len, max\(2\.0 \* dCellExt\(F, g, P\.cf\), M\.dia\)\);/g) ?? []).length, 1, 'the tube cuts the length to its cell');
  assert.match(src, /Mb\.len = min\(Mb\.len, max\(2\.0 \* dCellExt\(Fb, gb, P\.cf\), Mb\.dia\)\);/, 'and so does the skin, in both frames');
  assert.match(src, /return min\(cf, 1\.0 - cf\) \* max\(D_cellLen \* g\.rLat \* F\.U, 1e-4\) \/ \(abs\(Bs\) \* max\(F\.vRc, 1e-5\)\);/, 'the room a cell leaves: its length over this vessel\'s speed ratio and lumen');
  assert.match(src, /vec4 a = wB < 0\.999 \? dustTubeA\(F, lit, ink, rev\) : vec4\(0\.0\);\s+vec4 b = wB > 0\.001 \? dustTubeB\(F, lit, ink, rev\) : vec4\(0\.0\);\s+return a \* \(1\.0 - wB\) \+ b \* wB;/);
  assert.match(src, /vec4 a = wB < 0\.999 \? dustSkinA\(F0, F1, w1, lit, ink, rev\) : vec4\(0\.0\);/);
  // the shared parts are shared: the same section frame, strip map, wall rule and tones
  for (const shared of ['dMember(g, P.yl)', 'dPlace(F, g, mb.x, P)', 'dDraw(M, P, t0, t1, t2, t3, ink, rev)']) assert.ok(b.includes(shared), shared);
  assert.ok(DUST_LANES_MAX >= 48 && b.includes(`${DUST_LANES_MAX}.0)`), 'the lane count is bounded');
});

// 23 Nov, Mohammad: pixels of the page's colour in the shape of streaks at junctions, gone with dust off and with look A (the lattice scan), present with look B. Look B was the only code with a `break` out of a loop, an `out` struct
// parameter, an integer return value and float to int conversions of a computed bound: all of which A and the rest of the vessel shader avoid. The B code is written in A's shape (a value-returning function, `continue` only, floats for
// the lane numbers), so a driver that mishandles one of those never meets it here. (The cause on the device is not proven: this pins the shape, see docs/approved/dust.md.)
test('look B is written in the shape of look A: no break, no out parameter, no integer return, no float to int conversion', () => {
  const b = DUST_GLSL.slice(DUST_GLSL.indexOf('vec2 dLaneWinB('), DUST_GLSL.indexOf('vec4 dustTube(DFrame F, vec3 lit'));
  assert.doesNotMatch(b, /\bbreak\b/, 'a loop is left by continue (A\'s way), never by break');
  assert.doesNotMatch(b, /\bout\s+(DPart|float|vec)/, 'no out parameter: a function returns its value');
  const lane = b.slice(0, b.indexOf('vec4 dustTubeB('));
  assert.doesNotMatch(b, /ivec3/, 'no integer vector return'); assert.doesNotMatch(lane, /\bint\b/, 'no integer in the lane functions');
  assert.doesNotMatch(b, /int ln|ln = sp\.x \+ q/, 'the loop counter makes a float lane number, not an int');
  assert.match(b, /DPart dLanePart\(DSeg g, float li, float tr, float nL, float Pf, float se, float flowFig\) \{/);
  assert.match(b, /vec4 dLaneSpan\(DSeg g, vec2 win, float nL\) \{/);
});

test('the lane table gives up fewer lanes: more segments a vessel and finer slivers (real figure: 3 to 5 vessels of about 50 gave lanes away)', () => {
  assert.ok(SEG_MAX >= 8, `${SEG_MAX}`); assert.ok(SEG_MIN <= 0.006, `${SEG_MIN}`);
});

// the cost of look B on a phone: a lane's cell costs four hashes (centre, phase, alive, cf) until it is known to be in the pixel's reach; the other six hashes and the depth (dLaneFill) are worked out only for a streak that passes
// the lane's membership and the reach tests. (Same numbers as before, found later: node twin of the hashes in tests/dust-lanes.test.ts.)
test('look B hashes a streak in two steps: the cheap four first, the rest only for a streak within reach', () => {
  const src = DUST_GLSL;
  const part = src.slice(src.indexOf('DPart dLanePart('), src.indexOf('DPart dLaneFill('));
  assert.equal((part.match(/dHash\(/g) ?? []).length, 4, 'the lane part makes exactly four hashes');
  assert.match(part, /if \(P\.alive <= 0\.0\) return P;/, 'an empty cell stops after the alive hash');
  const fill = src.slice(src.indexOf('DPart dLaneFill('), src.indexOf('// half of the room'));
  assert.equal((fill.match(/dHash\(/g) ?? []).length, 6, 'the fill makes the other six');
  const b = src.slice(src.indexOf('vec4 dustTubeB('), src.indexOf('vec4 dustTube(DFrame F, vec3 lit'));
  assert.equal((b.match(/P = dLaneFill\(P\);/g) ?? []).length, 2, 'filled in the tube and in the skin');
  for (const part2 of b.split('P = dLaneFill(P);').slice(0, -1)) assert.match(part2, /dNear\(/, 'only after the reach test');
});

// ROOT CAUSE of the black blocks and specks at the junctions on the iPhone (Mohammad, 20 and 23 Nov): dSafe tested a NaN with a comparison (`dot(v, v) < 64.0`), which a phone GPU's fast maths folds away, so a NaN term of the dust
// went through, clamp() and the product with the wall left it a NaN, and the pixel was written as 0 0 0. A NaN is now found on its bits (the exponent all ones), in every particle and again on the dust the shader paints.
test('a NaN or an infinity in the dust is found on the bits, per particle and on what is painted', () => {
  assert.match(DUST_GLSL, /bool dBad\(vec4 v\) \{ return any\(equal\(floatBitsToUint\(v\) & uvec4\(0x7f800000u\), uvec4\(0x7f800000u\)\)\); \}/, 'an exponent of all ones is NaN or infinity, an integer test');
  assert.match(DUST_GLSL, /vec4 dSafe\(vec4 v\) \{ bool bad = dBad\(v\) \|\| dot\(v, v\) >= 64\.0;[^}]*return bad \? vec4\(0\.0\) : v; \}/);
  assert.equal((DUST_GLSL.match(/c = clamp\(dSafe\(c\), 0\.0, 1\.0\);/g) ?? []).length, 4, 'every particle of both looks, tube and skin');
  const src = fs.readFileSync(new URL('../src/scene/vessels/shaders.ts', import.meta.url), 'utf8') + fs.readFileSync(new URL('../src/scene/vessels/skin/shaders.ts', import.meta.url), 'utf8');
  assert.match(src, /fd = dSafe\(clamp\(dSafe\(fd\), 0\.0, 1\.0\) \* dHold\(fadeHere \* cavA\)\);/, 'the tube paints no NaN');
  assert.match(src, /dustAcc \*= dWall\(skinWall\([^\n]*\n\s*dustAcc = dSafe\(dustAcc\);/, 'the skin paints no NaN');
});

// The debug paint's first build never reached the shader: the select lives in the tuner's targets and the uniforms are derived from the eased NUMBERS, so `dbg` was always 0 and Mohammad's probes (23 Nov, "no green, no yellow
// anywhere") painted nothing. The code now travels with the weights; every choice of the select must reach its uniform, and the default must be off.
test('the debug paint reaches its uniform: every choice of the select, off by default', () => {
  const sel = DUST_SELECTS.find((r) => r[0] === 'dustDebug')!;
  const ix = DUST_UNIFORMS.indexOf('dbg');
  assert.ok(ix >= 0 && sel[3] === 'off');
  const t = new DustTuner(); t.snap();
  assert.equal(t.uniform.value[ix], 0, 'off unless asked');
  const seen = new Set<number>();
  for (const [v] of sel[2]) { t.set({ dustDebug: v }); t.step(16); seen.add(t.uniform.value[ix]!); }
  assert.equal(seen.size, sel[2].length, 'each choice is its own code');
  assert.ok(!seen.has(undefined as never) && [...seen].every((n) => Number.isInteger(n)));
  t.set({ dustDebug: 'off' }); t.step(16);
  assert.equal(t.uniform.value[ix], 0);
});

// A colour that is not a number never reaches the figure (the figure's texture reads a NaN back as 0 0 0 on a phone: a black block). The last word of the tube and of the skin is dFinite, with the tone before the dust as the fallback.
test('the tube and the skin end with a colour that is a number', () => {
  assert.match(DUST_GLSL, /vec3 dFinite\(vec3 c, vec3 fb\) \{ return dBad\(vec4\(c, 0\.0\)\) \? fb : c; \}/);
  const tube = fs.readFileSync(new URL('../src/scene/vessels/shaders.ts', import.meta.url), 'utf8');
  const skin = fs.readFileSync(new URL('../src/scene/vessels/skin/shaders.ts', import.meta.url), 'utf8');
  assert.match(tube, /c = dFinite\(c, dFinite\(cBody, vec3\(0\.5\)\)\);[\s\S]{0,260}gl_FragColor = vec4\(c, fadeHere \* cavA\);/);
  assert.match(skin, /c = dFinite\(c, dFinite\(cBody, vec3\(0\.5\)\)\);[\s\S]*gl_FragColor = vec4\(c, alpha\);/);
});

test('an alpha that is not a number is made whole before it is written (tube and skin)', () => {
  const tube = fs.readFileSync(new URL('../src/scene/vessels/shaders.ts', import.meta.url), 'utf8');
  const skin = fs.readFileSync(new URL('../src/scene/vessels/skin/shaders.ts', import.meta.url), 'utf8');
  assert.match(tube, /if \(dBad\(vec4\(fadeHere \* cavA\)\)\) \{ fadeHere = 1\.0; cavA = 1\.0; \}[^\n]*\n\s*gl_FragColor = vec4\(c, fadeHere \* cavA\);/);
  assert.match(skin, /if \(dBad\(vec4\(alpha\)\)\) alpha = 1\.0;[^\n]*\n\s*gl_FragColor = vec4\(c, alpha\);/);
});

// THE COST OF LOOK A (Mohammad, 25 Nov: "blood streaks cost a lot"): the scan reads K x (2N + 1) = 36 cells a pixel in every lane segment, and a cell used to work out all eight hashes, two pows and two trig calls before it was known to be
// empty (about two cells in three are) or out of reach. It now costs look B's way: the alive hash alone, then the lane (two more hashes and a cosine), and the other four hashes and the depth only for a particle that passed the lane and reach tests.
// Same numbers, found later, so the picture is the same; the class's band (two pows and the flat profile) is worked out once a class, not once a cell.
test('look A hashes a particle in two steps and works a class out once: the alive hash alone for an empty cell, the rest only for a particle within reach', () => {
  const src = DUST_GLSL;
  const first = src.slice(src.indexOf('DPart dPart('), src.indexOf('DPart dPartFill('));
  assert.equal((first.match(/dHash\(/g) ?? []).length, 4, 'step 1: the alive hash, then the three that place the particle (along, lane)');
  assert.match(first, /if \(P\.alive <= 0\.0\) return P;/, 'an empty cell stops after the alive hash');
  assert.doesNotMatch(first, /pow\(|sin\(/, 'no pow and no sine in a cell: the band is the class\'s and the depth is the fill\'s');
  const fill = src.slice(src.indexOf('DPart dPartFill('), src.indexOf('float dCell('));
  assert.equal((fill.match(/dHash\(/g) ?? []).length, 4, 'step 2: the other four hashes');
  assert.match(fill, /P\.zr = P\.rho \* sin\(P\.h2 \* 6\.2831853\);/, 'and the depth');
  assert.equal((src.match(/vec3 cls = dClassOf\(k\);/g) ?? []).length, 2, 'the tube and the skin take the class once, outside the cell loop');
  assert.equal((src.match(/pow\(/g) ?? []).length, 2, 'two pows in all, both in dClassOf (they were two in the cell and two in dCell)');
  const a = src.slice(src.indexOf('vec4 dustTubeA('), src.indexOf('vec3 dFind('));
  assert.match(a, /!dNear\(F, g, mb\.x, P\)\) continue;\s+P = dPartFill\(P\);\s+vec4 c = dDraw\(dPlace\(F, g, mb\.x, P\)/, 'the tube fills only after the lane and reach tests');
  const s = src.slice(src.indexOf('vec4 dustSkinA('), src.indexOf('// LOOK B, THE LANE STREAKS'));
  assert.match(s, /continue;   \/\/ \(out of reach in both frames: its blend is too\)\s+P = dPartFill\(P\);\s+DMark M = dPlace\(Fa, g, ma\.x, P\);/, 'and the skin after its reach test in both frames');
  for (const body of [a, s]) assert.ok(body.indexOf('P = dPartFill(P);') > body.indexOf('dNear('), 'never before the reach test');
});

// A pixel that ends under 0.05 of alpha shows no dust (dHold is 0 there), so the scan is not run for it: the same picture, and a veiled, faded or half-present vessel costs none of the dust.
test('the dust is not scanned for a pixel that dHold would hide', () => {
  assert.match(DUST_GLSL, /float dHold\(float a\) \{ return smoothstep\(0\.05, 0\.6, a\); \}/, 'dHold is 0 up to 0.05');
  const tube = fs.readFileSync(new URL('../src/scene/vessels/shaders.ts', import.meta.url), 'utf8');
  const skin = fs.readFileSync(new URL('../src/scene/vessels/skin/shaders.ts', import.meta.url), 'utf8');
  assert.match(tube, /vec4 fd = vec4\(0\.0\);\s+if \(fadeHere \* cavA > 0\.05\) fd = flowDust\(/, 'the tube scans only where its final alpha is over the hold');
  assert.match(skin, /if \(dOn > 0\.002 && alpha > 0\.05\) \{/, 'the skin too');
  assert.match(skin, /dustAcc \*= dHold\(alpha\);/, 'and the skin still holds the dust by that same alpha');
});
